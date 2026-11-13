# Milestone 1: Spike on a real device

Source: [Drift for iPhone and iPad: plan](ios-app-plan.md), Milestones → 1.

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
| T1. Capacitor shell | Not started |  |
| T2. Audio basics on a device | Not started |  |
| T3. Background playback | Not started |  |
| T4. Performance and clips | Not started |  |
| T5. Go/no-go record | Not started |  |

### T1. Capacitor shell

- Add `@capacitor/core`, `@capacitor/cli` and `@capacitor/ios`, and run `npx cap init` and `npx cap add ios` (app ID such as `com.kylewillett.drift`).
- Add `npm run ios`: build, `cap sync`, then open Xcode.
- Check that assets, samples and fonts load from the bundle with no network, and that the web build and dev server still work as before.

**Done when:**

- [ ] The app builds and launches in the iOS Simulator and on a real device.
- [ ] With the device in airplane mode, every scene loads and plays.
- [ ] `npm run build` and `npm run dev` behave as before.

### T2. Audio basics on a device

Check each of these on a real device and record what happens in the decision record:

- The silent switch on (the app already sets `navigator.audioSession.type = 'playback'`; confirm WKWebView honours it).
- A phone call or FaceTime, Siri, and another app starting audio: does Drift stop, and does it resume, or does the AudioContext stay suspended?
- Headphones unplugged and AirPods connected mid-play.
- Leaving the app and coming back.

**Done when:**

- [ ] Each case above has a result (works, breaks, or works with a known fix).
- [ ] Anything broken has a proposed fix noted for milestone 2.

### T3. Background playback

- Add the `audio` background mode to `Info.plist`.
- Lock the screen while a busy scene plays (chimes, pulses, orbits, a texture) and listen for 10 minutes.
- The simulation runs on Tone's transport, which uses a worker timer. Note whether chimes and orbits keep playing in time, or whether only held sounds (drones, textures) carry on.

**Done when:**

- [ ] We know whether music continues with the screen locked, and for how long.
- [ ] We know whether timing stays steady in the background.
- [ ] If it fails, the record lists the options (foreground-only v1, or a native audio engine) with a rough cost for each.

### T4. Performance and clips

- On the oldest device we want to support, play the busiest scene for 5 minutes and watch for dropped frames and audio glitches.
- Record a 30-second clip on the device. Check that `MediaRecorder` and `canvas.captureStream` work in WKWebView, which format comes out, and whether the video stutters.

**Done when:**

- [ ] Frame rate and any audio dropouts are noted for the busiest scene.
- [ ] A 30-second clip records on the device, and its format and smoothness are noted.
- [ ] Any fix needed (lower clip resolution, fewer effects on older devices) is noted for milestone 2.

### T5. Go/no-go record

Write `docs/decisions/0001-capacitor-for-ios.md`: the context, the decision, the alternatives, the evidence from T2–T4, and the consequences.

**Done when:**

- [ ] The record says go or no-go on Capacitor, with the evidence.
- [ ] It names the minimum iOS version and the oldest supported device.
- [ ] The milestone 2 outline in the plan is updated with anything the spike found.

## Definition of done

- [ ] All tasks are Done.
- [ ] The milestone table in [ios-app-plan.md](ios-app-plan.md) is updated.
