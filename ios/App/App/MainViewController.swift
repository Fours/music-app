import Capacitor
import UIKit
import WebKit

/** The web view's controller, with Skyloom's own plugins registered. */
class MainViewController: CAPBridgeViewController {
    private var loading: NSKeyValueObservation?
    private var published: CGFloat = -1

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioSessionPlugin())
        // A reload starts a fresh page that hasn't heard the inset yet.
        loading = webView?.observe(\.isLoading) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.async {
                self?.published = -1
                self?.publishWindowControls()
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishWindowControls()
    }

    /**
     * In a resizable window on iPadOS 26, the close and resize controls sit in
     * the window's top-left corner, over the page's top bar. They aren't part
     * of the safe area the page sees through env(safe-area-inset-*), so the
     * room they need goes to the page as --window-controls (0px otherwise).
     */
    private func publishWindowControls() {
        var room: CGFloat = 0
        if #available(iOS 26.0, *) {
            let adapted = view.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal)).left
            room = max(0, adapted - view.safeAreaInsets.left)
        }
        guard room != published, let webView = webView else { return }
        published = room
        webView.evaluateJavaScript(
            "document.documentElement.style.setProperty('--window-controls', '\(Int(room.rounded()))px')"
        )
    }
}
