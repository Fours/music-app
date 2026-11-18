# Skyloom for iPhone and iPad: plan

## Goal

Ship Drift as **Skyloom**, a universal iPhone and iPad app on the App Store, built from the same web code base, with enough native polish that it feels like an app and not a website in a frame. Then launch it in a way that gets it in front of people without paid ads.

Success for a first release:

- Approved on the App Store, on iPhone and iPad.
- Music keeps playing with the silent switch on, through interruptions (calls, Siri, other apps), and ideally with the screen locked.
- Recordings and clips go to the share sheet, so they can be saved to Photos or Files or posted directly.
- A launch that reaches the iOS music and ambient communities, with clips doing most of the promotion.

## Name

The app ships as **Skyloom**, listed as "Skyloom: Ambient Music Maker" (28 of the 30 characters Apple allows). It's still called Drift in the code and on the web until the rename task in milestone 2.

Why not Drift: a music app called "Drift - Shape Shifter" is already on the App Store, Drift.com uses the name for business software, and searching "drift" returns car racing games. Why Skyloom: you weave sound across a sky, and no App Store app uses the name.

Checks done on 2026-11-13:

- **App Store:** no app with "Skyloom" in its title (US store).
- **USPTO:** the one live registration in class 9 (software and electronics) belongs to Skyloom Global Corp., a satellite telecom company that IonQ acquired in 2025. It covers telecom hardware and chip design, not software or audio. A pending clothing application (Bella + Canvas, class 25) and two dead records don't overlap either.
- **Web:** no music or ambient product uses the name. A small Minecraft mod does.
- **Domains:** skyloom.com and skyloom.app are taken. Use a subdomain of kylewillett.com or a variation such as skyloommusic.com.

Still to do: a quick look in [WIPO's Global Brand Database](https://branddb.wipo.int) for registrations outside the US, and reserving the name in App Store Connect as early as milestone 4 allows. App Store search doesn't show reserved but unreleased names, so this is the final check. Names that were considered and rejected: Skychord (a dormant registration owned by a synth and drone-machine maker), Windharp, Small Weather, Driftglass and Ambiloom.

## Approach

Wrap the existing Vite + React + Tone.js app with [Capacitor](https://capacitorjs.com). The app runs in a WKWebView, and small native plugins cover what the web can't do well (sharing files, the audio session, lock-screen controls, saved data).

Capacitor first, because it reuses everything already built and keeps the web version and the app as one code base. The main risk is audio inside WKWebView, especially playback with the screen locked. Milestone 1 is a spike that tests exactly that on a real device before anything else is built. If it fails badly, the fallback options are:

1. **Foreground only for v1.** Music plays while the app is open, like most creative tools. Simplest, but weaker for people who want to fall asleep to it.
2. **Native audio engine.** Rewrite the audio in Swift (AVAudioEngine or AudioKit) and keep the canvas in the web view. Large job, but it also opens the door to AUv3 later.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Spike: Capacitor shell, audio on a real device, background playback, performance, go/no-go | Done: go with Capacitor ([decision](decisions/0001-capacitor-for-ios.md)) — [spec](milestone-1.md) |
| 2 | Native fit: heat and frame rate, audio session and interruptions, share sheet, durable saves, rename to Skyloom, icon and splash, lock-screen controls, vertical clips | In progress — [spec](milestone-2.md) |
| 3 | Your own instruments: sampled instruments for chimes, pulses and orbits, a pipeline for your recordings, loading on demand, a sound picker for 5 to 8 choices | Not started — [spec](milestone-3.md) |
| 4 | App Store ready: developer account, name, screenshots and preview, privacy policy and label, TestFlight beta, submission | Not started |
| 5 | Launch: landing page, featuring nomination, community launch, short videos, App Store keywords, review of results | Not started |

### 2. Native fit (outline)

Milestone 1 found the audio engine solid and the drawing and audio lifecycle weak (see the [decision record](decisions/0001-capacitor-for-ios.md)). Start with the first two items: they decide whether the rest is worth building on.

- **Drawing cost and heat.** First measure CPU and energy in Xcode's Debug navigator with the stress scene playing, screen on and then locked (locked is the audio alone). Then cap drawing at 30 fps, since the motion is slow; make the glows cheaper (fewer radial gradients, or draw each glow once to an offscreen canvas and reuse it); and drop the `backdrop-filter` blur over the canvas. If audio turns out to dominate, lower the object limits on phones. Target: a 7-object scene for 30 minutes without the phone getting hot, and 30 fps steady with 18 objects.
- **Audio recovery after interruptions.** After switching apps, Play twice did nothing: the context said `running` but its clock had stopped, so there was no sound and no animation. A clock watchdog now kicks the context and, failing that, rebuilds the engine (see milestone 1, T2). Confirm on the device that it recovers, and how often it has to. The deeper fix goes with the native audio session below: listen for `AVAudioSession.interruptionNotification` and reactivate the session when the interruption ends or the app returns to the foreground, so the context doesn't freeze in the first place. If a rebuild happens without a tap and the new context starts suspended, tell the user to tap rather than leaving them with silence.

- Rename the app to Skyloom: the wordmark, page title, welcome screen, clip watermark, README, and the names of downloaded recordings and clips. Keep the `drift:scene` storage key, or migrate it, so existing saved scenes still load.
- Share sheet for WAV recordings and video clips (`@capacitor/share` and `@capacitor/filesystem`). Download links don't work in a WKWebView.
- A native audio plugin for interruptions and route changes. Skyloom doesn't mix with other apps' audio after all: WebKit can't both mix and ignore the silent switch (see [0002](decisions/0002-no-mixing-with-other-audio.md)).
- Pause when headphones or AirPods disconnect, through a small native plugin for the route change. Today it carries on through the speaker.
- Handle interruptions: test calls and Siri, which were skipped in T2.
- Retest background playback with the native plugin in, with the app on the home screen as well as locked, and measure battery over a long session.
- Lock-screen and Control Center controls (play and pause, scene name). Milestone 1 (T3) showed background playback works: 11 minutes locked with no dropouts and steady timing. Skyloom doesn't mix with other audio, so these no longer depend on a mixing setting.
- Move the autosave from `localStorage` to `@capacitor/preferences`, since iOS can clear web storage when space is low.
- Safe areas, status bar, app icon, splash screen, and a light haptic tap on placing objects.
- Vertical (9:16) clip option for TikTok, Reels and Shorts.
- Clips on phones draw only about 25 of 30 frames a second: record at a lower resolution (for example 720×1560) or at 24 fps. Keep the 8-second stop timeout, and watch for the "Saving…" hang that happened once when the phone was hot.
- Encode WAV recordings in a worker. Today the conversion stalls the main thread for about 0.2 s, enough for a few late notes.
- If a playback preview stays before the share sheet, pause the scene while it plays and resume when it closes, and show the first frame instead of black.
- Remove the temporary in-app preview's "Saving to Photos and Files is coming" note once the share sheet is in.
- Keep the web build working, with native code behind a `Capacitor.isNativePlatform()` check.

### 4. App Store ready (outline)

- Apple Developer Program ($99 a year) and the bundle ID. Reserve "Skyloom: Ambient Music Maker" in App Store Connect as soon as the account exists.
- Screenshots for the required iPhone and iPad sizes, and an app preview video made with Clip.
- Privacy policy page and the App Privacy label. With no analytics or accounts, "no data collected" may be possible, which reviewers and users both like.
- TestFlight beta with 10–20 people, ideally from the iOS music community. Include at least one iPhone XS or XR and one 6th-generation iPad, the oldest devices iOS 17 supports, since only an iPhone 14 has been tested.
- Review notes that point out what's native (audio session, share sheet, lock-screen controls), because Apple rejects apps that are "just a website" (guideline 4.2).

### 5. Launch (outline)

- A landing page on the web version with a Smart App Banner and the App Store link.
- Featuring nomination in App Store Connect a few weeks before release.
- Launch posts: Audiobus forum, r/ambientmusic, r/synthesizers, r/iOSProgramming, Show HN, Product Hunt; a note to CDM and Synthtopia.
- A run of short videos made with Clip.
- App Store keywords aimed at narrow terms ("generative music", "ambient composer") rather than "sleep sounds".
- After 4 weeks, review installs by source and decide what to do next (paid Search Ads test, AUv3, more scenes).

## Decisions to make

Decided: the name, Skyloom (see [Name](#name)); that Skyloom doesn't mix with other apps' audio, reversing milestone 1, T2 (see [0002](decisions/0002-no-mixing-with-other-audio.md)); Capacitor (see [0001](decisions/0001-capacitor-for-ios.md)); and iOS 17 as the minimum version, set in the Xcode project (same record).

Still open:

1. **Price:** free, paid up front ($3–5), or free with a one-time unlock (for example extra scenes or longer clips). Subscriptions only make sense with a stream of new content.
2. **Analytics** in the app or not. PostHog is the usual choice for web projects, but leaving it out keeps the privacy label clean.

## Prerequisites

- Full Xcode from the Mac App Store (installed: Xcode 26.6 with the iOS 26.5 simulator).
- A real iPhone or iPad for testing. The simulator can't show audio-session behaviour, background playback or real performance. A free Apple ID can install on your own device for 7 days at a time. The paid program is only needed for TestFlight and the App Store.
