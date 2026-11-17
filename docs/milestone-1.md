# Milestone 1: Spike on a real device

Source: [Skyloom for iPhone and iPad: plan](ios-app-plan.md), Milestones → 1.

## Outcome

Drift runs as a Capacitor app on a real iPhone or iPad, and we know whether its audio, timing and performance hold up inside a WKWebView. The milestone ends with a go/no-go decision on Capacitor, written down with the evidence.

**Demo at the end:** install from Xcode onto a device, flip the silent switch, take a phone call or trigger Siri, lock the screen, and show what keeps playing. Record a clip on the device and show it plays back smoothly.

## Scope

In scope:

- A Capacitor iOS project in `ios/`, and scripts to build and open it
- Tests on a real device: silent switch, interruptions, route changes, background playback
- Performance on the oldest device we want to support, including clip recording
- A decision record with the go/no-go and the minimum iOS version

Out of scope (later milestones):

| Item | Milestone |
| --- | --- |
| Share sheet for recordings and clips | 2 |
| Lock-screen controls, interruption handling code | 2 |
| Durable saves, icon, splash, haptics, vertical clips | 2 |
| Developer account, App Store listing, TestFlight | 3 |
| Landing page and launch | 4 |

This is a spike. Fix only what's needed to measure something. Anything bigger becomes a note for milestone 2.

## Tasks

| Task | Status | Commit |
| --- | --- | --- |
| T1. Capacitor shell | Done | 20a5d6f |
| T2. Audio basics on a device | Done | 35d89eb |
| T3. Background playback | Done | 22c3f6c |
| T4. Performance and clips | Done | bb8399c |
| T5. Go/no-go record | Done |  |

### T1. Capacitor shell

- Add `@capacitor/core`, `@capacitor/cli` and `@capacitor/ios`, and run `npx cap init` and `npx cap add ios` with the display name Skyloom and the app ID `com.kylewillett.skyloom`. The ID can't change once the app is on the App Store, so it uses the final name even though the code still says Drift.
- Add `npm run ios`: build, `cap sync`, then open Xcode.
- Check that assets, samples and fonts load from the bundle with no network, and that the web build and dev server still work as before.

**Done when:**

- [x] The app builds and launches in the iOS Simulator (iPhone 17 Pro, iOS 26.5) and a scene plays.
- [x] The app builds and launches on a real device (iPhone 14, iOS 27.2, free Personal Team signing).
- [x] `npm run check:offline` passes: the build references no other hosts, and every file `index.html` links to is bundled.
- [x] With the device in airplane mode, every scene loads and plays.
- [x] `npm run build` and `npm run dev` behave as before.

**Findings:**

- Capacitor serves audio files (`.wav`, `.m4a`) with a bare response that has no HTTP status, so `fetch` reports status 0. Tone.js's loader treats that as a failure, so audio wouldn't start. `loadSample()` in `src/audio/engine.ts` now fetches and decodes the samples itself and accepts status 0.
- `MediaRecorder` and `canvas.captureStream` exist in the iOS web view (both Clip and Record show up). Whether clips record well is for T4.
- Capacitor's console bridge prints `Error` objects as `{}`. Use Safari's Web Inspector (Develop → Simulator or the device) to see real errors.
- The app icon and launch screen are still Capacitor's defaults. Replacing them is in milestone 2.

### T2. Audio basics on a device

Check each of these on a real device and record what happens in the decision record:

To see what the audio is doing, tap the Skyloom wordmark five times. A badge shows whether the audio context is running, the output level, the audio clock, and the last few changes, with times. Five more taps hide it.

- The silent switch on (the app already sets `navigator.audioSession.type = 'playback'`; confirm WKWebView honours it).
- A phone call or FaceTime, Siri, and another app starting audio: does Drift stop, and does it resume, or does the AudioContext stay suspended?
- Headphones unplugged and AirPods connected mid-play.
- Leaving the app and coming back.

**Done when:**

- [x] Each case above has a result (works, breaks, or works with a known fix). Calls and Siri were skipped and are marked untested.
- [x] Anything broken has a proposed fix noted for milestone 2.

**Findings so far:**

- **Leaving the app and coming back** (iPhone 14, iOS 27.2): sound played, but after going to the home screen and reopening the app it was silent. The iOS Simulator doesn't show this; audio resumes there. The likely cause is iOS stopping the web view's audio context when the app leaves the screen and not restarting it. `keepAudioAwake()` in `src/app/controller.ts` now restarts the context when the page is shown again or the context stops, falls back to the next tap if iOS refuses, and Play restarts it too. **Confirmed on the device:** sound comes back both when the app was left playing and when it was paused, sent to the home screen, reopened and played.
- **Silent switch:** works. Skyloom keeps playing with the switch on silent, as the `playback` audio session should.
- **Another app's audio:** works. Switching between Skyloom and another app playing audio behaves well. Skyloom and the other app stop each other, because the `playback` session doesn't mix, and Skyloom's sound comes back when you return to it.
- **AirPods disconnected:** breaks. When the AirPods go back in the case, Skyloom carries on through the phone's speaker after about a second. iOS apps are expected to pause when headphones go away, so music doesn't suddenly play out loud. The web view gets no event for this. **Fix for milestone 2:** a small native plugin that listens for the audio route changing because the old output went away (`AVAudioSession.routeChangeNotification` with reason `oldDeviceUnavailable`) and tells the page to pause. Pausing sets `playing` to false, so `keepAudioAwake()` won't restart it. It's not yet known whether the one-second gap is WebKit restarting the audio by itself or `keepAudioAwake()` doing it. The badge's log would show which.
- **Volume buttons:** work. They change Skyloom's volume.
- **Switching apps after unplugging** (reported after T4): with the app open while the phone charged, then unplugged, then several app switches, Play did nothing on return, with no sound and no animation. The animation runs on the audio clock once music has started, so the audio context stayed stopped. It happened again with the badge on: the context reported `running` while its clock stood still, so `resume()` had nothing to do. **Fix:** the controller now watches the clock while music plays and the page is visible. If it stops for 3 seconds while the context says it's running, it suspends and resumes the context, and if the clock still doesn't move, it rebuilds the audio engine on a new context (samples are cached) and reconnects the simulation. It rests 15 seconds after each attempt and stops after 3 rebuilds until Play is pressed, since a rebuild regenerates the reverb and is expensive; the first version, with none of these limits, fired repeatedly on the device during normal play (milestone 2, T1). The badge shows what it did, saved across launches. Tested in the browser by freezing the clock by hand, both playing and paused; **waiting on a device check.**
- **Phone call or FaceTime:** untested (skipped). Worth checking in milestone 2 alongside the interruption handling.
- **Siri:** untested (skipped). Same.
- **Mixing with other audio (decision, reversed in milestone 2 by [0002](decisions/0002-no-mixing-with-other-audio.md)):** Skyloom should mix in under other apps' audio, so people can play it under music or a podcast, instead of stopping them as it does now. The web view can't ask for this: `navigator.audioSession` offers `playback`, which doesn't mix, or `ambient`, which mixes but goes quiet with the silent switch. **For milestone 2:** set the iOS audio session natively to playback with the mix-with-others option. Two things to check then: whether WebKit keeps that setting or resets it when audio starts, and that a mixing app doesn't get the lock-screen Now Playing controls, so those and mixing may need to be a choice, for example a setting.

### T3. Background playback

- Add the `audio` background mode to `Info.plist`.
- Lock the screen while a busy scene plays (chimes, pulses, orbits, a texture) and listen for 10 minutes.
- The simulation runs on Tone's transport, which uses a worker timer. Note whether chimes and orbits keep playing in time, or whether only held sounds (drones, textures) carry on.
- With the debug badge on, coming back to the app adds a yellow line about the time away: how long, how far the audio clock ran, how many simulation steps ran out of how many expected, and the longest gap between steps. A stalled audio clock means sound stopped. Missing steps or a long gap mean chimes and orbits stopped or stuttered while held sounds carried on.

**Done when:**

- [x] We know whether music continues with the screen locked, and for how long.
- [x] We know whether timing stays steady in the background.
- [x] If it fails, the record lists the options (foreground-only v1, or a native audio engine) with a rough cost for each. Not needed: it passed.

**Findings:**

- **Screen locked for 11 minutes** (iPhone 14, iOS 27.2, `playback` session): the music played the whole time. The scene was Morning Fog (edited), with drones, chimes, pulses, orbits and a texture all on the canvas.
- The badge's line on return: `away 11:23 · audio clock +11:23 · ticks 27306 of 27308 · longest gap 0.1 s`. The audio clock kept pace with the wall clock, so sound never stopped. The simulation ran 99.99% of its expected steps, and the longest gap between steps matched what the badge shows in the foreground (Tone's worker timer fires about every 50 ms). So chimes and orbits kept time, not just the held sounds.
- The badge's log showed only `page hidden` and `page visible`, with no audio state changes in between: iOS never suspended the context, and `keepAudioAwake()` had nothing to do.
- **Not tested:** the app sent to the home screen instead of locked (expected to behave the same, since iOS treats both as background), and battery use over a long session. Both are worth a look in milestone 2.
- **Recheck in milestone 2:** this ran with the web view's `playback` session. Once the session is set natively to mix with other audio, confirm background playback still holds, since lock-screen controls and mixing may become a setting.

### T4. Performance and clips

- On the oldest device we want to support, play the busiest scene for 5 minutes and watch for dropped frames and audio glitches.
- Record a 30-second clip on the device. Check that `MediaRecorder` and `canvas.captureStream` work in WKWebView, which format comes out, and whether the video stutters.

The only device is an iPhone 14 (A15, 60 Hz screen, iOS 27.2), so it's the baseline. Older devices stay untested and T5 says so.

**How to measure:**

- The debug badge has two blue lines. The first is frames: the frame rate over the last second, the average since the counts started (and what share of 60 that is), and the slowest single frame. The second is audio timing: how many 25 ms simulation steps ran after their notes were due (each is a likely click or late note), the longest gap between steps, the object count, and how long the counts have run. Tap the badge to restart the counts, for example once a scene has loaded.
- In the iOS app, finishing a clip or a recording opens a preview that plays it and lists the format, size, length, resolution and, for clips, how many frames were drawn out of the 30 per second expected. Download links do nothing in a WKWebView, so this stands in until the share sheet in milestone 2. The web build still downloads.

**Runs:**

1. Rain on Glass, the largest scene (7 objects), for 5 minutes. Tap the badge once it has loaded.
2. A stress run: add objects by hand to about 15 (3 of each kind), restart the counts, and play for 2 minutes.
3. A 30-second clip of Rain on Glass. Play it back in the preview and watch for stutter or audio drift.

**Simulator check** (iPhone 17 Pro, iOS 26.5; not a measure of device performance): Morning Fog ran at 60 fps with no late steps. While a clip recorded it fell to about 26 fps, and 362 of 419 frames were drawn, since the simulator encodes video in software. The clip came out as MP4 (H.264 and AAC, `avc1.640028`), 884×1920, 9.5 MB for 14 seconds, and played back with sound and the watermark. A 9-second recording came out as a 1.8 MB WAV and played.

**Done when:**

- [x] Frame rate and any audio dropouts are noted for the busiest scene.
- [x] A 30-second clip records on the device, and its format and smoothness are noted.
- [x] Any fix needed (lower clip resolution, fewer effects on older devices) is noted for milestone 2.

**Findings** (iPhone 14, iOS 27.2):

| Run | Objects | Time | Frames | Audio timing |
| --- | --- | --- | --- | --- |
| 1. Rain on Glass | 7 | 5:05 | 53.5 fps average (16,329 frames), slowest 26 ms | 0 late of 12,207 steps, longest gap 0.07 s |
| 2. Stress | 18 | 2:02 | 47 fps average (5,778 frames), slowest 35 ms | 0 late of 4,898 steps, longest gap 0.07 s |

- **Audio holds up.** No step ran late in either run, even with 18 objects, and the longest gap between steps matched the simulator's. The audio side of the web view has room to spare.
- **Drawing falls short of 60 fps and gets slower with more objects:** about 89% of 60 with 7 objects and 79% with 18. The slowest frames stayed under 40 ms, so there are no freezes, just less smooth motion. The first version of the badge counted only 1 dropped frame in run 1, because frames arrived every 18–26 ms and each rounded to a single frame. It now compares frames drawn with the time they span.
- **The phone got very hot in the stress run.** It was charging and had already been playing for 7 minutes, which adds to it, but heat matters for an app meant to play for a long time: it drains the battery, and iOS slows down hot apps. The likely costs are the drawing (each object's large soft radial-gradient glows, many blended with `multiply`, and the `backdrop-filter` blur on the tray and top bar, which has to be redone every frame over a moving canvas) and the audio (18 synths plus reverb). The split wasn't measured; see milestone 2 below.
- **Clip:** the first try stuck on "Saving…" because the recorder never fired its `stop` event. The phone was hot from the earlier runs, which may be why. Stopping now gives up after 8 seconds and says why, and a recorder that fails or stops early is reported in the preview. The second try, with the phone cool and unplugged, worked: 32.8 seconds of Rain on Glass as MP4 (H.264 and AAC, `avc1.640028`), 888×1920, 11.4 MB (about 2.8 Mbps; the encoder used far less than the 8 Mbps allowed, since the scene moves slowly). 819 of 984 frames were drawn, so the clip runs at about 25 fps instead of 30. Played back in the preview it looked smooth, with the sound in sync.
- **Audio recording:** a 31-second recording came out as a 6.0 MB WAV and played back correctly. Stopping it caused one 206 ms frame and 5 late steps: converting to WAV runs on the main thread for longer than Tone's 120 ms of look-ahead, so the scene may click once at that moment. The recording itself isn't affected. The same run showed an 8-second gap in the simulation that wasn't explained (most likely a pause and play).
- **Not tested:** older devices (none available) and the CPU split between drawing and audio.

**For milestone 2:**

- **Heat and frame rate:** measure CPU and energy in Xcode's Debug navigator with the screen on and with it locked (locked is audio alone), then: cap drawing at 30 fps, since the motion is slow; make the glows cheaper (fewer gradients, or draw each glow once to an offscreen canvas and reuse it); drop `backdrop-filter` over the canvas; and if audio turns out to dominate, lower the object limits on phones.
- **Clips:** lower the clip resolution on phones (for example 720×1560) or record at 24 fps so drawing keeps up. Keep the stop timeout, and find out whether the hang comes back.
- **Recordings:** encode the WAV in a worker so stopping doesn't stall the music.
- **Preview:** pause the scene while a recording or clip plays back, and resume when it closes. With the share sheet, playback may move out of the app entirely. The video preview is black until you press play; show the first frame.

### T5. Go/no-go record

Write `docs/decisions/0001-capacitor-for-ios.md`: the context, the decision, the alternatives, the evidence from T2–T4, and the consequences.

**Done when:**

- [x] The record says go or no-go on Capacitor, with the evidence.
- [x] It names the minimum iOS version and the oldest supported device.
- [x] The milestone 2 outline in the plan is updated with anything the spike found.

**Result:** [0001: Capacitor for the iOS app](decisions/0001-capacitor-for-ios.md) says **go**. The minimum is iOS 17, now set as the deployment target in the Xcode project (it was 15.0, below the Safari 16.4 that Vite builds for). The oldest supported devices are the iPhone XS and XR and the 6th-generation iPad; only the iPhone 14 is tested.

## Definition of done

- [x] All tasks are Done.
- [x] The milestone table in [ios-app-plan.md](ios-app-plan.md) is updated.
