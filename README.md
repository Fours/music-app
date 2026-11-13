# Drift

Ambient music you shape by hand. Drift is a generative canvas: you place glowing objects on an open sky, and they play off each other to make slow, evolving music that's always in tune.

## Objects

| Object      | What it does                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drone**   | A held, breathing tone. Height picks the note (root, third or fifth of the key). Further right sounds brighter.                                                                                  |
| **Chime**   | A bead that drifts around and rings when it hits the edges or other objects. You can flick it to throw it.                                                                                       |
| **Pulse**   | Breathes out ripples. Each ripple plays a note, and ripples ring any chimes they pass.                                                                                                           |
| **Orbit**   | An ostinato. Beads around a ring sound as they pass the marker. Drag a bead outward to raise its note, or mute a step from its panel. Bigger rings play slower, so orbits drift in and out of phase. |
| **Texture** | Rain, wind, waves or embers. It tints the sky and sounds brighter higher up.                                                                                                                      |

Each object's panel has a few controls. The **Sound** panel sets the mood (scale), key, tempo, reverb space and volume. **Scenes** loads one of six starting points. **Record** captures what you hear and downloads it as a WAV file. **Clip** records a video of the sky with the music, ready to share: MP4 in Safari and Chrome, WebM in Firefox. It leaves out selection and editing marks, adds a small wordmark, and stops itself at five minutes. Your scene is saved in the browser automatically.

**Canvas controls**

- Drag objects to move them.
- To resize, drag the handle on the selection ring, pinch, or use the scroll wheel.
- Delete or Backspace removes the selected object, Space plays or pauses, and Esc closes panels.

## Development

```bash
npm install
npm run dev
```

- `npm run build`: typecheck and production build.
- `npm run lint`: oxlint.
- `npm run check:offline`: checks that the build in `dist/` loads nothing from the network, which the iOS app needs.
- `npm run ios`: builds, runs the offline check, copies the build into the iOS project with `cap sync`, and opens it in Xcode.
- `node scripts/render-samples.mjs`: regenerates the felt-piano notes in `public/samples/`.
- `node scripts/prepare-textures.mjs`: rebuilds the texture loops from the field recordings in `samples-src/`. Needs ffmpeg. The recordings themselves aren't in git (they're large), only the loops made from them.

### iOS app

The iPhone and iPad app, Skyloom, wraps the same build with [Capacitor](https://capacitorjs.com). The Xcode project is in `ios/`. The plan is in [docs/ios-app-plan.md](docs/ios-app-plan.md).

- Needs full Xcode, selected with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, plus the iOS simulator platform (Xcode → Settings → Components).
- `npm run ios`, then pick a simulator or a connected device in Xcode and press Run. To run on your own device, choose your team under Signing & Capabilities.
- The app's settings live in `capacitor.config.ts`. `cap sync` copies the web build into `ios/App/App/public/`, which isn't committed.

## How it works

- **Audio** (`src/audio/`): Tone.js. Every object gets its own voice, which feeds a shared reverb, a tempo-synced delay, and a compressor and limiter on the master. Recording uses `Tone.Recorder`, and the result is re-encoded to WAV in the browser. Clips (`src/app/clip.ts`) redraw the scene onto their own canvas at up to 1920 × 1080 and 30 fps, and the browser's `MediaRecorder` encodes it with the master output.
- **Simulation** (`src/world/sim.ts`): runs on Tone's transport, so it advances on the audio clock in steady 25 ms ticks. That keeps timing exact and keeps the music playing in a background tab. Every note is stamped with its exact audio time. The canvas uses those timestamps to light objects up at the moment they sound.
- **Rendering** (`src/world/render.ts`): drawn in code on a 2D canvas. Drones and textures use multiply blending for a soft, watercolour look.
- **Textures** (`scripts/prepare-textures.mjs`): rain, wind, waves and embers are field recordings. The script cuts a steady stretch of each, moving each cut to a quiet moment, and crossfades the end into the start so the loop has no seam. It then matches their loudness, limits peaks and encodes stereo AAC. Sources and licences are in [CREDITS.md](CREDITS.md). Fire has two layers on different loop lengths, a steady roar and crackle, so the repeat is hard to hear. The script writes `src/audio/texture-loops.ts`, which tells the player where each loop sits in its file.
- **Piano** (`scripts/render-samples.mjs`): the felt-piano notes are synthesised from sine partials.
- **Music theory** (`src/music/theory.ts`): each mood is a scale. Pitch comes from an object's height, snapped to that scale. Drones are limited to chord tones, so held notes never clash.
