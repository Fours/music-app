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
| T1. Instrument format and pipeline | Not started |  |
| T2. Instruments from a manifest | Not started |  |
| T3. Load instruments when they're needed | Not started |  |
| T4. A sound picker for 5 to 8 choices | Not started |  |
| T5. Your first instruments | Not started |  |
| T6. Check on the iPhone | Not started |  |

### T1. Instrument format and pipeline

Decide what one instrument is on disk, and write the script that prepares it.

- **Source:** `samples-src/instruments/<id>/`, one file per note, named by note (for example `c3.wav`, `e3.wav`, `g#3.wav`), plus a small `instrument.json` with the name shown in the app, which object kinds it's offered for (chime, pulse, orbit), a level trim, and its release time. Like the textures' sources, the originals aren't committed.
- **Script:** `scripts/prepare-instruments.mjs` trims the silence before each note, so notes start on the beat. It fades the tails, matches levels across the notes, and writes the files to `public/samples/instruments/<id>/` along with one manifest for all instruments.
- **File format:** to decide with a measurement. AAC (`.m4a`, as the textures use) is about a tenth the size of WAV but adds silence at the start of each file. That silence is harmless in a loop but makes struck notes late. Either trim it in the script and check the onset, or keep WAV for notes and accept the size.
- **Note spacing:** chimes play D4 to A6 and pulses D3 to G5. Orbit steps can reach two octaves either side of a base note between D3 and D5 ([pitch.ts](../src/world/pitch.ts)), so about D1 to D7. Recommend recordings every 3 or 4 semitones from about C2 to C7, accepting that the extreme orbit steps get repitched further. The script warns about gaps wider than that.
- Write a decision record for the format and the spacing.

**Done when:** running the script on a sample instrument writes the files and a manifest, and a note in the output starts within 5 ms of its file's start.

### T2. Instruments from a manifest

- Replace the hard-coded sound unions with ids checked against a registry. The registry has today's synthesized sounds plus every instrument in the manifest. Felt piano moves into the manifest as the first sampled instrument, keeping the id `piano`.
- `makeStruck` builds a `Tone.Sampler` for any sampled instrument, using its notes, release and level trim. The Attack slider keeps working as it does for Felt piano.
- Decide what Length does for a sampled instrument: shorten the release, or nothing.
- Old saves keep working. An id the registry doesn't know, such as an instrument that was removed, falls back to the kind's default sound instead of making a silent object.

**Done when:** Felt piano plays from the manifest exactly as before, a saved scene from before loads with the same sounds, and a scene with an unknown sound id loads with the default sound.

### T3. Load instruments when they're needed

Loading every instrument at Begin listening would make the start slower with each instrument added, especially on the web.

- At Begin listening, load only the texture loops and the instruments the scene uses.
- Load an instrument when it's first chosen. Until its notes arrive the object stays quiet, and the picker shows that the sound is loading. Once loaded, an instrument stays in memory.
- If a file fails to load, fall back to the default sound and show a message.

**Done when:** Begin listening loads no more than the scene needs, and choosing a sound that isn't loaded yet plays it within a second on the iPhone. Check that with the network throttled to Fast 3G on the web.

### T4. A sound picker for 5 to 8 choices

`Segmented` fits 3 or 4 choices across a phone. Replace it for the Sound field of chimes, pulses and orbits, and for drones and textures too so they all look the same.

- Recommendation: a grid of chips that wraps, 3 per row on a phone and 4 on wider screens, in the segmented control's style. Each chip shows the name, plus a small mark for sampled instruments. Choosing a chip changes the sound immediately, as today, so you hear it in the scene.
- Keep the radio-group semantics, and arrow keys move between chips.
- Check it with 8 choices on the iPhone 14, the iPad simulator and the desktop.

**Done when:** a kind with 8 sounds shows them all without scrolling sideways or cutting off names, on all three screen sizes, and it works with a keyboard.

### T5. Your first instruments

- Prepare your recordings with the T1 script and add them.
- For each instrument, check its tuning against the synthesized sounds across the scale range, and its level against the other sounds in a busy scene.
- Add each to [CREDITS.md](../CREDITS.md) with where it came from. If any samples come from a pack or library rather than your own recordings, check that its licence allows them in a paid app.
- Optional: change one or two scenes to use the new sounds, so they're heard without opening the picker.

**Done when:** every new instrument plays in tune and at a similar level to the others, and CREDITS.md lists each one.

### T6. Check on the iPhone

| Check | Expected | Result |
| --- | --- | --- |
| Time from Begin listening to sound, with a scene that uses 2 instruments | No slower than before this milestone |  |
| Choosing an instrument that isn't loaded yet | Plays within a second |  |
| A busy scene with 3 instruments, 10 minutes | No dropouts, no late notes in the debug badge |  |
| Memory with every instrument loaded (Xcode's Debug navigator) | Write it down; flag anything over 300 MB |  |
| App size | Write it down |  |

**Done when:** the table is filled in, and any problem it finds is fixed or moved to a later task.

## Open questions

1. **Your recordings:** which instruments, how many notes each, and in what format and sample rate? That decides the note spacing and how much T1's script has to do.
2. **Kinds:** should every instrument be offered for chimes, pulses and orbits, or only the kinds it suits (for example a long-ringing instrument for chimes only)?
3. **Velocity:** do you have softer and harder recordings of the same notes? Chimes already vary their strike velocity, so layers would sound more natural, but they double the files.

## Definition of done

- [ ] All tasks are Done.
- [ ] The milestone table in [ios-app-plan.md](ios-app-plan.md) is updated.
