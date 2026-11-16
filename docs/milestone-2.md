# Milestone 2: Native fit

Source: [Skyloom for iPhone and iPad: plan](ios-app-plan.md), Milestones → 2, and the findings in [milestone 1](milestone-1.md) and [0001: Capacitor for the iOS app](decisions/0001-capacitor-for-ios.md).

## Outcome

Skyloom feels like an iPhone app rather than a website in a frame. It can play for an hour without heating the phone, mixes with other apps' audio, recovers from interruptions, shares clips and recordings through the share sheet, and keeps saved scenes safe. The web version keeps working from the same code.

**Demo at the end:** play a busy scene for 30 minutes and show the phone is barely warm; play it under a podcast; take a call and come back to music; pull the AirPods out and see it pause; record a clip and send it to Photos from the share sheet.

## Scope

In scope: everything in the plan's milestone 2 outline, in the order of the tasks below. The first two tasks decide whether the rest is worth building on, so they come first.

Out of scope (later milestones):

| Item | Milestone |
| --- | --- |
| Developer account, App Store listing, TestFlight, testing on older devices | 3 |
| Landing page and launch | 4 |

Native code goes behind `Capacitor.isNativePlatform()` so the web build is unchanged unless a task says otherwise.

## Tasks

| Task | Status | Commit |
| --- | --- | --- |
| T1. Heat and frame rate | Done |  |
| T2. Native audio session and recovery | Not started |  |
| T3. Share sheet for clips and recordings | Not started |  |
| T4. Durable saves | Not started |  |
| T5. Rename the app to Skyloom | Not started |  |
| T6. App icon, splash, safe areas, haptics | Not started |  |
| T7. Lock-screen controls | Not started |  |
| T8. Vertical clips | Not started |  |

### T1. Heat and frame rate

The iPhone 14 gets very hot after about 10 minutes, and drawing reached only 79–89% of 60 fps (milestone 1, T4). Measure where the cost goes, then cut it.

Likely costs, all paid on every frame:

- Full-screen fills: the background gradient, each weather texture's colour wash, and the loudness glow are each painted across the whole canvas (about 1.3 million pixels at 2×), the washes blended with `multiply`, although each wash is only visible inside its circle.
- `backdrop-filter: blur(18px) saturate(1.3)` on the top-bar buttons, scene name, play button and tray. The canvas behind them moves, so every blur is redone each frame.
- The grain overlay, a full-screen layer blended with `multiply` over the moving canvas.
- Drawing at 60 fps when the motion is slow enough for 30.
- The audio: one synth per object and a long reverb. Locking the screen stops drawing, so CPU with the screen locked is the audio alone.

Steps:

1. Fixes with no visible change: paint each wash only inside its own square instead of the whole canvas.
2. Switches in the debug badge to compare on the device: a 30 fps cap, no backdrop blur, no grain, and 1× resolution (since removed). They're remembered on the device, and each tap restarts the badge's counts. The badge also shows how many frames a second are drawn and the script time per frame.
3. On the device, measure CPU per process in Instruments for each configuration, plus once with the screen locked (see How to measure).
4. Make the switches that are worth it the default, record the numbers here, and remove the switches that aren't needed.

**Where the cost is.** Drawing takes only about 0.1–0.3 ms of script time a frame. WebKit records the canvas commands and rasterizes them later in its own processes (web content and GPU), and the blur and grain are composited by the system's render server. None of that is in the app's own process, so Xcode's Debug navigator gauges, which show only that process, miss most of it.

**How to measure on the device:** in Xcode, Open Developer Tool → Instruments → Activity Monitor, pick the iPhone as the target and all processes, and record. For each configuration, play for 2 minutes and note the CPU of Skyloom, the two WebKit processes (their names contain WebContent and GPU), and `backboardd` (the render server, where blur and grain show up).

**Device results** (iPhone 14, plugged in, Instruments Activity Monitor; 12 objects in Rain on Glass (edited); the five runs back to back on one build, cooling between runs, Skyloom launched fresh just before each 2-minute recording; percent of one core = CPU time ÷ recording length):

| Configuration | WebKit GPU | WebKit content | Both |
| --- | --- | --- | --- |
| All off (as first shipped) | 94.2 s, 78% | 37.8 s, 31% | 109% |
| 30 fps | 48.8 s, 40% | 33.6 s, 28% | 68% |
| 30 fps, no blur, no grain | 46.2 s, 38% | 31.7 s, 26% | 64% |
| 30 fps and 1× | 37.3 s, 31% | 52.1 s, 43% | 74% |
| All off, screen locked (audio only) | 7.1 s, 6% | 97.2 s, 80% | 86% |

- **The 30 fps cap is the win.** It halves the GPU process and cuts the two together from 109% to 68% of a core, with no visible change to the slow motion. It's now the default in the iOS app (the web version still draws at 60). The badge's switch stays, so 60 fps can still be compared.
- **Blur and grain** made no difference beyond run-to-run spread in these two processes (46 vs 49 s). Their cost, if any, is in `backboardd`, which these runs didn't record. They stay until that's measured.
- **1×** takes another quarter off the GPU process but adds about 18 s to WebKit content, so it costs more in total, and it makes lines and text visibly softer. The simulator showed the same rise. The switch is removed.
- **Screen locked** is unexplained: the audio alone measured more CPU time in WebKit content than the whole app does with the screen on. Nothing in the app runs only while hidden (trails and ripples are pruned in the simulation, not the draw loop). The likely reason is that iOS moves the audio to the efficiency cores at a low clock when the screen is off, so the same work takes more CPU seconds but less energy. CPU time can't tell these apart; Instruments' Power Profiler, which reports energy, can.
- An earlier all-off run measured 6.1 s in WebKit content, and an earlier 30 fps run 2.14 minutes; both were on older builds, the second while the frozen-clock watchdog from milestone 1 kept firing. The watchdog now waits 3 seconds instead of 1.5, watches only while playing, rests 15 seconds after each attempt, stops after 3 rebuilds until Play is pressed, and keeps its log and counts in the badge across launches.

**30 minutes unplugged** (30 fps, blur and grain on): the thermal state reached Fair at 7 minutes and Serious at about 12, and the phone was very hot by the end (27:52). The 30 fps cap alone isn't enough.

**Power Profiler** (iPhone 14, unplugged, recorded on the phone with Settings → Developer → Performance Trace, about 2 minutes each, brightness 24%; read with `xctrace`):

| Configuration | Whole phone, battery per hour | Skyloom CPU impact | GPU impact | Display impact |
| --- | --- | --- | --- | --- |
| Playing, 30 fps | 29.0% (about 3.7 W) | 14.6 | 1.0 | 2.9 |
| Playing, 30 fps, no blur, no grain | 28.3% | 15.0 | 1.0 | 3.0 |
| Paused (still drawing) | 13.6% (about 1.7 W) | 4.9 | 1.0 | 3.0 |
| Home Screen | 4.7% (about 0.6 W) | | | |
| Playing, 30 fps, without `multiply` (833825b) | not measured: charging | 3.6 | 0.5 | 3.2 |
| The same, unplugged, first 2 minutes of the 30-minute run | 18% (about 2.3 W), with Instruments also recording over Wi-Fi | 3.4 | 1.0 | 2.9 |

- **The heat is CPU, not the GPU chip.** WebKit paints a 2D canvas with CoreGraphics on the CPU, in its GPU process. In the CPU samples, CoreGraphics there had 993 samples while playing against 411 while paused. Audio DSP (vDSP in WebKit content) was about 5% of samples, playing or paused.
- **The cause was `multiply` blending.** The texture washes, drone lobes and texture haze were painted with `multiply`, and so was the loudness glow, a full-screen gradient drawn only while music plays, which inherited the mode by accident. In the simulator the glow alone raised the GPU process from 25% to 38%, and turning `multiply` off everywhere took it from 24% to 11%. A blank canvas costs about 5%, so the canvas itself is cheap; what's painted on it is the cost.
- **Fix:** everything is painted with normal blending. Over the near-white paper, `multiply` with colour c looks the same as normal blending with paper × c, so those four fills use that colour (`onPaper()` in `palette.ts`). Drawing one fixed frame of every preset both ways: on average 0.1–0.7 of 255 apart without the loudness glow and 1–3 with it, where the old glow darkened the washes it lay over. Side by side they look the same.
- After the fix, in the simulator: the GPU process went from 25% to 11% on the welcome screen, and from 38% to 12% with the loudness glow on as while playing. On the iPhone, Skyloom's CPU impact while playing fell from 14.7 to 3.6, below the 5.0 it used to cost paused, and WebKit's GPU process from about 11 CPU samples a second to under 3. More of the remaining work ran on the efficiency cores (two thirds of samples, against a third before). That trace was recorded while charging, so it has no whole-phone power.
- **The display** used about 0.5 W in Skyloom against 0.1 W on the Home Screen at the same brightness. The iPhone 14's OLED screen spends power on a bright picture, and the paper is near-white. A dark sky would save part of that; it's a design decision for later.

**30 minutes unplugged, without `multiply`** (833825b, 30 fps, blur and grain on): the phone got warmer but not hot. The thermal state wasn't captured; the Power Profiler trace reports it as Unknown. Whole-phone power settled at 18% of the battery an hour after the first 10 seconds, against 29% before, and that includes Instruments recording over Wi-Fi at the same time (`sysmond` and `DTServiceHub`, about a fifth of all CPU samples).

What's left of Skyloom's cost is mostly WebKit content (WebCore, the audio's vDSP and JavaScript), now about 9.5 CPU samples a second against 3 for the GPU process. It counted 6.9 a second before the fix, likely because more of the work now runs on the slower efficiency cores. That's the place to look if more is needed.

**Simulator results** (iPhone 17 Pro simulator on this Mac, Morning Fog with 6 objects, 15 seconds each; percent of one Mac core; relative only):

| Configuration | App | WebKit content | WebKit GPU | Total |
| --- | --- | --- | --- | --- |
| All off (as shipped) | 2% | 16% | 58% | 76% |
| 30 fps | 2% | 16% | 35% | 53% |
| No blur | 2% | 16% | 58% | 76% |
| No grain | 2% | 16% | 57% | 75% |
| 1× | 3% | 18% | 25% | 46% |
| 30 fps and 1× | 3% | 23% | 16% | 42% |
| 30 fps, no blur, no grain | 2% | 18% | 33% | 54% |
| In the background (audio only) | 0% | 12% | 1% | 14% |

- Audio alone is about 14 of the 76 points, so **drawing is most of the cost**, as suspected.
- The 30 fps cap cuts the total by about 30% and 1× by about 40%. On the device, 1× moved work into WebKit content instead (see above).
- Blur and grain show no change here because the simulator composites them in the Mac's window server, which this doesn't measure. The device has to answer those two.
- Painting each texture wash only inside its own square is in; a pixel comparison found no visible difference (59 of 12.5 million colour values differed, by 1 of 255).

**Done when:**

- [x] CPU and Energy Impact are recorded for each configuration, and for the screen locked (audio only).
- [x] The defaults are chosen from those numbers, and anything that changes the look is noted.
- [x] A 7-object scene plays for 30 minutes unplugged without the phone getting hot.
- [x] 18 objects hold a steady 30 fps. The badge showed 29.9 fps drawn on the iPhone 14.

### T2. Native audio session and recovery

- A small native plugin sets the audio session to playback with mix-with-others, so Skyloom can play under music or podcasts. Check whether WebKit resets it when audio starts.
- Recover from interruptions natively: on `AVAudioSession.interruptionNotification` and on returning to the foreground, reactivate the session, then resume the page's audio. Confirm on the device that the clock watchdog from milestone 1 recovers the frozen-clock case, and how often it has to.
- Pause when headphones or AirPods disconnect (`routeChangeNotification` with reason `oldDeviceUnavailable`).
- Test calls, FaceTime and Siri, which milestone 1 skipped.
- Retest background playback with mixing on, both locked and on the home screen, and measure battery over a long session.

**Done when:** Skyloom plays under another app's audio; calls, Siri and AirPods behave as an iOS user expects; and background playback still holds.

### T3. Share sheet for clips and recordings

- Send WAV recordings and video clips to the share sheet (`@capacitor/share` and `@capacitor/filesystem`), replacing the temporary preview's note. If a preview stays before sharing, pause the scene while it plays and show the first frame instead of black.
- Encode WAV recordings in a worker, so stopping doesn't stall the music.
- Record clips on phones at a size and frame rate the phone can draw (they came out at about 25 of 30 fps), for example 720×1560 or 24 fps. Keep the 8-second stop timeout.

**Done when:** a clip and a recording can each be saved to Photos or Files and posted from the share sheet on the device.

### T4. Durable saves

Move the autosave from `localStorage` to `@capacitor/preferences`, since iOS can clear web storage when space is low, and migrate an existing saved scene on first launch.

**Done when:** a scene saved before the update loads after it, and saves survive the app being force-quit.

### T5. Rename the app to Skyloom

The page title, welcome screen, README, and the names of recordings and clips (`drift-…` today). Keep the `drift:scene` storage key, or migrate it.

**Done when:** "Drift" no longer appears anywhere a user can see, and old saves still load.

### T6. App icon, splash, safe areas, haptics

Replace Capacitor's default icon and launch screen, check safe areas and the status bar on iPhone and iPad, and add a light haptic tap when placing an object.

**Done when:** the app looks finished on an iPhone and in the iPad simulator.

### T7. Lock-screen controls

Play and pause and the scene name on the lock screen and in Control Center. iOS doesn't show these for apps that mix with other audio, so decide with T2's results whether this becomes a setting together with mixing.

**Done when:** the decision is recorded and, if it ships, the controls work on the device.

### T8. Vertical clips

A 9:16 clip option for TikTok, Reels and Shorts.

**Done when:** a vertical clip records and shares on the device.

## Definition of done

- [ ] All tasks are Done.
- [ ] The milestone table in [ios-app-plan.md](ios-app-plan.md) is updated.
