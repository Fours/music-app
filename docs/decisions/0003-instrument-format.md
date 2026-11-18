# 0003: Sampled instruments are AAC notes with soft and hard layers

- **Status:** Accepted
- **Date:** 2026-11-18
- **Evidence:** [milestone 3, T1](../milestone-3.md#t1-instrument-format-and-pipeline)

## Context

Milestone 3 adds instruments made from recorded notes. Each needs notes across the range chimes, pulses and orbits play, possibly at two strengths. Six such instruments could add 50 MB to the app as WAV. AAC is about a tenth of that, but an AAC encoder puts silence before the audio, which would make struck notes late.

## Decision

**Format: AAC (`.m4a`), 96 kbps, 48 kHz, mono.** A note of about 4.5 seconds is 55 KB, against 420 KB as 16-bit WAV.

- **The leading silence:** the encoder puts 2,112 samples (44 ms) of silence before the audio. The file's edit list tells players to skip it. Measured with [onset-check.html](../../scripts/onset-check.html), which decodes each note with Web Audio as the app does, both browsers skip it:

  | Decoder | Onset, Felt piano C3, C4, C5 |
  | --- | --- |
  | Chrome 156 (macOS) | 0.2, 0.4, 0.4 ms |
  | Safari, iOS 26.5 simulator (the app's WebKit) | 0.2, 0.4, 0.4 ms |
  | ffmpeg | 0.2, 0.4, 0.4 ms; 44.4 ms when told to ignore the edit list |

  The 0.2 to 0.4 ms is the script's 1 ms pre-roll less the quiet start of the note. Firefox wasn't measured; Skyloom's targets are Safari, Chrome and the iOS app.
- **If a decoder ever fails:** `--format flac` (about 55% of WAV, no leading silence) or `--format wav`, with no other change.
- **48 kHz**, as the textures use and iOS plays, so nothing is resampled.
- **Mono** by default: each object's panner sums its sound to mono anyway, and mono halves the size. An instrument can ask for stereo.

**Soft and hard layers.** A note can be recorded at two strengths, named `c3-soft.wav` and `c3-hard.wav`; an instrument recorded at one strength names its notes `c3.wav`. The manifest lists an instrument's layers softest first, so a medium layer could be added later without changing the format.

- Within a layer, every note is set to the same loudness, its loudest 400 ms (EBU R128 momentary loudness), so moving up the scale doesn't jump in level where the sampler switches from one recording to the next.
- The soft layer sits below the hard one by the gap that was recorded: the median, over the notes both layers have, of soft minus hard. That keeps the instrument's own dynamics but evens out a note played a little too loud or soft. `softDb` in `instrument.json` overrides it.
- A note recorded in one layer only is made from the other layer's recording, at this layer's level. `"fill": false` leaves the gap instead, for a layer recorded more sparsely on purpose.

**Note spacing:** record every 3 or 4 semitones, from C2 to C7 for an instrument offered for orbits, D3 to A6 for chimes and pulses only. Real instruments start to sound wrong when repitched more than a few semitones. The script warns about wider gaps and shorter ranges, and prints the furthest any note is repitched; orbit steps reach from D1 to D7, and the extremes beyond C2 and C7 are accepted as repitched further.

**Level:** every note's loudest 400 ms is set to −18 LUFS, leaving 16.5 dB for peaks under a −1.5 dBFS ceiling, so a sharp-attacked instrument doesn't have to be turned down and every instrument sits at the same level. The app plays them all `PLAYBACK_GAIN_DB` (6.6 dB) up, which puts them where Felt piano plays today. An instrument whose peaks still don't fit is lowered as a whole, with a warning.

**Manifest:** the script writes [src/audio/instruments.ts](../../src/audio/instruments.ts), a typed module like the textures' `texture-loops.ts`, not a JSON file to fetch. The app knows every instrument, its name and the object kinds it's offered for before any sound loads.

## Consequences

- **Size:** about 1.2 MB per instrument recorded every 3 semitones from C2 to C7, or 2.4 MB with soft and hard layers.
- **Strength (T2):** each strike plays one layer. Chimes vary from 0.35 to 0.95 with what hits them, orbits from 0.55 to 0.8 at random, and pulses always strike at 0.7, so a single threshold would give pulses and orbits only one layer. T2 starts with soft below 0.45, hard above 0.8, and a random choice weighted by strength in between. Because the manifest names the layers, other rules fit the same files: for example a Soft, Hard or Auto choice on each object, which may come later.
- **The originals aren't committed**, like the textures' recordings. Felt piano's are rendered by [render-samples.mjs](../../scripts/render-samples.mjs), so they can always be made again.

## When to revisit

- If a supported browser decodes a note late: switch to FLAC.
- If the app grows past what's comfortable to download: lower the bitrate, or space notes further apart for instruments that repitch well.
