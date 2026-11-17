# 0002: Skyloom doesn't mix with other apps' audio

- **Status:** Accepted
- **Date:** 2026-11-17
- **Evidence:** [milestone 2, T2](../milestone-2.md#t2-native-audio-session-and-recovery)
- **Replaces:** the mixing decision in [milestone 1, T2](../milestone-1.md#t2-audio-basics-on-a-device)

## Context

Milestone 1 decided that Skyloom should mix with other apps' audio, so people could play it under music or a podcast. The web view can't ask for that, so milestone 2 set the app's session natively to playback with mix-with-others.

On the iPhone 14 that native session made no difference to the sound. Skyloom's audio plays in WebKit's own media session, and the page decides that one with `navigator.audioSession.type`:

| WebKit session | Silent switch | Under a podcast |
| --- | --- | --- |
| `auto` (WebKit picks Ambient) | Silent | Not tested |
| `playback` | Keeps playing | Skyloom stops |

WebKit offers no session that both ignores the silent switch and mixes. Getting both would mean sending the sound out through a native player on its own session, a large change of the kind [0001](0001-capacitor-for-ios.md) chose not to make.

## Decision

**Skyloom behaves like a music player.** WebKit's session is `playback`, as on the website: Skyloom ignores the silent switch, and starting it stops other apps' audio, as starting another app's audio stops Skyloom.

Most people won't play Skyloom under a podcast; it is music to listen to, not a background effect. Going quiet with the silent switch would surprise far more people than not mixing.

How it behaves:

- Another app starts playing: Skyloom stops. Coming back to it shows it paused, and Play takes the audio back.
- A call or Siri: Skyloom pauses, and plays again afterwards when iOS says it should.
- Headphones or AirPods go away: Skyloom pauses and says why.

The native plugin stays, to hear interruptions, route changes and returns to the foreground. Its own session still mixes, because it only has to be active to hear interruptions, and a non-mixing one would stop other audio as soon as the app opened.

## Consequences

- Lock-screen and Control Center controls ([T7](../milestone-2.md#t7-lock-screen-controls)) no longer depend on a mixing setting. Whether iOS gives them to an app whose own session mixes while WebKit's doesn't is for T7 to find out.
- One less setting to explain.

## When to revisit

- People ask to play Skyloom under other audio. Then try an "ambient" option that mixes and goes quiet with the silent switch (WebKit `auto` or `ambient`; check on the device that it mixes), or a native output path.
