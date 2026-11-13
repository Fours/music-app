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

Still to do: a quick look in [WIPO's Global Brand Database](https://branddb.wipo.int) for registrations outside the US, and reserving the name in App Store Connect as early as milestone 3 allows. App Store search doesn't show reserved but unreleased names, so this is the final check. Names that were considered and rejected: Skychord (a dormant registration owned by a synth and drone-machine maker), Windharp, Small Weather, Driftglass and Ambiloom.

## Approach

Wrap the existing Vite + React + Tone.js app with [Capacitor](https://capacitorjs.com). The app runs in a WKWebView, and small native plugins cover what the web can't do well (sharing files, the audio session, lock-screen controls, saved data).

Capacitor first, because it reuses everything already built and keeps the web version and the app as one code base. The main risk is audio inside WKWebView, especially playback with the screen locked. Milestone 1 is a spike that tests exactly that on a real device before anything else is built. If it fails badly, the fallback options are:

1. **Foreground only for v1.** Music plays while the app is open, like most creative tools. Simplest, but weaker for people who want to fall asleep to it.
2. **Native audio engine.** Rewrite the audio in Swift (AVAudioEngine or AudioKit) and keep the canvas in the web view. Large job, but it also opens the door to AUv3 later.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Spike: Capacitor shell, audio on a real device, background playback, performance, go/no-go | Not started — [spec](milestone-1.md) |
| 2 | Native fit: rename to Skyloom, share sheet, audio session and interruptions, lock-screen controls, durable saves, safe areas, icon and splash, vertical clips | Not started |
| 3 | App Store ready: developer account, name, screenshots and preview, privacy policy and label, TestFlight beta, submission | Not started |
| 4 | Launch: landing page, featuring nomination, community launch, short videos, App Store keywords, review of results | Not started |

### 2. Native fit (outline)

- Rename the app to Skyloom: the wordmark, page title, welcome screen, clip watermark, README, and the names of downloaded recordings and clips. Keep the `drift:scene` storage key, or migrate it, so existing saved scenes still load.
- Share sheet for WAV recordings and video clips (`@capacitor/share` and `@capacitor/filesystem`). Download links don't work in a WKWebView.
- Audio session set to playback, and handling interruptions and route changes (headphones unplugged, AirPods connected).
- Lock-screen and Control Center controls (play and pause, scene name), if milestone 1 shows background playback works.
- Move the autosave from `localStorage` to `@capacitor/preferences`, since iOS can clear web storage when space is low.
- Safe areas, status bar, app icon, splash screen, and a light haptic tap on placing objects.
- Vertical (9:16) clip option for TikTok, Reels and Shorts.
- Keep the web build working, with native code behind a `Capacitor.isNativePlatform()` check.

### 3. App Store ready (outline)

- Apple Developer Program ($99 a year) and the bundle ID. Reserve "Skyloom: Ambient Music Maker" in App Store Connect as soon as the account exists.
- Screenshots for the required iPhone and iPad sizes, and an app preview video made with Clip.
- Privacy policy page and the App Privacy label. With no analytics or accounts, "no data collected" may be possible, which reviewers and users both like.
- TestFlight beta with 10–20 people, ideally from the iOS music community.
- Review notes that point out what's native (audio session, share sheet, lock-screen controls), because Apple rejects apps that are "just a website" (guideline 4.2).

### 4. Launch (outline)

- A landing page on the web version with a Smart App Banner and the App Store link.
- Featuring nomination in App Store Connect a few weeks before release.
- Launch posts: Audiobus forum, r/ambientmusic, r/synthesizers, r/iOSProgramming, Show HN, Product Hunt; a note to CDM and Synthtopia.
- A run of short videos made with Clip.
- App Store keywords aimed at narrow terms ("generative music", "ambient composer") rather than "sleep sounds".
- After 4 weeks, review installs by source and decide what to do next (paid Search Ads test, AUv3, more scenes).

## Decisions to make

Decided: the name, Skyloom (see [Name](#name)).

These are open and don't block milestone 1:

1. **Price:** free, paid up front ($3–5), or free with a one-time unlock (for example extra scenes or longer clips). Subscriptions only make sense with a stream of new content.
2. **Minimum iOS version.** Milestone 1 should show which WebKit features the app needs.
3. **Analytics** in the app or not. PostHog is the usual choice for web projects, but leaving it out keeps the privacy label clean.

## Prerequisites

- Full Xcode from the Mac App Store. Only the command-line tools are installed at the moment, which can't build iOS apps.
- A real iPhone or iPad for testing. The simulator can't show audio-session behaviour, background playback or real performance. A free Apple ID can install on your own device for 7 days at a time. The paid program is only needed for TestFlight and the App Store.
