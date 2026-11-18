# 0001: Capacitor for the iOS app

- **Status:** Accepted
- **Date:** 2026-11-14
- **Evidence:** [milestone 1 spike](../milestone-1.md), tasks T1–T4

## Context

Skyloom (Drift in the code) is a web app: React for the interface, a 2D canvas for the sky, and Tone.js for the music. We want it on the App Store for iPhone and iPad without keeping two code bases.

[Capacitor](https://capacitorjs.com) runs the web app inside a WKWebView, with native plugins for what the web can't do. The risk was audio. iOS is strict about audio in web views: the silent switch, interruptions, background playback, and timing when the main thread is busy. If any of these failed badly, the plan fell back to playing only while the app is open, or to a native audio engine. Milestone 1 was a spike to find out on a real device before building anything else.

## Decision

**Go.** Build the iOS app with Capacitor, from the same code base as the web version.

- **Minimum iOS version: 17.0.** Vite builds for Safari 16.4 and later, so anything older could install the app and show a blank page. iOS 17 adds little risk over 16.4 and drops the iPhone 8 and X, whose A11 chips would likely struggle given the frame rates below.
- **Supported devices:** everything that runs iOS 17. The oldest are the iPhone XS, XS Max and XR (A12, 2018), the iPhone SE (2nd generation), and the iPad (6th generation, A10).
- **Tested device:** only an iPhone 14 (A15, iOS 27.2). Older iPhones and every iPad are untested. Milestone 4 (App Store ready) should recruit TestFlight testers with an iPhone XS or XR and a 6th-generation iPad.

## Evidence

All on the iPhone 14 unless noted.

| Area | Result | Task |
| --- | --- | --- |
| Offline | Every scene loads and plays in airplane mode. Capacitor serves audio files without an HTTP status, so samples are now loaded by our own `loadSample()`. | T1 |
| Silent switch | Keeps playing. | T2 |
| Leaving and returning | Silent on return at first. Fixed by restarting the audio context when the page shows again, with Play and the next tap as fallbacks. | T2 |
| Other apps' audio | Skyloom and the other app stop each other, because the web view's `playback` session doesn't mix. Mixing was wanted then; [0002](0002-no-mixing-with-other-audio.md) drops it. | T2 |
| AirPods removed | Carries on through the speaker. Needs a native route-change plugin to pause. | T2 |
| Calls and Siri | Not tested. | T2 |
| Screen locked | Played for 11 minutes with timing intact: the audio clock kept pace and 27,306 of 27,308 simulation steps ran. | T3 |
| Audio timing under load | No step ran late in 5 minutes with 7 objects or in 2 minutes with 18. | T4 |
| Drawing | 53.5 fps average with 7 objects and 47 fps with 18, out of 60. No freezes (slowest frame 35 ms). The phone got very hot in the 18-object run, while charging. | T4 |
| Clips | MP4 (H.264 and AAC) at 888×1920, about 25 fps, smooth with the sound in sync. One attempt hung on "Saving…" while the phone was hot; stopping now times out and says why. | T4 |
| Recordings | WAV, plays back. Converting it stalls the main thread for about 0.2 s, enough for a few late notes. | T4 |
| After switching apps | Reported twice after T4: Play did nothing, with no sound and no animation. The context said `running` but its clock had stopped. The app now watches the clock and restarts or rebuilds the audio engine; this still needs confirming on the device. | T2 |

The pattern: the audio engine itself is solid, timing included. The weak points are around it: how iOS stops and restarts a web view's audio (interruptions, route changes, mixing), and the cost of drawing.

## Alternatives considered

- **A native app** (Swift, with AVAudioEngine or AudioKit for sound and SpriteKit or Metal for drawing). The best performance and full control of the audio session, and it opens the door to an AUv3 plugin. But it means rewriting the synths, the simulation and the interface, and keeping two code bases in step. The spike didn't find a problem that only this solves.
- **Native audio, web drawing.** Rewrite only the audio in Swift. This was the fallback if background playback failed. It didn't fail, and the audio engine was the part that held up best, so this would rewrite the wrong half.
- **A web app added to the home screen, with no App Store listing.** No rewrite at all, but no App Store presence, which the launch plan depends on, and no native plugins for the audio session, sharing or durable saves.
- **Another web-view wrapper** (for example React Native with a WebView). The same WKWebView underneath, so the same performance, with less of a plugin ecosystem for sharing, files and preferences.

## Consequences

Good:

- One code base for the web and iOS. Milestone 2 is mostly small native plugins and tuning, not a rewrite.
- Clips and recordings already work in the web view and only need the share sheet to leave the app.

Costs and risks:

- **Drawing and heat.** The canvas has to get cheaper: cap it at 30 fps, simplify the glows, and remove the blur over the canvas. Measure CPU in Xcode first to confirm that drawing, not audio, is what heats the phone.
- **Audio lifecycle needs native help.** A native audio session (mixing with other apps), interruption recovery, and pausing when headphones disconnect each need a small plugin, and WebKit may fight some of them.
- **Older devices are unknown.** The iPhone 14's frame rate leaves little headroom for an A12 iPhone or an A10 iPad.
- **Debugging** happens in Safari's Web Inspector, and web storage can be cleared by iOS, so saves move to native preferences.

## When to revisit

- After milestone 2's drawing changes, a 7-object scene still makes an iPhone 14 hot over 30 minutes, or an A12 iPhone can't hold 30 fps. Then consider drawing natively while keeping the web audio.
- WebKit resets the native mix-with-others session and it can't be kept, or audio can't be reliably restarted after interruptions even with a native plugin. Then consider native audio.
