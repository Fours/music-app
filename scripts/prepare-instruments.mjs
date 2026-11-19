// Turns note recordings into Skyloom's sampled instruments.
//
//   node scripts/prepare-instruments.mjs
//
// Needs ffmpeg. Reads samples-src/instruments/<id>/ (not committed, like the
// textures' recordings), writes public/samples/instruments/<id>/ and the
// manifest src/audio/instruments.ts. Options, mainly for testing:
//
//   --src <dir>        where the instruments' folders are
//   --out <dir>        where their files go
//   --manifest <file>  where the manifest goes
//   --format <m4a|flac|wav>
//
// An instrument's folder holds one file per note, named by note: c3.wav,
// g#3.wav (or gs3.wav), eb4.aif. Any format ffmpeg reads. For soft and hard
// versions of the notes, add -soft or -hard: c3-soft.wav, c3-hard.wav. An
// instrument uses one style or the other, not both. Next to the notes,
// instrument.json:
//
//   {
//     "name": "Piano",                 shown in the app
//     "kinds": ["chime", "pulse"],     which objects offer it: chime, pulse, orbit
//     "release": 1.2,                  seconds a note fades over once let go
//     "gainDb": 0,                     level trim for the whole instrument
//     "softDb": -8,                    optional: soft layer's level below hard
//                                      (default: the gap you recorded)
//     "fill": true,                    optional: a note missing from one layer
//                                      is made from the other layer's note
//     "maxSeconds": 6,                 optional: longest a note may ring
//     "onsetDb": -40,                  optional: where a note starts, below its peak
//     "stereo": false                  optional: keep stereo (default mono)
//   }
//
// For each note it cuts whatever comes before the note (silence or background
// sound) so it starts on the beat,
// cuts the tail once it has died away and fades it, and sets every note in a
// layer to the same loudness. See docs/decisions/0003-instrument-format.md.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** A path for messages: from the repo root when it's inside it. */
const show = (path) => (path.startsWith(ROOT + '/') ? relative(ROOT, path) : path)

const args = process.argv.slice(2)
function option(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : resolve(args[i + 1])
}
const SRC = option('src', join(ROOT, 'samples-src', 'instruments'))
const OUT = option('out', join(ROOT, 'public', 'samples', 'instruments'))
const MANIFEST = option('manifest', join(ROOT, 'src', 'audio', 'instruments.ts'))
const FORMAT = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'm4a'
if (!['m4a', 'flac', 'wav'].includes(FORMAT)) fail(`--format must be m4a, flac or wav, not ${FORMAT}`)

const SR = 48000
/**
 * Loudness every note is set to: its loudest 400 ms, in LUFS. Low enough that
 * an instrument with sharp attacks (peaks 16 dB above that) still fits under
 * the ceiling, so every instrument ends up at the same level.
 */
const TARGET_LUFS = -18
/**
 * The level the first sampled instrument, a synthesized felt piano, played at
 * (its C4, peak-normalized to 0.8). The app plays sampled instruments
 * PLAYBACK_GAIN_DB up, so they sit at that level among the synthesized sounds.
 */
const PIANO_LUFS = -11.4
/** −1.5 dBFS, leaving room for AAC's overshoot. */
const PEAK_CEILING = 10 ** (-1.5 / 20)
/** Kept before the note's onset, so its very start isn't cut. */
const PRE_ROLL = 0.001
const FADE_IN = 0.0005
const FADE_OUT = 0.3
/** Background closer than this to a note's peak gets a warning. */
const NOISY_DB = -30
/** Where the tail is cut, below the note's peak. */
const TAIL_DB = -60
/** The onset must be within this of the start of the written file. */
const ONSET_LIMIT_MS = 5
/**
 * A recording further than this from its note's pitch gets a warning. Pianos
 * are tuned a little sharp at the top and flat at the bottom on purpose
 * (stretch tuning), so this leaves room for that.
 */
const OUT_OF_TUNE_CENTS = 15
/**
 * Gaps wider than this between recorded notes get a warning. Every 6
 * semitones, no note is played more than 3 from a recording (decision 0003).
 */
const MAX_GAP = 6
/** How far past the outermost recorded note a kind's range may reach before it gets a warning. */
const MAX_REACH = 4
const BITRATE = '96k'
/** Longest name that fits on two lines of a Sound field chip (about 72 px wide). */
const MAX_NAME = 18
/** Longest word that fits on one line of a chip. */
const MAX_WORD = 10

/**
 * The pitches each kind plays: [lowest, highest] MIDI note. `core` is what the
 * recordings should cover; F3, B3, F4, B4, F5, B5, F6 covers all three.
 */
const RANGES = {
  chime: { all: [62, 93], core: [62, 93] }, // D4 to A6
  pulse: { all: [50, 79], core: [50, 79] }, // D3 to G5
  // Steps reach two octaves either side of a base note between D3 and D5, so
  // D1 to D7; most stay between D3 and D6, and the outer ones are repitched further.
  orbit: { all: [26, 98], core: [50, 86] },
}
const KINDS = Object.keys(RANGES)
const OPTIONS = ['name', 'kinds', 'release', 'gainDb', 'softDb', 'fill', 'maxSeconds', 'onsetDb', 'stereo']

// ---------------------------------------------------------------- helpers

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

const warnings = []
function warn(message) {
  warnings.push(message)
  console.log(`  warning: ${message}`)
}

function ffmpeg(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { input, maxBuffer: 2 ** 31 })
  if (r.error) fail(`can't run ffmpeg (${r.error.message}). Install it, e.g. brew install ffmpeg`)
  if (r.status !== 0) fail(`ffmpeg ${args.join(' ')}\n${r.stderr}`)
  return r.stdout
}

const encoder = ffmpeg(['-encoders']).toString().includes('aac_at') ? 'aac_at' : 'aac'

/** A file as interleaved float samples at SR. */
function decode(file, channels) {
  const out = ffmpeg(['-i', file, '-ac', String(channels), '-ar', String(SR), '-f', 'f32le', '-'])
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength))
}

const LETTERS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NOTE_FILE = /^([a-g])(#|s|b)?(\d)(?:-(soft|hard))?\.[a-z0-9]+$/i

/** Tone.js's name for a MIDI note, e.g. C#3. */
const noteName = (midi) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
/** The written file's name: lower case, sharps as s (a # would end a URL). */
const fileName = (midi) => noteName(midi).toLowerCase().replace('#', 's')

const db = (gain) => 20 * Math.log10(gain)
const fromDb = (d) => 10 ** (d / 20)

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Loudest frame (any channel) per frame. */
function frameAbs(samples, channels) {
  const frames = samples.length / channels
  const abs = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let m = 0
    for (let c = 0; c < channels; c++) m = Math.max(m, Math.abs(samples[f * channels + c]))
    abs[f] = m
  }
  return abs
}

/**
 * Where a written file's first sound is: the first frame within `onsetDb` of
 * its peak. After trimming, anything before the note is gone, so the first
 * sound is the note, and this checks that encoding didn't put silence first.
 */
function firstSound(samples, channels, onsetDb) {
  const abs = frameAbs(samples, channels)
  const peak = abs.reduce((a, b) => Math.max(a, b), 0)
  return { frame: abs.findIndex((v) => v >= peak * fromDb(onsetDb)) }
}

/**
 * Where a recorded note starts, and how loud the background before it is.
 *
 * A recording can open with background sound (room, hiss, a pedal, the last
 * note dying away) before the note itself, as loud as 12 dB under it. So the
 * note isn't the first sound above some level: it's the rise that leads to its
 * peak. In 1 ms steps, this walks back from the peak while the level stays
 * 6 dB above the background (the median level before the note) and within
 * `onsetDb` of the peak.
 */
function onsetOf(samples, channels, onsetDb) {
  const abs = frameAbs(samples, channels)
  const win = Math.round(SR / 1000)
  const env = new Float32Array(Math.ceil(abs.length / win))
  for (let i = 0; i < abs.length; i++) env[(i / win) | 0] = Math.max(env[(i / win) | 0], abs[i])
  let top = 0
  for (let w = 1; w < env.length; w++) if (env[w] > env[top]) top = w
  const peak = env[top] ?? 0
  // The background: the median level up to 20 ms before the peak, if there's that much.
  const before = Array.from(env.subarray(0, Math.max(0, top - 20))).sort((a, b) => a - b)
  const background = before.length >= 20 ? before[before.length >> 1] : 0
  const threshold = Math.max(peak * fromDb(onsetDb), background * fromDb(6))
  let w = top
  while (w > 0 && env[w - 1] >= threshold) w--
  return { frame: w * win, peak, abs, background }
}

/**
 * The loudest 400 ms (EBU R128 momentary loudness, K-weighted), in LUFS. The
 * filter coefficients are BS.1770's for 48 kHz.
 */
function loudness(samples, channels) {
  const frames = samples.length / channels
  const power = new Float64Array(frames)
  for (let c = 0; c < channels; c++) {
    let [x1, x2, y1, y2, z1, z2] = [0, 0, 0, 0, 0, 0]
    for (let f = 0; f < frames; f++) {
      const x = samples[f * channels + c]
      // High shelf (the head's effect), then a high-pass (RLB).
      const y = 1.53512485958697 * x - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - 0.73248077421585 * y2
      const z = y - 2 * y1 + y2 + 1.99004745483398 * z1 - 0.99007225036621 * z2
      x2 = x1; x1 = x
      y2 = y1; y1 = y
      z2 = z1; z1 = z
      power[f] += z * z
    }
  }
  const win = Math.round(SR * 0.4)
  const hop = Math.round(SR * 0.1)
  let best = -Infinity
  for (let start = 0; start + win <= Math.max(frames, win); start += hop) {
    let sum = 0
    for (let f = start; f < Math.min(frames, start + win); f++) sum += power[f]
    best = Math.max(best, -0.691 + 10 * Math.log10(sum / win || 1e-12))
  }
  return best
}

/**
 * How far a note's pitch is from `midi`, in cents, or null if it can't tell.
 * Measured on a stretch from 150 ms in, past the attack, by where the signal
 * best matches itself shifted (YIN's difference function): first one period,
 * searched within a semitone of the note, then refined over as many periods as
 * fit in about 12 ms, which makes the high notes' short periods precise.
 */
function centsOff(samples, channels, midi) {
  const frames = samples.length / channels
  const mono = new Float32Array(frames)
  for (let f = 0; f < frames; f++) for (let c = 0; c < channels; c++) mono[f] += samples[f * channels + c] / channels
  const expected = SR / (440 * 2 ** ((midi - 69) / 12))
  const start = Math.round(0.15 * SR)
  const span = Math.round(0.12 * SR)
  const maxLag = Math.ceil(Math.max(expected * 1.06, Math.round(0.012 * SR / expected) * expected * 1.01)) + 2
  if (start + span + maxLag > frames) return null
  const diff = (lag) => {
    let sum = 0
    for (let i = start; i < start + span; i++) {
      const d = mono[i] - mono[i + lag]
      sum += d * d
    }
    return sum
  }
  // The best lag between lo and hi, to a fraction of a sample.
  const best = (lo, hi) => {
    let at = lo
    let min = Infinity
    const values = new Map()
    for (let lag = lo; lag <= hi; lag++) {
      const v = diff(lag)
      values.set(lag, v)
      if (v < min) [min, at] = [v, lag]
    }
    if (at === lo || at === hi) return null
    const [a, b, c] = [values.get(at - 1), min, values.get(at + 1)]
    const shift = a + c - 2 * b > 0 ? (a - c) / (2 * (a + c - 2 * b)) : 0
    return at + shift
  }
  const one = best(Math.floor(expected / 1.06), Math.ceil(expected * 1.06))
  if (one === null) return null
  const n = Math.max(1, Math.round(0.012 * SR / one))
  const many = n === 1 ? one : best(Math.floor(n * one - one * 0.3), Math.ceil(n * one + one * 0.3))
  if (many === null) return null
  return 1200 * Math.log2(expected / (many / n))
}

// ---------------------------------------------------------------- one note

/** Trims a recorded note: silence before it, the tail after it dies away. */
function trim(file, spec, channels, midi) {
  const raw = decode(file, channels)
  const { frame, peak, abs, background } = onsetOf(raw, channels, spec.onsetDb ?? -40)
  if (peak === 0) fail(`${show(file)} is silent`)
  if (background > peak * fromDb(NOISY_DB))
    warn(`${show(file)}: the background before the note is only ${(-db(background / peak)).toFixed(0)} dB below it, so it will be heard in the tail; noise reduction on the recording would help`)
  const start = Math.max(0, frame - Math.round(PRE_ROLL * SR))
  let end = abs.length
  const tail = peak * fromDb(TAIL_DB)
  while (end > frame && abs[end - 1] < tail) end--
  if (spec.maxSeconds) end = Math.min(end, start + Math.round(spec.maxSeconds * SR))
  const note = raw.slice(start * channels, end * channels)
  const frames = end - start
  const fadeIn = Math.round(FADE_IN * SR)
  const fadeOut = Math.min(Math.round(FADE_OUT * SR), Math.round(frames / 4))
  for (let f = 0; f < frames; f++) {
    const g = Math.min(1, f / fadeIn, (frames - f) / fadeOut)
    if (g < 1) for (let c = 0; c < channels; c++) note[f * channels + c] *= g
  }
  const cents = centsOff(note, channels, midi)
  if (cents === null) warn(`${show(file)}: couldn't measure its pitch; check it's ${noteName(midi)}`)
  else if (Math.abs(cents) > OUT_OF_TUNE_CENTS)
    warn(`${show(file)}: ${Math.abs(cents).toFixed(0)} cents ${cents > 0 ? 'sharp' : 'flat'} of ${noteName(midi)} (more than ${OUT_OF_TUNE_CENTS})`)
  return { samples: note, trimmed: start / SR, seconds: frames / SR, loudness: loudness(note, channels), peak, cents }
}

function encode(samples, channels, path) {
  const codec = { m4a: ['-c:a', encoder, '-b:a', BITRATE, '-movflags', '+faststart'], flac: ['-c:a', 'flac', '-sample_fmt', 's16'], wav: ['-c:a', 'pcm_s16le'] }
  ffmpeg(
    ['-f', 'f32le', '-ac', String(channels), '-ar', String(SR), '-i', '-', ...codec[FORMAT], '-y', path],
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
  )
}

// ---------------------------------------------------------------- one instrument

function readSpec(dir, id) {
  const path = join(dir, 'instrument.json')
  if (!existsSync(path)) fail(`${id}: no instrument.json`)
  let spec
  try {
    spec = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(`${id}/instrument.json: ${e.message}`)
  }
  for (const key of Object.keys(spec)) if (!OPTIONS.includes(key)) fail(`${id}/instrument.json: unknown option "${key}"`)
  if (typeof spec.name !== 'string' || !spec.name.trim()) fail(`${id}/instrument.json: needs a name`)
  if (spec.name.length > MAX_NAME) warn(`${id}: the name "${spec.name}" is longer than ${MAX_NAME} characters and may not fit on two lines in the Sound field`)
  const longWord = spec.name.split(' ').find((w) => w.length > MAX_WORD)
  if (longWord) warn(`${id}: "${longWord}" is longer than ${MAX_WORD} letters and may break mid-word in the Sound field`)
  if (!Array.isArray(spec.kinds) || !spec.kinds.length || spec.kinds.some((k) => !KINDS.includes(k)))
    fail(`${id}/instrument.json: kinds must list some of ${KINDS.join(', ')}`)
  if (!(spec.release > 0)) fail(`${id}/instrument.json: release must be a number of seconds above 0`)
  for (const key of ['gainDb', 'softDb', 'maxSeconds', 'onsetDb'])
    if (spec[key] !== undefined && typeof spec[key] !== 'number') fail(`${id}/instrument.json: ${key} must be a number`)
  return spec
}

/** The note files, grouped by layer: { single | soft | hard: Map<midi, file> }. */
function readNotes(dir, id) {
  const layers = {}
  for (const name of readdirSync(dir).sort()) {
    if (name === 'instrument.json' || name.startsWith('.')) continue
    const m = NOTE_FILE.exec(name)
    if (!m) fail(`${id}/${name}: not a note name like c3.wav, g#3.wav, eb4-soft.wav`)
    const [, letter, accidental, octave, layer = 'single'] = m
    const midi = 12 * (Number(octave) + 1) + LETTERS[letter.toLowerCase()] + (accidental === 'b' ? -1 : accidental ? 1 : 0)
    layers[layer.toLowerCase()] ??= new Map()
    const notes = layers[layer.toLowerCase()]
    if (notes.has(midi)) fail(`${id}: two files for ${noteName(midi)}${layer === 'single' ? '' : ` (${layer})`}`)
    notes.set(midi, join(dir, name))
  }
  if (!Object.keys(layers).length) fail(`${id}: no note files`)
  if (layers.single && (layers.soft || layers.hard)) fail(`${id}: mixes plain note files (c3.wav) with -soft and -hard ones`)
  if ((layers.soft || layers.hard) && !(layers.soft && layers.hard)) fail(`${id}: has ${layers.soft ? 'soft' : 'hard'} notes but no ${layers.soft ? 'hard' : 'soft'} ones`)
  return layers
}

/** Warns about gaps between notes and about the range each kind plays. */
function checkSpacing(midis, kinds, label) {
  for (let i = 1; i < midis.length; i++) {
    const gap = midis[i] - midis[i - 1]
    if (gap > MAX_GAP) warn(`${label}: ${gap} semitones from ${noteName(midis[i - 1])} to ${noteName(midis[i])} (record at least every ${MAX_GAP})`)
  }
  const core = [Math.min(...kinds.map((k) => RANGES[k].core[0])), Math.max(...kinds.map((k) => RANGES[k].core[1]))]
  const all = [Math.min(...kinds.map((k) => RANGES[k].all[0])), Math.max(...kinds.map((k) => RANGES[k].all[1]))]
  const who = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}s` : `${kinds[0]}s`
  if (midis[0] > core[0] + MAX_REACH) warn(`${label}: lowest note ${noteName(midis[0])}, but ${who} play down to ${noteName(core[0])}`)
  if (midis.at(-1) < core[1] - MAX_REACH) warn(`${label}: highest note ${noteName(midis.at(-1))}, but ${who} play up to ${noteName(core[1])}`)
  const furthest = ([lo, hi]) => {
    let worst = { by: 0, at: lo }
    for (let m = lo; m <= hi; m++) {
      const by = Math.min(...midis.map((s) => Math.abs(s - m)))
      if (by > worst.by) worst = { by, at: m }
    }
    return `${worst.by} semitones (${noteName(worst.at)})`
  }
  return (
    `furthest repitch ${furthest(core)} from ${noteName(core[0])} to ${noteName(core[1])}` +
    (all[0] < core[0] || all[1] > core[1] ? `, ${furthest(all)} out to ${noteName(all[0])} and ${noteName(all[1])}` : '')
  )
}

function prepare({ id, spec, layers }) {
  const channels = spec.stereo ? 2 : 1
  const names = layers.single ? ['single'] : ['soft', 'hard']
  console.log(`\n${id}: ${spec.name} (${spec.kinds.join(', ')})`)
  if (layers.single && spec.softDb !== undefined) warn(`${id}: softDb does nothing, since its notes are recorded at one strength`)

  // Trim every recorded note.
  const notes = {}
  for (const layer of names) {
    notes[layer] = new Map()
    for (const [midi, file] of layers[layer]) notes[layer].set(midi, { ...trim(file, spec, channels, midi), source: file })
  }

  // A note recorded in one layer only is made from the other layer's (unless fill is false).
  if (!layers.single && spec.fill !== false) {
    for (const [layer, other] of [['soft', 'hard'], ['hard', 'soft']]) {
      for (const [midi, note] of notes[other]) {
        if (layers[layer].has(midi) || notes[layer].has(midi)) continue
        warn(`${id}: no ${layer} ${noteName(midi)}; using the ${other} one at the ${layer} level`)
        notes[layer].set(midi, { ...note, borrowed: other })
      }
    }
  }

  // Levels: every note in a layer at the same loudness; soft sits below hard by
  // the gap that was recorded (the median over the notes both layers have).
  const target = { single: TARGET_LUFS + (spec.gainDb ?? 0), hard: TARGET_LUFS + (spec.gainDb ?? 0) }
  if (!layers.single) {
    const shared = [...layers.soft.keys()].filter((m) => layers.hard.has(m))
    const loud = (layer, ms) => ms.map((m) => notes[layer].get(m).loudness)
    const recorded = shared.length
      ? median(shared.map((m) => notes.soft.get(m).loudness - notes.hard.get(m).loudness))
      : median(loud('soft', [...layers.soft.keys()])) - median(loud('hard', [...layers.hard.keys()]))
    const gap = spec.softDb ?? recorded
    target.soft = target.hard + gap
    console.log(`  soft is ${(-recorded).toFixed(1)} dB below hard as recorded${spec.softDb !== undefined ? `; softDb puts it ${(-gap).toFixed(1)} dB below` : ''}`)
    if (recorded > -1) warn(`${id}: the soft notes are barely quieter than the hard ones (${recorded.toFixed(1)} dB)`)
  }
  // Keep every peak under the ceiling, lowering the whole instrument if needed.
  let over = 0
  for (const layer of names)
    for (const n of notes[layer].values()) over = Math.max(over, db(n.peak) + target[layer] - n.loudness - db(PEAK_CEILING))
  if (over > 0) {
    for (const layer of names) target[layer] -= over
    warn(`${id}: lowered ${over.toFixed(1)} dB to keep its peaks under ${db(PEAK_CEILING).toFixed(1)} dBFS, so it's quieter than the others`)
  }

  // Write the files, and check each note starts at the start of its file.
  rmSync(join(OUT, id), { recursive: true, force: true })
  mkdirSync(join(OUT, id), { recursive: true })
  const manifest = { id, name: spec.name, kinds: spec.kinds, release: spec.release, layers: [] }
  let bytes = 0
  for (const layer of names) {
    const midis = [...notes[layer].keys()].sort((a, b) => a - b)
    const label = layer === 'single' ? id : `${id} ${layer}`
    const spread = checkSpacing(midis, spec.kinds, label)
    const entry = { name: layer, notes: {} }
    for (const midi of midis) {
      const n = notes[layer].get(midi)
      const gain = fromDb(target[layer] - n.loudness)
      const out = n.samples.map((v) => v * gain)
      const file = `${fileName(midi)}${layer === 'single' ? '' : `-${layer}`}.${FORMAT}`
      const path = join(OUT, id, file)
      encode(out, channels, path)
      const size = statSync(path).size
      bytes += size
      const back = firstSound(decode(path, channels), channels, spec.onsetDb ?? -40)
      const onsetMs = (back.frame / SR) * 1000
      if (onsetMs > ONSET_LIMIT_MS) fail(`${id}/${file}: starts ${onsetMs.toFixed(1)} ms in (limit ${ONSET_LIMIT_MS} ms)`)
      entry.notes[noteName(midi)] = `instruments/${id}/${file}`
      console.log(
        `  ${file.padEnd(16)} ${n.borrowed ? `from ${n.borrowed}`.padEnd(14) : `trimmed ${(n.trimmed * 1000).toFixed(0).padStart(4)} ms`}` +
          `  ${n.seconds.toFixed(2)} s  gain ${db(gain) >= 0 ? '+' : ''}${db(gain).toFixed(1)} dB` +
          `  onset ${onsetMs.toFixed(1)} ms  pitch ${n.cents === null ? '?' : `${n.cents >= 0 ? '+' : ''}${n.cents.toFixed(0)}¢`}  ${(size / 1024).toFixed(0)} KB`,
      )
    }
    console.log(`  ${label}: ${midis.length} notes, ${spread}`)
    manifest.layers.push(entry)
  }
  console.log(`  ${(bytes / 1024).toFixed(0)} KB in all`)
  return manifest
}

// ---------------------------------------------------------------- main

if (!existsSync(SRC)) fail(`${show(SRC)} not found. The instruments' recordings aren't committed; see the comment at the top of this script.`)
const ids = readdirSync(SRC).filter((name) => !name.startsWith('.') && statSync(join(SRC, name)).isDirectory()).sort()
if (!ids.length) fail(`no instruments in ${show(SRC)}`)
for (const id of ids) if (!/^[a-z0-9-]+$/.test(id)) fail(`${id}: folder names are ids: lower case, digits and dashes`)

// Check every instrument's folder before writing anything.
const sources = ids.map((id) => ({ id, spec: readSpec(join(SRC, id), id), layers: readNotes(join(SRC, id), id) }))
const instruments = sources.map(prepare)

if (existsSync(OUT))
  for (const name of readdirSync(OUT))
    if (!name.startsWith('.') && !ids.includes(name)) warn(`${show(join(OUT, name))} has no source and isn't in the manifest; delete it if the instrument is gone`)

mkdirSync(dirname(MANIFEST), { recursive: true })
writeFileSync(
  MANIFEST,
  `// Generated by scripts/prepare-instruments.mjs from samples-src/instruments/;
// change the instruments' instrument.json or the script, not this file.

import type { Kind } from '../world/types'

export type InstrumentKind = Extract<Kind, 'chime' | 'pulse' | 'orbit'>

/** 'single' for an instrument recorded at one strength; otherwise soft and hard. */
export type LayerName = 'single' | 'soft' | 'hard'

export interface InstrumentLayer {
  name: LayerName
  /** Note (Tone.js name, e.g. 'C#3') → file in public/samples/. */
  notes: Record<string, string>
}

export interface Instrument {
  id: string
  /** Shown in the app. */
  name: string
  /** Which objects offer it. */
  kinds: InstrumentKind[]
  /** Seconds a note fades over once it's let go. */
  release: number
  /** Softest first. */
  layers: InstrumentLayer[]
}

/** Gain the app gives every sampled instrument, so it sits at the level the synthesized felt piano played at. */
export const PLAYBACK_GAIN_DB = ${+(PIANO_LUFS - TARGET_LUFS).toFixed(1)}

export const INSTRUMENTS: Instrument[] = ${JSON.stringify(instruments, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")}
`,
)
console.log(`\nwrote ${show(MANIFEST)}${warnings.length ? `, with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}`)
