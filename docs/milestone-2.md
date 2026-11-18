# Milestone 2: Native fit

Source: [Skyloom for iPhone and iPad: plan](ios-app-plan.md), Milestones → 2, and the findings in [milestone 1](milestone-1.md) and [0001: Capacitor for the iOS app](decisions/0001-capacitor-for-ios.md).

## Outcome

Skyloom feels like an iPhone app rather than a website in a frame. It can play for an hour without heating the phone, recovers from interruptions, shares clips and recordings through the share sheet, and keeps saved scenes safe. The web version keeps working from the same code.

**Demo at the end:** play a busy scene for 30 minutes and show the phone is barely warm; switch the silent switch on and keep listening; take a call and come back to music; pull the AirPods out and see it pause; record a clip and send it to Photos from the share sheet.

## Scope

In scope: everything in the plan's milestone 2 outline, in the order of the tasks below. The first two tasks decide whether the rest is worth building on, so they come first.

Out of scope (later milestones):

| Item | Milestone |
| --- | --- |
| Developer account, App Store listing, TestFlight, testing on older devices | 4 |
| Landing page and launch | 5 |

Native code goes behind `Capacitor.isNativePlatform()` so the web build is unchanged unless a task says otherwise.

## Tasks

| Task | Status | Commit |
| --- | --- | --- |
| T1. Heat and frame rate | Done |  |
| T2. Native audio session and recovery | Done |  |
| T3. Share sheet for clips and recordings | Done |  |
| T4. Durable saves | Done |  |
| T5. Rename the app to Skyloom | Done |  |
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

- ~~A small native plugin sets the audio session to playback with mix-with-others, so Skyloom can play under music or podcasts.~~ Dropped: Skyloom doesn't mix with other audio ([0002](decisions/0002-no-mixing-with-other-audio.md)).
- Recover from interruptions natively: on `AVAudioSession.interruptionNotification` and on returning to the foreground, reactivate the session, then resume the page's audio. Confirm on the device that the clock watchdog from milestone 1 recovers the frozen-clock case, and how often it has to.
- Pause when headphones or AirPods disconnect (`routeChangeNotification` with reason `oldDeviceUnavailable`).
- Test calls, FaceTime and Siri, which milestone 1 skipped.
- Retest background playback, both locked and on the home screen, and measure battery over a long session.

**What's built.** `AudioSessionPlugin.swift`, registered by `MainViewController`, tells the page ([native-audio.ts](../src/app/native-audio.ts)) what the web view never hears:

- **Interruptions** (calls, Siri). Skyloom shows as paused, and plays again afterwards if iOS says to.
- **Headphones gone** (`oldDeviceUnavailable`). Skyloom pauses and says why. Reconnecting doesn't resume, as in other iOS apps.
- **Returning to the foreground.** The page restarts its audio, unless another app is playing: then it shows Skyloom as paused rather than taking the audio back.
- The audio server restarting, and the app's session being changed, both logged.

**Pausing suspends the audio.** Pause used to only fade the volume to zero, leaving the context running and playing silence. WebKit then stops counting Skyloom as playing (its log releases the media-playback assertion), so once the app is in the background iOS suspends the web view's processes. On return the context still said `running` with its clock stopped, and Play did nothing until the app was force-quit. Now Pause suspends the context once the fade ends (not while a recording or clip runs), and Play's tap resumes it. It also saves battery while paused.

Every event goes in the debug badge's audio log, with a count of interruptions. The badge's session line shows the app's session, the output, whether other audio is playing, and the web view's own `navigator.audioSession` type.

**Two sessions, and no mixing.** Skyloom's sound plays in WebKit's own media session, not the app's. The page sets that one to `playback`, as the website does. In the simulator, left on `auto`, WebKit picked Ambient while the app's session stayed `playback + mix`; on the device that went quiet with the silent switch. With `playback` the silent switch is ignored, but a podcast stops Skyloom, and WebKit offers nothing that does both. Mixing is dropped ([0002](decisions/0002-no-mixing-with-other-audio.md)). The app's session still mixes, because it only listens: it has to be active to hear interruptions, and a non-mixing one would stop a podcast as soon as Skyloom opened.

**Device results** (iPhone 14, badge on; note the badge's session line and audio log for each):

| Check | Expected | Result |
| --- | --- | --- |
| WebKit `auto` (since removed), silent switch on | | Silent |
| WebKit `playback`, silent switch on | Keeps playing | Keeps playing |
| WebKit `playback`, podcast started while Skyloom plays | Skyloom stops | Skyloom stops |
| Back to Skyloom while the podcast plays | Shows paused; Play takes the audio back |  |
| Phone call, answered then ended | Pauses for the call, plays again after | Yes |
| Phone call, declined | Plays again |  |
| FaceTime call | Pauses, plays again after |  |
| Siri | Pauses, plays again after | Yes |
| AirPods put in the case | Pauses with a message, stays paused when they come back | Pauses |
| Wired or Bluetooth headphones unplugged | Same |  |
| Pause, leave for the home screen or another app, come back, Play | Plays | Did nothing until force-quit; fixed, plays |
| Switching apps, 10 times | Plays on return; note any watchdog lines (quick restarts, rebuilds) |  |
| Screen locked 10 minutes | Keeps playing | Kept playing. The badge showed no away line; it now finds time away from the gap in frames instead of waiting for the page to say it was hidden |
| Home screen 10 minutes | Keeps playing | Kept playing: `away 10:34 · audio clock +10:34 · ticks 25369 of 25369 · longest gap 0.1 s` |
| Battery over an hour, locked, 7 objects | Percent used | 7% (75% to 68%). The phone alone on the home screen used 4.7% an hour in T1, so playing costs about 2–3% an hour on top |

**Done when:** Skyloom plays with the silent switch on and gives way to another app's audio; calls, Siri and AirPods behave as an iOS user expects; and background playback still holds.

### T3. Share sheet for clips and recordings

- Send WAV recordings and video clips to the share sheet (`@capacitor/share` and `@capacitor/filesystem`), replacing the temporary preview's note. If a preview stays before sharing, pause the scene while it plays and show the first frame instead of black.
- Encode WAV recordings in a worker, so stopping doesn't stall the music.
- Record clips on phones at a size and frame rate the phone can draw (they came out at about 25 of 30 fps), for example 720×1560 or 24 fps. Keep the 8-second stop timeout.

**What's built.** Record now opens a panel to pick audio or video (8c43d5d), so the Clip button is gone. In the iOS app, stopping opens the preview with a **Save or share** button:

- The file is written to the app's cache ([share.ts](../src/app/share.ts)) in 3 MB pieces of base64, so a long clip never crosses to the native side as one huge string, then handed to the share sheet. The cache is cleared before each new file and when the preview closes. Cancelling the sheet keeps the preview, so it can be shared again.
- `NSPhotoLibraryAddUsageDescription` is set, so Save Video asks to add to Photos instead of crashing the app. If that's refused, the share sheet only reports an error, so Skyloom says to allow it in Settings.
- The preview shows the clip's first frame (a still taken when recording starts, used as the poster; WebKit ignores `#t=` on a blob URL). Playing the preview pauses the scene, and Done plays it again.
- WAV encoding runs in a worker ([wav.worker.ts](../src/audio/wav.worker.ts)). In a desktop browser, encoding 2 minutes took 76 ms on the main thread; with the worker the page never stalled more than 5 ms, and the file came out byte for byte the same.
- Clips in the iOS app fit 1560 × 720 instead of 1920 × 1080 (718 × 1560 on an iPhone 17 Pro). Still 30 fps: the app draws at 30 fps, and a 24 fps clip can only take frames the app draws, so it would come out nearer 15. The 8-second stop timeout stays. The web build is unchanged and still downloads.

**Simulator check** (iPhone 17 Pro): an 8.7-second clip came out 718 × 1560 with 260 of 261 frames drawn (about 26 fps at the old size in milestone 1). The share sheet offered Save Video, Save to Files and Copy for the clip, and Save to Files and Use as Ringtone for a recording. A 9.4-second recording saved to Files as a valid WAV (stereo, 48 kHz). Save Video asked for Photos access with Skyloom's text; refusing showed the Settings message.

**Device results** (iPhone 14):

| Check | Expected | Result |
| --- | --- | --- |
| Clip → Save Video | In Photos, plays with sound | Passed |
| Clip → Save to Files | In Files, plays | Passed |
| Clip → Messages (or another app) | Sends, plays for the other person | Passed |
| Recording → Save to Files | In Files, plays | Passed |
| Recording → Messages (or another app) | Sends | Passed |
| Close the share sheet without sharing, then Share again | Opens again | Passed |
| Clip frames drawn (badge's preview details) | Close to 30 per second | Passed |
| A recording of 2 minutes or more, stopped while playing | The music doesn't stall while it saves | Passed |
| Play the preview, then Done | Scene pauses while it plays, plays again after | Passed |

**Not done:** On the web, phones could also use the browser's own share sheet (`navigator.share` with files) instead of downloading; not planned yet.

**Done when:** a clip and a recording can each be saved to Photos or Files and posted from the share sheet on the device.

### T4. Durable saves

Move the autosave from `localStorage` to `@capacitor/preferences`, since iOS can clear web storage when space is low, and migrate an existing saved scene on first launch.

**What's built.** [storage.ts](../src/app/storage.ts) reads and writes the autosave. The key is still `drift:scene`.

- In the iOS app the save goes to `@capacitor/preferences` (UserDefaults, stored as `CapacitorStorage.drift:scene`). The web build still uses `localStorage`.
- On the first launch after the update, a save found only in `localStorage` is copied to Preferences and then deleted from `localStorage`, so an old copy can't come back later and replace a newer one.
- Preferences can only be read asynchronously, so `app.restore()` loads the save and [main.tsx](../src/main.tsx) waits for it before the first render (up to 3 s, then the default scene). Autosave starts only after the restore, so the default scene can't overwrite the save while it loads.
- A change still saves 600 ms after the last edit, but a pending save now goes through straight away when the app goes to the background (Capacitor's `pause`), or when the page is hidden or closed. Saves are written one after another, so an older write can't land after a newer one.
- The debug switch, audio log and perf switches stay in `localStorage`: they're for debugging, and losing them costs nothing.

**Simulator check** (iPhone 17 Pro):

- **Migration:** the T3 build (which saves to `localStorage`) saved Hearth. After installing over it, the new build opened on Hearth. The save was in UserDefaults and no longer in `localStorage`.
- **Force-quit:** I switched to Open Sea, went to the home screen right away, and force-quit with `simctl terminate`. The app reopened on Open Sea.
- **Web:** a scene change survived a reload 50 ms later, which is inside the 600 ms autosave delay, so the save happened when the page closed.

**Device results** (iPhone 14):

| Check | Expected | Result |
| --- | --- | --- |
| Install over the T3 build without deleting the app | The scene from before loads | Passed |
| Change the scene, swipe the app away from the app switcher, reopen | The change is still there | Passed |

**Done when:** a scene saved before the update loads after it, and saves survive the app being force-quit.

### T5. Rename the app to Skyloom

The page title, welcome screen, README, and the names of recordings and clips (`drift-…` today). Keep the `drift:scene` storage key, or migrate it.

**What's built.** The welcome screen, top bar, page title and description, clip watermark (a54f729) and README (f332fb2) already said Skyloom, as did the iPhone's home screen. This task finished the rest:

- Recordings and clips are named `skyloom-<scene>-<date>-<time>` instead of `drift-…`.
- The drone and texture slider that sets how far they move is now **Wander** (its ends already read Still and Wandering). The saved field is still `drift`, so saves didn't need migrating.
- CREDITS.md, the comments in the sample scripts, and the debug global in development builds (`window.skyloom`) use the new name.
- Kept: the `drift:scene` storage key. Users never see it, and T4 had just moved saves to Preferences under it, so renaming it would only add a second migration. Also kept: ordinary uses of the word, such as "Drifting" at the slow end of the chime Speed slider and a scene description where music boxes "drift in and out of step".

**Simulator check** (iPhone 17 Pro): the drone inspector shows Wander. A recording of Open Sea was written for the share sheet as `skyloom-open-sea-20261117-1852.wav`. Clips take their name from the same line of code.

**Device results** (iPhone 14):

| Check | Expected | Result |
| --- | --- | --- |
| Share a clip to Files | Named `skyloom-…` | Passed |
| The scene saved before this update | Still loads | Passed |

**Done when:** "Drift" no longer appears anywhere a user can see, and old saves still load.

### T6. App icon, splash, safe areas, haptics

Replace Capacitor's default icon and launch screen, check safe areas and the status bar on iPhone and iPad, and add a light haptic tap when placing an object.

**Done when:** the app looks finished on an iPhone and in the iPad simulator.

### T7. Lock-screen controls

Play and pause and the scene name on the lock screen and in Control Center. Skyloom doesn't mix with other audio ([0002](decisions/0002-no-mixing-with-other-audio.md)), so this no longer needs a setting. iOS doesn't show these for apps whose session mixes, and the app's own (listening) session does while WebKit's doesn't, so check which one counts.

**Done when:** the controls work on the device.

### T8. Vertical clips

A 9:16 clip option for TikTok, Reels and Shorts.

**Done when:** a vertical clip records and shares on the device.

## Definition of done

- [ ] All tasks are Done.
- [ ] The milestone table in [ios-app-plan.md](ios-app-plan.md) is updated.
