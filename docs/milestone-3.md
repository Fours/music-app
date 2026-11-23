# Milestone 3: Your own instruments

Source: [Skyloom for iPhone and iPad: plan](ios-app-plan.md), Milestones → 3.

## Outcome

Chimes, pulses and orbits can play instruments made from your own recorded samples, alongside today's synthesized sounds. Adding an instrument means dropping its note recordings into a folder and running a script, with no code changes. Each object's sound picker fits 5 to 8 choices on a phone. The new sounds ship in the first App Store release.

**Demo at the end:** place an orbit, open its sound picker, choose one of your instruments, and hear it play the scale in tune across its range. Switch to another instrument while it plays. Reload, and the scene comes back with the same instruments. Do the same on the iPhone.

## Today

- **Synthesized sounds.** Every chime, pulse and orbit sound except Felt piano is made by Tone.js in [voices.ts](../src/audio/voices.ts): `bell`, `glass`, `mallet`, `soft`, `pluck`, `musicbox` and `marimba`.
- **Felt piano.** Three notes, C3, C4 and C5, rendered by [render-samples.mjs](../scripts/render-samples.mjs) and played through a `Tone.Sampler`, which repitches the nearest note. Repitching a whole octave sounds fine for a synthesized tone, but a real instrument starts to sound odd once it's shifted more than a few semitones.
- **Hard-coded choices.** The sound names are TypeScript unions in [types.ts](../src/world/types.ts) (`ChimeSound`, `PulseSound`, `OrbitSound`). The inspector shows each list in a `Segmented` control ([Inspector.tsx](../src/components/Inspector.tsx)), which fits 3 or 4 choices across a phone.
- **Loading.** The engine loads every file in `public/samples` (about 4 MB) when you press Begin listening, and shows its progress.
- **Note length.** The orbit's Length slider shortens the synthesized sounds' decay. The sampler ignores it.

## Scope

In scope: pitched instruments for chimes, pulses and orbits; the pipeline that turns your recordings into app files; loading those files only when they're needed; a picker that fits 5 to 8 choices; the first batch of your instruments; checks on the iPhone.

Out of scope:

| Item | Where |
| --- | --- |
| Sampled drone sounds and new texture loops | Later, if wanted; the pipeline should leave room for them |
| Importing your own samples from inside the app | Not planned |
| App Store work | Milestone 4 |

## Tasks

| Task | Status | Commit |
| --- | --- | --- |
| T1. Instrument format and pipeline | Done |  |
| T2. Instruments from a manifest | Done |  |
| T3. Load instruments when they're needed | Done |  |
| T4. A sound picker for 5 to 8 choices | Done |  |
| T5. Your first instruments | Done |  |
| T6. Check on the iPhone | Not started |  |

### T1. Instrument format and pipeline

Decide what one instrument is on disk, and write the script that prepares it.

- **Source:** `samples-src/instruments/<id>/`, one file per note, named by note (for example `c3.wav`, `e3.wav`, `g#3.wav`), plus a small `instrument.json` with the name shown in the app, which object kinds it's offered for (chime, pulse, orbit), a level trim, and its release time. Like the textures' sources, the originals aren't committed.
- **Script:** `scripts/prepare-instruments.mjs` trims the silence before each note, so notes start on the beat. It fades the tails, matches levels across the notes, and writes the files to `public/samples/instruments/<id>/` along with one manifest for all instruments.
- **File format:** to decide with a measurement. AAC (`.m4a`, as the textures use) is about a tenth the size of WAV but adds silence at the start of each file. That silence is harmless in a loop but makes struck notes late. Either trim it in the script and check the onset, or keep WAV for notes and accept the size.
- **Note spacing:** chimes play D4 to A6 and pulses D3 to G5. Orbit steps can reach two octaves either side of a base note between D3 and D5 ([pitch.ts](../src/world/pitch.ts)), so about D1 to D7. Recommend recordings every 3 or 4 semitones from about C2 to C7, accepting that the extreme orbit steps get repitched further. The script warns about gaps wider than that. **Revised after T4:** every 6 semitones, F3 to F6 ([0003](decisions/0003-instrument-format.md)).
- Write a decision record for the format and the spacing.

**What's built.** The format and its reasons are in [0003](decisions/0003-instrument-format.md): AAC at 96 kbps, 48 kHz, mono, notes every 3 or 4 semitones (every 6 since T4), and optional soft and hard layers.

- **Source:** `samples-src/instruments/<id>/` holds the notes (`c3.wav`, `g#3.wav`, `eb4.aif`; any format ffmpeg reads) and `instrument.json`: `name`, `kinds`, `release`, and optionally `gainDb`, `softDb`, `fill`, `maxSeconds`, `onsetDb` and `stereo`. The options are described at the top of [prepare-instruments.mjs](../scripts/prepare-instruments.mjs).
- **Soft and hard:** `c3-soft.wav` and `c3-hard.wav`. Within a layer every note is set to the same loudness; the soft layer sits below the hard one by the median gap that was recorded (or `softDb`). A note recorded in one layer only is made from the other, unless `fill` is false.
- **[prepare-instruments.mjs](../scripts/prepare-instruments.mjs):** for each note it cuts the silence before it (keeping 1 ms; **fixed during T5:** it now walks back from the note's peak to where it rises out of the background, since recordings can open with a second or more of background sound that the first rule mistook for the note) and the tail once it's 60 dB down, fades both ends, and sets the level. It writes `public/samples/instruments/<id>/<note>[-soft|-hard].m4a`, with sharps as `s` (`cs3.m4a`), since a `#` would end a URL. Then it decodes every file it wrote and fails if a note starts more than 5 ms in.
- **Warnings:** gaps wider than 4 semitones, a range short of what the instrument's kinds play, a soft layer barely quieter than hard, an instrument turned down to fit its peaks, and output folders with no source. Bad names, unknown options, duplicate notes and a soft layer without a hard one are errors.
- **Manifest:** [src/audio/instruments.ts](../src/audio/instruments.ts), generated. Each instrument has its id, name, kinds, release and layers (softest first), each layer mapping notes to files. `PLAYBACK_GAIN_DB` (6.6 dB) is the gain T2 gives every sampled instrument to play at today's Felt piano level.
- **Felt piano** is the first instrument: [render-samples.mjs](../scripts/render-samples.mjs) also writes its C3, C4 and C5 at 48 kHz to `samples-src/instruments/piano/`, with its `instrument.json`. The app still plays the old `piano-*.wav` until T2; those are byte-for-byte unchanged.
- **[onset-check.html](../scripts/onset-check.html):** a dev-only page (`npm run dev`, then `/scripts/onset-check.html`) that decodes every note in the manifest with Web Audio and shows where each starts.

**Checks:**

- **Felt piano:** three notes, 55 KB each (165 KB in all, against 1.2 MB for the same notes as 48 kHz WAV). Onsets 0.2 to 0.4 ms in Chrome, Safari on the iOS 26.5 simulator, and ffmpeg. With its edit list ignored, ffmpeg puts the same notes 44.4 ms late, which is what a browser that didn't skip the encoder's silence would do.
- **A soft and hard test instrument** (not committed), from the piano's notes with 250 to 600 ms of silence and noise before each, the soft ones darker and 11 to 14 dB quieter: every note trimmed to start within 1 ms, the soft layer measured 11.6 dB below hard, and the note missing from each layer was made from the other.
- **Loudness meter:** agrees with ffmpeg's EBU R128 meter to 0.03 dB on a 1 kHz tone.
- **Errors:** kinds other than chime, pulse and orbit, an unknown option, no release, a file named `h3.wav`, soft notes without hard ones, plain and layered notes mixed, `c3.wav` with `bs2.wav`, a missing source folder, and `--format ogg` each stop with a message, before anything is written.

**Done when:** running the script on a sample instrument writes the files and a manifest, and a note in the output starts within 5 ms of its file's start.

### T2. Instruments from a manifest

- Replace the hard-coded sound unions with ids checked against a registry. The registry has today's synthesized sounds plus every instrument in the manifest. Felt piano moves into the manifest as the first sampled instrument, keeping the id `piano`.
- `makeStruck` builds a `Tone.Sampler` for any sampled instrument, using its notes, release and level trim. The Attack slider keeps working as it does for Felt piano.
- Decide what Length does for a sampled instrument: shorten the release, or nothing.
- Play every sampled instrument `PLAYBACK_GAIN_DB` up, so Felt piano stays at today's level.
- **Soft and hard layers:** each strike plays one layer. Chimes strike at 0.35 to 0.95, orbits at 0.55 to 0.8 at random, and pulses always at 0.7, so start with soft below 0.45, hard above 0.8, and a random choice weighted by strength in between. Keep the choice in one place: a Soft, Hard or Auto setting on each object may come later.
- Old saves keep working. An id the registry doesn't know, such as an instrument that was removed, falls back to the kind's default sound instead of making a silent object.

**What's built.**

- **Registry:** [sounds.ts](../src/audio/sounds.ts) lists each kind's sounds, the synthesized ones first and then the manifest's instruments for that kind, in manifest order. `soundsFor(kind)` gives the Sound field its choices. `soundOf(kind, id)` returns the id, or the kind's default (Bell, Mallet, Pluck) when the kind doesn't offer it. An instrument whose id clashes with a synthesized sound is left out, with a console error.
- **Ids:** chime, pulse and orbit sounds are plain `SoundId` strings in [types.ts](../src/world/types.ts). Drone timbres and textures keep their unions, since they aren't in the manifest.
- **Unknown ids:** `loadScene` runs every object through `checkSounds`, so saves, presets and anything loaded later get a sound their kind offers. An unknown id quietly becomes the default, and the next autosave stores that.
- **Playing:** [voices.ts](../src/audio/voices.ts) builds a `Sampled` instrument for any sound in the manifest: one `Tone.Sampler` per layer, with the instrument's release, played `PLAYBACK_GAIN_DB` (6.6 dB) up. Attack works as before, set on every layer. A strike's strength picks the layer through `pickLayer` (soft below 0.45, hard above 0.8, weighted at random in between), the only place that decides. Within a layer, strength still scales the level, as Felt piano did.
- **Length (decided):** for a sampled orbit instrument, Length scales the release, from a quarter of the instrument's release at Short to all of it at Ringing. The orbit already holds each note longer as Length goes up. Changing it sets the release on the samplers rather than rebuilding them. To be checked by ear once real instruments are in (T5).
- **Loading:** Begin loads every file in the manifest along with the textures (T3 makes that lazy). The old `piano-*.wav` files are gone (630 KB), and [render-samples.mjs](../scripts/render-samples.mjs) only writes the piano's 48 kHz sources.
- **Picker:** the three Sound fields take their choices from the registry. With only Felt piano sampled, chimes offer Bell, Glass, Felt piano and pulses Mallet, Soft, Felt piano (Felt piano moved to the end).

**Checks:**

- **Felt piano against the old files**, rendered offline in the browser through a Tone.Sampler each way (strength 0.7, level over the first 400 ms):

  | Notes | New against old |
  | --- | --- |
  | C3 to E3 | +1.7 dB |
  | F#3 to E4 | −0.1 to 0.0 dB |
  | F#4 to C5 | −0.8 dB |

  So it's the same sound at the same level in the middle, and T1's loudness matching evens out the ends: the old piano jumped 2 dB between E3 and F#3, where the sampler switched from C3's recording to C4's, and the new one doesn't. Onsets match within 0.4 ms.
- **A save from before** (v2) with Bell, Felt piano and Glass chimes, Mallet, Soft and Felt piano pulses and a Music box orbit loaded with the same sounds. After Begin, the Felt piano objects built sampled instruments with their notes loaded, the others synthesized ones, and the scene played.
- **Unknown id:** `harp` on a chime, a pulse and an orbit loaded as Bell, Mallet and Pluck, each with a working voice.
- **Layers**, with T1's soft and hard test instrument copied in for the check and removed afterwards: the picker listed it for all three kinds; a chime, a pulse and an orbit switched to it each played both layers in 25 seconds (the orbit 8 soft and 19 hard, against about two-thirds expected). `pickLayer` over 10,000 strikes: 0% hard at 0.35 and 0.45, 29% at 0.55, 50% at 0.625, 72% at 0.7, 100% at 0.8 and 0.95. Length 0, 0.4 and 1 set the release to 0.25, 0.55 and 1 s.
- **Network:** Begin fetches the piano's three `.m4a` notes and the textures; no `piano-*.wav`. No console errors.
- **Simulator** (iPhone 17 Pro): Begin finishes, so WKWebView fetched and decoded the new files, and the scene plays.

**Done when:** Felt piano plays from the manifest exactly as before, a saved scene from before loads with the same sounds, and a scene with an unknown sound id loads with the default sound.

### T3. Load instruments when they're needed

Loading every instrument at Begin listening would make the start slower with each instrument added, especially on the web.

- At Begin listening, load only the texture loops and the instruments the scene uses.
- Load an instrument when it's first chosen. Until its notes arrive the object stays quiet, and the picker shows that the sound is loading. Once loaded, an instrument stays in memory.
- If a file fails to load, fall back to the default sound and show a message.

**What's built.**

- **[InstrumentLoader](../src/audio/instrument-loader.ts)** fetches an instrument's notes nearest the pitch it's first needed at, four at a time, alternating soft and hard at the same distance. Decoded notes join the shared buffers and stay, through an audio rebuild too. The engine owns one ([engine.ts](../src/audio/engine.ts)).
- **Begin** loads the texture loops and every note of the instruments the scene uses (`instrumentsIn`), and waits for them in full, so a saved scene sounds right from its first note. The progress bar counts those files. A scene with no sampled sounds loads no instrument files.
- **Later** (choosing a sound, loading a preset or scene): the engine doesn't build a voice for an instrument with no notes yet. It starts loading it at the object's base note, and the object stays quiet. The first tick after a note lands builds the voice.
- **Playing while loading:** `Sampled` starts with the notes that have arrived and adds the rest with `Sampler.add` as they come, repitching further until then. `pickLayer` chooses only among layers that have a note.
- **Picker:** the store's `loadingSounds` lists instruments with notes still to come. Their option in the Sound field shows a pulsing dot (still, with reduced motion) and is `aria-busy`.
- **Failures:** a note that fails is skipped, and the console says so. If none of an instrument's notes load, every object playing it switches to its kind's default sound, which is saved, and a message says so: "Couldn't load Big test, so it plays Mallet instead. Choose it again to retry." Nothing is remembered as failed, so choosing it again tries again. Begin finishes either way.

**Checks** (web, with a 2.2 MB test instrument: 21 notes from C2 to C7, soft and hard, made by repitching the piano, copied in for the checks and removed afterwards):

- **Begin:** Morning Fog (no sampled sounds) fetched the 5 texture files and no instrument notes. Loading Rain on Glass afterwards fetched the piano's 3 notes, playable in 76 ms. A saved scene with the test instrument and Felt piano fetched the textures and both instruments, and Begin finished with all 42 and all 3 notes loaded.
- **Choosing a sound that isn't loaded**, a pulse at full rate, from choosing it:

  | Network | First note loaded | First sound | All 42 notes |
  | --- | --- | --- | --- |
  | Local dev server | 35 ms | 151 ms | 151 ms |
  | Fast 3G, simulated* | 858 ms | 2.2 s | 13.5 s |

  \*The built-in browser can't throttle, so the page's `fetch` was slowed for the test: 562 ms per request and 180 KB/s shared by every request in flight. The first sound waits for the pulse's next beat after the first note.
- **Picker:** while the test instrument loaded, its option showed the dot and `aria-busy`; afterwards neither.
- **Failures:** with every test note blocked, the chime fell back to Bell, with the message; unblocked, choosing it again loaded all 42 notes. With the soft notes blocked, a pulse played on from the hard layer (21 loaded, 21 failed). With the test notes blocked at Begin, Begin finished, and the pulse fell back to Mallet, with the message.
- **Simulator** (iPhone 17 Pro): Begin with Open Sea (no sampled sounds) finishes and plays. Switching to Rain on Glass there didn't take (the simulator's taps lagged).
- **iPhone 14** (T2 and T3 together): checked out. The milestone 2 save loaded with the same objects and sounds. After Begin with a scene without Felt piano, switching to Rain on Glass brought the piano in straight away. Felt piano sounded as before, switching a pulse to it and back had no glitch, and Begin with Rain on Glass already loaded started as quickly as before.

**Done when:** Begin listening loads no more than the scene needs, and choosing a sound that isn't loaded yet plays it within a second on the iPhone. Check that with the network throttled to Fast 3G on the web.

### T4. A sound picker for 5 to 8 choices

`Segmented` fits 3 or 4 choices across a phone. Replace it for the Sound field of chimes, pulses and orbits, and for drones and textures too so they all look the same.

- Recommendation: a grid of chips that wraps, 3 per row on a phone and 4 on wider screens, in the segmented control's style. Each chip shows the name, plus a small mark for sampled instruments. Choosing a chip changes the sound immediately, as today, so you hear it in the scene.
- Keep the radio-group semantics, and arrow keys move between chips.
- Check it with 8 choices on the iPhone 14, the iPad simulator and the desktop.

**What's built.**

- **[SoundPicker](../src/components/controls.tsx)** replaces the Sound field for all five kinds; the orbit's Direction keeps `Segmented`. Chips sit on the segmented control's grey track, and the chosen one is white and raised.
- **Columns by count, not screen** (changed in T5: rows of 3, see there): the desktop and iPad panel is 340 px wide, narrower inside than the iPhone's bottom sheet, so "3 on a phone, 4 wider" didn't fit the layout. The rows come out even instead: 3 → 3, 4 → 4, 5 and 6 → rows of 3, 7 and 8 → rows of 4 (`ceil(n / ceil(n / 4))`), the same everywhere, at least 72 px a chip.
- **Names wrap** to a second line instead of being cut or scrolling. The script warns about names over 18 characters and words over 10 letters, which might not fit.
- **Recorded instruments** (mark removed in T5) have a small waveform mark after the name, kept on the last word's line so it never sits alone or covers the name. While an instrument's notes load, T3's pulsing dot takes its place. Screen readers hear "Kalimba, recorded".
- **Keyboard:** a radio group. Tab lands on the chosen chip only. Left and Right move and wrap, Up and Down move a row and stop at the edges, Home and End go to the ends. Moving also chooses, as radio buttons do; arrowing past several recorded instruments starts loading each.

**Checks** (with five temporary orbit instruments, so orbits offered 8: Pluck, Music box, Marimba, Celesta, Hammered dulcimer, "Concert harp in a hall" (22 characters, over the limit on purpose), Kalimba and Steel drum; removed afterwards):

- **Desktop** (Chrome, 340 px panel): 2 rows of 4, chips 73 px, nothing scrolls sideways or is cut. Hammered dulcimer and Steel drum take 2 lines, the over-long name 3. Chime and pulse show 3 in a row, drone and texture 4. With an instrument still loading, its chip showed the dot and `aria-busy`.
- **Phone width** (390 px, the iPhone 14's): 2 rows of 4, chips 85 px, every name on 1 or 2 lines.
- **iPad simulator** (Safari, iPad Pro 11-inch): 2 rows of 4, nothing cut; tapping Kalimba chose it. This is where a mark wrapping onto a line of its own showed up, now fixed.
- **Keyboard** (Chrome): Right from Music box chose Marimba; Down from Marimba chose Kalimba and Down again stayed; End chose Steel drum; Right wrapped to Pluck; Up from the first row stayed; Left wrapped to Steel drum; Home then Right chose Music box. Only the chosen chip was in the Tab order, and Shift+Tab, Tab came back to it.
- **Script:** "Concert harp in a hall" and "Glockenspielerei" each got a warning.

**Device results** (iPhone 14):

| Check | Expected | Result |
| --- | --- | --- |
| The Sound fields of a chime, pulse, orbit, drone and texture | Every choice visible, nothing cut off, easy to tap | Passed |

**Memory, for T5 and T6:** a decoded note takes about 0.9 MB (4.5 s at 48 kHz), so a soft and hard instrument with 21 notes holds about 36 MB once loaded, and 8 of them nearly 300 MB, T6's line. Shorter tails (`maxSeconds`) and letting go of instruments no object uses would bring it down. **Settled after T4:** notes every 6 semitones ([0003](decisions/0003-instrument-format.md)) make it 14 notes and about 12 MB per instrument, about 100 MB for 8. The script's spacing and range warnings changed to match.

**Done when:** a kind with 8 sounds shows them all without scrolling sideways or cutting off names, on all three screen sizes, and it works with a keyboard.

### T5. Your first instruments

- **What to record,** for each instrument: F3, B3, F4, B4, F5, B5 and F6, played soft and played hard, 14 files named like `f3-soft.wav` and `b3-hard.wav` ([0003](decisions/0003-instrument-format.md)). Let each note ring out fully, with a moment of silence before it. Any format and sample rate ffmpeg reads; WAV or AIFF at 24-bit is best.
- Prepare your recordings with the T1 script and add them.
- For each instrument, check its tuning against the synthesized sounds across the scale range, and its level against the other sounds in a busy scene. Listen between recordings too (A3, D4, A4): if a stretch sounds wrong, record one more note there.
- Judge by ear the two rules T2 left open: Length scaling the release of sampled orbit instruments, and strength still scaling the level within a layer.
- Add each to [CREDITS.md](../CREDITS.md) with where it came from. If any samples come from a pack or library rather than your own recordings, check that its licence allows them in a paid app.
- Optional: change one or two scenes to use the new sounds, so they're heard without opening the picker.

**What's built.**

- **Three instruments,** each F2 to F6 every 6 semitones (9 notes; F2 and B2 added for orbits' low steps), offered for chimes, pulses and orbits, with a 3 s release: **Piano** (soft and hard; it replaced the synthesized Felt piano and keeps the id `piano`), **Harpsichord** (one strength, 4 s tails) and **Rhodes** (soft and hard). Piano and Rhodes set `softDb` to −5; they were recorded 9.1 and 7.1 dB apart.
- **Pitch check** in [prepare-instruments.mjs](../scripts/prepare-instruments.mjs): each recording's pitch, measured from 150 ms in (past the attack) by where the signal best matches itself a period later, refined over about 12 ms of periods so high notes are precise. It's printed with each note, and anything more than 15 cents off its name gets a warning, which leaves room for a piano's stretch tuning.
- **`softDb` on a one-strength instrument** now gets a warning instead of doing nothing silently.
- **Moods from the app:** on the dev server only, the Scenes panel ends with "Developer: save this sky as [mood] · Save as default", which picks the mood the sky came from. It posts the sky to the dev server ([vite.config.ts](../vite.config.ts)), which writes it into [preset-scenes.json](../src/world/preset-scenes.json) under the mood's id, one object per line. [presets.ts](../src/world/presets.ts) uses a mood's entry there in place of its built-in scene; the mood keeps its name, description and colours. Saved: the settings except Volume (the listener's, not the scene's) and every object as it is at that moment, including where chimes and drones have drifted to; ids are made fresh on each load. Saving doesn't reload the page, so the music keeps playing; that's why it's one file that always exists, since a new file makes Vite reload. The release build has neither the control nor the request.
- **Sound picker, once orbits offered 8** (Guitar and Ukulele added, for pulses and orbits only, since they're recorded on their open strings, E2 to E4 and C4 to A4): rows of 4 were too tight, so up to 4 choices sit in one row and more go in rows of 3. Orbits' 8 and pulses' 7 take 3 rows, chimes' 5 take 2, and drones and textures keep a row of 4. The waveform mark on recorded instruments is gone, since it didn't say anything people would understand and the names need the room; screen readers no longer hear "recorded" either. The loading dot stays. Checked at 390 px (chips 114 px) and in the 340 px desktop panel (97 px): every name on one line, and Up and Down move by a row of 3.
- **T2's open rules, kept:** Length scales a sampled orbit instrument's release, and strength scales the level within a layer.

**Checks:**

- **Tuning** (the script, cents from each note's name):

  | Instrument | Range | Furthest |
  | --- | --- | --- |
  | Rhodes, soft and hard | −3 to +2 | F2 soft −3 |
  | Piano, soft | −1 to +6 | B3 and B5 +6 |
  | Piano, hard | +1 to +14 | F2 +14 |
  | Harpsichord | 0 to +12, and B2 +21 | B2 (warning) |

  Harpsichord B2 starts sharp and settles, as plucked strings do: +21 from 0.1 to 0.3 s, +14 at 0.6 s, +7 at 1.5 s. Measured again at six points to rule out the method; its neighbours F2 and B3 stay within 10 and 4.
- **Levels:** every note in a layer is set to −18 LUFS, the level T2 matched to Felt piano among the synthesized sounds. Against the piano's hard layer: piano soft −5 dB, harpsichord 0, Rhodes hard −2.2 and soft −7.2. The Rhodes was turned down to keep its attacks under the peak ceiling (accepted for now).
- **Noise:** piano B2-soft's background is 29 dB under the note (the one warning; the line is 30). Every other recording is at least 31 dB under, the hard notes 38 to 50.
- **Picker** at 390 px (the iPhone 14's width), before Guitar and Ukulele: orbits offered 6, in two rows of three 114 px chips, every name on one line, "Harpsichord" (one letter over the script's 10) included.
- **Moods from the app** (Chrome, dev server): saved Hearth and Morning Fog with a chime changed to Rhodes and Harpsichord, each the first save into the file and again after; the page didn't reload and the music kept playing. After a reload both moods built from the file with fresh ids, and Rain on Glass still from presets.ts. A request for `../../evil` was refused (400). `npm run build` contains neither the control nor the request. The test entries were removed.

**Your listening** (you accepted T5 without separate notes on each check):

| Check | Expected | Result |
| --- | --- | --- |
| Each instrument between its recordings (A3, D4, A4) | No stretch sounds wrong; where one does, record a note there | Accepted |
| Harpsichord B2, and low orbit steps near it | The sharp start isn't noticeable | Accepted |
| Piano B2-soft's tail | No hiss | Accepted |
| Each instrument in a busy scene | Sits with the other sounds; Rhodes a little quieter is fine | Accepted |
| Moods saved from the app | Each plays as built after a reload | Accepted |

**Done when:** every new instrument plays in tune and at a similar level to the others, and CREDITS.md lists each one.

### T6. Check on the iPhone

| Check | Expected | Result |
| --- | --- | --- |
| Time from Begin listening to sound, with a scene that uses 2 instruments | No slower than before this milestone |  |
| Choosing an instrument that isn't loaded yet | Plays within a second |  |
| A busy scene with 3 instruments, 10 minutes | No dropouts, no late notes in the debug badge |  |
| Memory with every instrument loaded (Xcode's Debug navigator) | Write it down; flag anything over 300 MB |  |
| App size | Write it down |  |
| [onset-check.html](../scripts/onset-check.html) in Safari on the iPhone | Every note starts within 5 ms |  |

**Done when:** the table is filled in, and any problem it finds is fixed or moved to a later task.

## Open questions

1. **Your recordings:** which instruments, how many notes each, and in what format and sample rate? That decides the note spacing and how much T1's script has to do.
2. **Kinds:** should every instrument be offered for chimes, pulses and orbits, or only the kinds it suits (for example a long-ringing instrument for chimes only)?
3. **Velocity:** answered in T1. Instruments can have soft and hard recordings of their notes ([0003](decisions/0003-instrument-format.md)); how a strike picks one is T2's.

## Definition of done

- [ ] All tasks are Done.
- [ ] The milestone table in [ios-app-plan.md](ios-app-plan.md) is updated.
