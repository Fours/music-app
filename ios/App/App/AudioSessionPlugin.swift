import AVFoundation
import Capacitor
import UIKit

/**
 * Owns the iOS audio session for Skyloom.
 *
 * The web view can only ask for `playback`, which stops other apps' audio, or
 * `ambient`, which goes quiet with the silent switch. Skyloom wants playback
 * that mixes, so it can play under music or a podcast. That needs the session
 * set natively, and kept that way if WebKit changes it when audio starts.
 *
 * It also tells the page about what the web view never hears: interruptions
 * (calls, Siri), headphones going away, and the app coming back to the
 * foreground, so the page can pause or restart its audio.
 *
 * Events: `interruption` { phase, shouldResume, reason }, `headphonesGone`,
 * `foreground`, `sessionReset` { was }, `mediaReset`.
 */
@objc(AudioSessionPlugin)
public class AudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSessionPlugin"
    public let jsName = "AudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "apply", returnType: CAPPluginReturnPromise),
    ]

    private let session = AVAudioSession.sharedInstance()
    private let category: AVAudioSession.Category = .playback
    private let options: AVAudioSession.CategoryOptions = [.mixWithOthers]

    override public func load() {
        configure()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(onInterruption(_:)),
                           name: AVAudioSession.interruptionNotification, object: session)
        center.addObserver(self, selector: #selector(onRouteChange(_:)),
                           name: AVAudioSession.routeChangeNotification, object: session)
        center.addObserver(self, selector: #selector(onMediaReset(_:)),
                           name: AVAudioSession.mediaServicesWereResetNotification, object: session)
        center.addObserver(self, selector: #selector(onForeground(_:)),
                           name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Calls from the page

    /** What the debug badge shows. */
    @objc func getState(_ call: CAPPluginCall) {
        let outputs = session.currentRoute.outputs.map { $0.portName }
        call.resolve([
            "category": shortName(session.category),
            "options": optionNames(session.categoryOptions),
            "mixing": session.categoryOptions.contains(.mixWithOthers),
            "otherAudio": session.isOtherAudioPlaying,
            "output": outputs.joined(separator: ", "),
        ])
    }

    /**
     * Puts the session back to playback-with-mixing if something changed it.
     * The page calls this right after starting its audio, which is when WebKit
     * would change it. `was` is the session it found, so the device run shows
     * whether WebKit interferes.
     */
    @objc func apply(_ call: CAPPluginCall) {
        let was = describe()
        let reapplied = !isOurs()
        if reapplied { configure() }
        call.resolve(["reapplied": reapplied, "was": was])
    }

    // MARK: - Session

    private func isOurs() -> Bool {
        session.category == category && session.categoryOptions == options
    }

    private func configure() {
        do {
            try session.setCategory(category, mode: .default, options: options)
            try session.setActive(true)
        } catch {
            CAPLog.print("[AudioSession] could not configure: \(error.localizedDescription)")
        }
    }

    private func activate() {
        do {
            try session.setActive(true)
        } catch {
            CAPLog.print("[AudioSession] could not activate: \(error.localizedDescription)")
        }
    }

    // MARK: - Notifications

    @objc private func onInterruption(_ note: Notification) {
        guard let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            var reason = "default"
            if let r = info[AVAudioSessionInterruptionReasonKey] as? UInt,
               let why = AVAudioSession.InterruptionReason(rawValue: r) {
                reason = reasonName(why)
            }
            notifyListeners("interruption", data: ["phase": "began", "reason": reason])
        case .ended:
            let raw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let shouldResume = AVAudioSession.InterruptionOptions(rawValue: raw).contains(.shouldResume)
            if !isOurs() { configure() } else { activate() }
            notifyListeners("interruption", data: ["phase": "ended", "shouldResume": shouldResume])
        @unknown default:
            break
        }
    }

    @objc private func onRouteChange(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        switch reason {
        case .oldDeviceUnavailable:
            // Headphones unplugged or AirPods put away: iOS apps pause rather than play out loud.
            notifyListeners("headphonesGone", data: [:])
        case .categoryChange:
            guard !isOurs() else { return }
            let was = describe()
            configure()
            notifyListeners("sessionReset", data: ["was": was])
        default:
            break
        }
    }

    @objc private func onMediaReset(_ note: Notification) {
        // The audio server restarted and every session was lost.
        configure()
        notifyListeners("mediaReset", data: [:])
    }

    @objc private func onForeground(_ note: Notification) {
        if !isOurs() { configure() } else { activate() }
        notifyListeners("foreground", data: [:])
    }

    // MARK: - Names for the debug badge

    private func describe() -> String {
        let opts = optionNames(session.categoryOptions)
        return opts.isEmpty ? shortName(session.category) : "\(shortName(session.category)) + \(opts.joined(separator: " + "))"
    }

    private func shortName(_ c: AVAudioSession.Category) -> String {
        c.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: "").lowercased()
    }

    private func optionNames(_ o: AVAudioSession.CategoryOptions) -> [String] {
        var names: [String] = []
        if o.contains(.mixWithOthers) { names.append("mix") }
        if o.contains(.duckOthers) { names.append("duck") }
        if o.contains(.interruptSpokenAudioAndMixWithOthers) { names.append("interrupt spoken") }
        if o.contains(.allowBluetoothA2DP) { names.append("a2dp") }
        if o.contains(.allowAirPlay) { names.append("airplay") }
        if o.contains(.defaultToSpeaker) { names.append("speaker") }
        return names
    }

    private func reasonName(_ r: AVAudioSession.InterruptionReason) -> String {
        switch r {
        case .default: return "default"
        case .builtInMicMuted: return "mic muted"
        case .routeDisconnected: return "route disconnected"
        default: return "other (\(r.rawValue))"
        }
    }
}
