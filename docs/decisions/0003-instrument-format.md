# 0003: Sampled instruments are AAC notes with soft and hard layers

- **Status:** Accepted
- **Date:** 2026-11-18
- **Evidence:** [milestone 3, T1](../milestone-3.md#t1-instrument-format-and-pipeline)
- **Revised:** 2026-11-18, after T4: notes every 6 semitones instead of every 3 or 4 (Note spacing, below)

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

**Note spacing:** record every 6 semitones: **F3, B3, F4, B4, F5, B5, F6**, 7 notes, or 14 with soft and hard. No note is then played more than 3 semitones from a recording across D3 to A6, the range chimes (D4 to A6) and pulses (D3 to G5) play, except the ends, which are 3 to 4 away. Orbit steps reach two octaves either side of a base note between D3 and D5, so D1 to D7, but most stay between D3 and D6; the outer ones are repitched further, and that's accepted.

- **Why 6, not 3 or 4:** first planned at every 3 or 4 semitones from C2 to C7 (21 notes, 42 with soft and hard). Every 6 needs a third of the recordings, downloads and memory: about 12 MB per soft and hard instrument once decoded, against 36 MB, so 8 instruments stay near 100 MB rather than near T6's 300 MB line.
- **The cost:** a note 3 semitones from its recording plays 19% faster (up) or 16% slower (down), so its attack, tail and resonances shift a little. That's hard to hear on bell, mallet and plucked sounds under reverb, and easier on voice-like or bowed ones.
- **Where it sounds wrong, add a note there.** The spacing doesn't have to be even, so one more recording fixes one stretch.
- The script warns about gaps wider than 6 semitones and about a kind's range reaching more than 4 past the outermost note, and prints the furthest any note is repitched, within the main range and out to the extremes.

**Level:** every note's loudest 400 ms is set to −18 LUFS, leaving 16.5 dB for peaks under a −1.5 dBFS ceiling, so a sharp-attacked instrument doesn't have to be turned down and every instrument sits at the same level. The app plays them all `PLAYBACK_GAIN_DB` (6.6 dB) up, which puts them where Felt piano plays today. An instrument whose peaks still don't fit is lowered as a whole, with a warning.

**Manifest:** the script writes [src/audio/instruments.ts](../../src/audio/instruments.ts), a typed module like the textures' `texture-loops.ts`, not a JSON file to fetch. The app knows every instrument, its name and the object kinds it's offered for before any sound loads.

## Consequences

- **Size:** about 0.4 MB per instrument with 7 notes, or 0.8 MB with soft and hard layers; about 12 MB in memory once loaded.
- **Strength (T2):** each strike plays one layer. Chimes vary from 0.35 to 0.95 with what hits them, orbits from 0.55 to 0.8 at random, and pulses always strike at 0.7, so a single threshold would give pulses and orbits only one layer. T2 starts with soft below 0.45, hard above 0.8, and a random choice weighted by strength in between. Because the manifest names the layers, other rules fit the same files: for example a Soft, Hard or Auto choice on each object, which may come later.
- **The originals aren't committed**, like the textures' recordings. Felt piano's were rendered by a script; since 2026-11-19 a recorded piano has the id `piano` instead, and that script is gone.

## When to revisit

- If a supported browser decodes a note late: switch to FLAC.
- If the app grows past what's comfortable to download: lower the bitrate.
- If an instrument sounds wrong between its notes: record another note in that stretch, or space that instrument's notes closer.
