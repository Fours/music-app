// Turns raw field recordings into Drift's texture loops.
//
//   node scripts/prepare-textures.mjs
//
// Needs ffmpeg. Reads samples-src/<texture>/… (not committed: the originals
// are large), writes public/samples/<layer>.m4a and src/audio/texture-loops.ts.
//
// For each layer it cuts the chosen stretches of the recordings, moving each
// cut to the quietest moment nearby (between waves, between crackles), joins
// them with equal-power crossfades and folds the end back into the start so
// the loop has no seam. A stretch can also have its loudest pops cut out, the
// audio either side spliced back together. Every texture is set to the same
// loudness, with peaks limited, then encoded as stereo AAC.
//
// AAC adds a few milliseconds of silence at the start and end of a file, and
// browsers differ in whether they trim it. So each file carries PAD seconds of
// the loop's own tail before it and head after it, and the player loops the
// window in between: any window that long is seamless, wherever it falls.

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'samples-src')
const OUT = join(ROOT, 'public', 'samples')
const MANIFEST = join(ROOT, 'src', 'audio', 'texture-loops.ts')

const SR = 48000
const CH = 2
/** Integrated loudness every texture is set to (the old synthesized loops sat near this). */
const TARGET_LUFS = -17
/**
 * Fire is mostly quiet bed with pops 40 dB above it, so at −17 LUFS the pops
 * would be crushed by the limiter. Its transients carry it at a lower level.
 */
const TARGET_OVERRIDE = { embers: -22 }
/** −2 dBFS, leaving room for AAC's overshoot. */
const PEAK_LIMIT = 0.79
const PAD = 0.5
const BITRATE = '128k'

/**
 * What each texture is made of. A texture can have several layers, played
 * together at different loop lengths so their repeats rarely line up. A layer
 * is one or more stretches of recordings joined end to end. `start` and
 * `length` are in seconds; cuts may move by up to `nudge` seconds to land on a
 * quiet moment. `gainDb` balances layers within a texture. `release` is the
 * peak limiter's release in ms: short for fire, so a pop is clipped rather
 * than ducking the bed after it. `popsAbove` cuts out any pop in that stretch
 * louder than that and splices the audio either side together. It's judged as
 * the pop will be heard, after the gain and the limiter: the RMS of its loudest
 * 50 ms, in dB relative to the limit (0 would be 50 ms pinned at the limit).
 * That matters for fire: the limiter shaves a sharp crackle down to almost
 * nothing but lets most of a broad thump through, whatever their levels in the
 * recording.
 */
/** Fire pops louder than this are cut; see `popsAbove` below. */
const POPS_ABOVE = -17.5

const TEXTURES = {
  rain: [{ name: 'rain', segments: [{ file: 'rain/rain-ambient.wav', start: 25, length: 60 }] }],
  // The first 30 s of this recording are clipped and sound different; skip them.
  waves: [{ name: 'waves', nudge: 4, segments: [{ file: 'waves/waves-and-sea.wav', start: 92, length: 58 }] }],
  wind: [{ name: 'wind', segments: [{ file: 'wind/wind.wav', start: 1, length: 34 }] }],
  embers: [
    // A steady roar, with crackles over it on a different loop length.
    { name: 'embers', gainDb: -2, release: 15, segments: [{ file: 'embers/altar-fire.wav', start: 0.5, length: 24.5 }] },
    {
      name: 'embers-crackle',
      gainDb: -5,
      fade: 1,
      release: 15,
      segments: [
        { file: 'embers/torch-fire.wav', start: 0.5, length: 19.5 },
        // This recording has a dozen broad thumps far louder, once limited, than
        // anything in the torch recording; cut any more than ~2 dB over its loudest.
        { file: 'embers/fire-pops.wav', start: 0.5, length: 21.5, popsAbove: POPS_ABOVE },
      ],
    },
  ],
}

// ---------------------------------------------------------------- ffmpeg

function run(args, input) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { input, maxBuffer: 2 ** 31 })
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`)
  return r
}

const cache = new Map()
/** Whole recording as interleaved stereo float at SR. */
function load(file) {
  if (!cache.has(file)) {
    const out = run(['-i', join(SRC, file), '-ac', String(CH), '-ar', String(SR), '-f', 'f32le', '-']).stdout
    cache.set(file, new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)))
  }
  return cache.get(file)
}

const RAW = ['-f', 'f32le', '-ac', String(CH), '-ar', String(SR)]

function loudness(samples) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...RAW, '-i', '-', '-af', 'ebur128', '-f', 'null', '-'], {
    input: Buffer.from(samples.buffer),
    maxBuffer: 2 ** 31,
  })
  const m = /I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.toString().split('Summary:').pop())
  if (!m) throw new Error('could not measure loudness')
  return Number(m[1])
}

const encoder = run(['-encoders']).stdout.toString().includes('aac_at') ? 'aac_at' : 'aac'

// ---------------------------------------------------------------- editing

const frames = (x) => x.length / CH

/** Mean power of one second of audio from frame `at`. */
function power(x, at) {
  let sum = 0
  for (let i = at * CH; i < (at + SR) * CH; i++) sum += x[i] * x[i]
  return sum
}

/** Frame near `at` (within `radius` seconds, and not past `max`) where the next second is quietest. */
function quietest(x, at, radius, max = frames(x) - SR) {
  const step = Math.round(SR * 0.05)
  let best = Math.min(at, max)
  let low = Infinity
  for (let f = Math.max(0, at - radius * SR); f <= Math.min(max, frames(x) - SR, at + radius * SR); f += step) {
    const p = power(x, f)
    if (p < low) [low, best] = [p, f]
  }
  return best
}

/** Equal-power crossfade of `a`'s last `n` frames into `b`'s first `n`. */
function join2(a, b, n) {
  const out = new Float32Array(a.length + b.length - n * CH)
  out.set(a.subarray(0, a.length - n * CH))
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const fo = Math.cos((t * Math.PI) / 2)
    const fi = Math.sin((t * Math.PI) / 2)
    for (let c = 0; c < CH; c++) {
      const k = a.length - n * CH + i * CH + c
      out[k] = a[k] * fo + b[i * CH + c] * fi
    }
  }
  out.set(b.subarray(n * CH), a.length)
  return out
}

/** Crossfade where a pop has been cut out: long enough not to click, short enough to keep nothing of the pop. */
const SPLICE = 0.03

/** RMS in dB of `len` frames of `x` from frame `at`. */
function levelDb(x, at, len) {
  let sum = 0
  for (let i = at * CH; i < (at + len) * CH; i++) sum += x[i] * x[i]
  return 10 * Math.log10(sum / (len * CH) + 1e-12)
}

/** The recording as it will be heard: through the layer's gain and limiter. For judging pops. */
function heardAs(file, gainDb, release) {
  const key = `${file} ${gainDb.toFixed(2)} ${release}`
  if (!cache.has(key)) {
    const x = load(file)
    const af = `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:attack=1:release=${release}:level=false:latency=1`
    const out = run([...RAW, '-i', '-', '-af', af, ...RAW, '-'], Buffer.from(x.buffer)).stdout
    cache.set(key, new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)))
  }
  return cache.get(key)
}

/** The loudest 50 ms between frames `from` and `to` of `heard`, in dB relative to the limit. */
function loudestDb(heard, from, to) {
  const win = Math.round(SR * 0.05)
  let top = -Infinity
  for (let f = from; f + win <= to; f += Math.round(SR * 0.005)) top = Math.max(top, levelDb(heard, f, win))
  return top - 20 * Math.log10(PEAK_LIMIT)
}

/**
 * Stretches of `x` between frames `from` and `to` holding a pop whose loudest
 * 50 ms in `heard` (the same audio as it will be heard) passes `aboveDb`
 * relative to the limit. Each runs from where the pop rises out of the bed
 * around it to where its tail has died back down.
 */
function findPops(x, heard, from, to, aboveDb) {
  const threshold = 20 * Math.log10(PEAK_LIMIT) + aboveDb
  const short = Math.round(SR * 0.005)
  const win = Math.round(SR * 0.05)
  const regions = []
  for (let f = from; f + win <= to; f += short) {
    if (levelDb(heard, f, win) < threshold) continue
    // The bed: median 5 ms level over the 3 s around the pop.
    const around = []
    for (let g = Math.max(0, f - SR * 1.5); g < Math.min(frames(x) - short, f + SR * 1.5); g += short) around.push(levelDb(x, g, short))
    around.sort((a, b) => a - b)
    const settled = around[around.length >> 1] + 10
    const limit = Math.round(SR * 0.4)
    let start = f
    while (start > f - limit && levelDb(x, start - short, short) > settled) start -= short
    let end = f + win
    while (end < f + win + limit && levelDb(x, end, short) > settled) end += short
    start = Math.max(from, start - Math.round(SR * 0.015))
    end = Math.min(to, end + Math.round(SR * 0.04))
    // A sliver between two pops is mostly pop; take it with them.
    const last = regions[regions.length - 1]
    if (last && start <= last[1] + SR * 0.1) last[1] = Math.max(last[1], end)
    else regions.push([start, end])
    f = end
  }
  return regions
}

/** Frames `from`–`to` of `x`, less the `cuts`, spliced together. */
function excise(x, from, to, cuts) {
  const n = Math.round(SPLICE * SR)
  let out = null
  let at = from
  for (const [a, b] of [...cuts, [to, to]]) {
    const piece = x.slice(at * CH, a * CH)
    out = out ? join2(out, piece, n) : piece
    at = b
  }
  return out
}

/** `gain`: the texture's final gain, which pop removal needs to judge pops as they'll be heard. */
function buildLayer({ segments, fade = 3, nudge = 2, gainDb = 0, release = 80 }, gain) {
  const n = Math.round(fade * SR)
  let chain = null
  const cuts = []
  for (const s of segments) {
    const x = load(s.file)
    const from = quietest(x, Math.round(s.start * SR), nudge)
    const to = quietest(x, from + Math.round(s.length * SR), nudge, frames(x) - Math.max(n, SR))
    if (to + n > frames(x)) throw new Error(`${s.file}: not enough audio after ${(to / SR).toFixed(1)} s`)
    // Each piece runs `fade` past its cut, to crossfade into whatever follows.
    let note = ''
    let pops = []
    if (s.popsAbove !== undefined && gain !== undefined) {
      const heard = heardAs(s.file, gain + gainDb, release)
      pops = findPops(x, heard, from, to + n, s.popsAbove)
      // The loudest of what's left, to judge `popsAbove` by.
      let kept = -Infinity
      let at = from
      for (const [a, b] of [...pops, [to + n, to + n]]) {
        kept = Math.max(kept, loudestDb(heard, at, a))
        at = b
      }
      const list = pops.map(([a, b]) => `${(a / SR).toFixed(2)}–${(b / SR).toFixed(2)}`).join(', ')
      note = `, less ${pops.length} pops (${list} s); loudest left ${kept.toFixed(1)} dB`
    } else if (gain !== undefined) {
      const heard = heardAs(s.file, gain + gainDb, release)
      note = `; loudest ${loudestDb(heard, from, to + n).toFixed(1)} dB`
    }
    const piece = excise(x, from, to + n, pops)
    cuts.push(`${s.file} ${(from / SR).toFixed(2)}–${(to / SR).toFixed(2)} s${note}`)
    chain = chain ? join2(chain, piece, n) : piece
  }
  // Fold the overhang back over the start, so the end runs into the beginning.
  const len = frames(chain) - n
  const loop = chain.slice(0, len * CH)
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    const fi = Math.sin((t * Math.PI) / 2)
    const fo = Math.cos((t * Math.PI) / 2)
    for (let c = 0; c < CH; c++) loop[i * CH + c] = chain[i * CH + c] * fi + chain[(len + i) * CH + c] * fo
  }
  return { loop, len, cuts, gainDb, release }
}

/** The loop (and PAD either side of it), wrapped around. */
function padded(loop, len) {
  const pad = Math.round(PAD * SR)
  const out = new Float32Array((len + 2 * pad) * CH)
  out.set(loop.subarray((len - pad) * CH), 0)
  out.set(loop, pad * CH)
  out.set(loop.subarray(0, pad * CH), (pad + len) * CH)
  return out
}

/**
 * Applies gain and the peak limiter. The limiter runs over the wrapped loop so
 * its state at the start matches the end, then the loop is cut back out.
 */
function limit(loop, len, gainDb, release) {
  const pad = Math.round(PAD * SR)
  const af = `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:attack=1:release=${release}:level=false:latency=1`
  const out = run([...RAW, '-i', '-', '-af', af, ...RAW, '-'], Buffer.from(padded(loop, len).buffer)).stdout
  const all = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength))
  return all.slice(pad * CH, (pad + len) * CH)
}

function encode(name, loop, len) {
  run(
    [...RAW, '-i', '-', '-c:a', encoder, '-b:a', BITRATE, '-movflags', '+faststart', '-y', join(OUT, `${name}.m4a`)],
    Buffer.from(padded(loop, len).buffer),
  )
}

/** Layers mixed at their final levels, over the longest layer's length. */
function mixOf(layers) {
  const longest = Math.max(...layers.map((l) => l.len))
  const mix = new Float32Array(longest * CH)
  for (const l of layers) for (let i = 0; i < mix.length; i++) mix[i] += l.loop[i % l.loop.length]
  return mix
}

/**
 * The gain that brings the layers, mixed and limited, to `target` LUFS, and the
 * limited layers. Limiting takes some loudness off the peaks, so it measures
 * after limiting and corrects.
 */
function level(built, target) {
  let gain = target - loudness(mixOf(built.map((b) => ({ loop: b.loop.map((v) => v * 10 ** (b.gainDb / 20)), len: b.len }))))
  let done
  for (let pass = 0; pass < 4; pass++) {
    done = built.map((b) => ({ ...b, loop: limit(b.loop, b.len, gain + b.gainDb, b.release) }))
    const miss = target - loudness(mixOf(done))
    if (Math.abs(miss) < 0.2) break
    gain += miss
  }
  return { gain, done }
}

// ---------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true })
const manifest = {}
for (const [texture, layers] of Object.entries(TEXTURES)) {
  const target = TARGET_OVERRIDE[texture] ?? TARGET_LUFS
  // Pops are judged as they'll be heard, which depends on the final gain, and
  // cutting them changes the gain, so settle the two together.
  let built = layers.map((l) => ({ ...buildLayer(l), name: l.name }))
  let { gain, done } = level(built, target)
  if (layers.some((l) => l.segments.some((s) => s.popsAbove !== undefined))) {
    for (let pass = 0; pass < 6; pass++) {
      built = layers.map((l) => ({ ...buildLayer(l, gain), name: l.name }))
      const next = level(built, target)
      const settled = Math.abs(next.gain - gain) < 0.1
      ;({ gain, done } = next)
      if (settled) break
    }
  }
  manifest[texture] = []
  for (const [k, b] of built.entries()) {
    encode(b.name, done[k].loop, b.len)
    manifest[texture].push({ file: `${b.name}.m4a`, start: PAD, length: +(b.len / SR).toFixed(6) })
    // How far peaks went past the limit, and how often: a few dB is fine, much more crushes them.
    const g = 10 ** ((gain + b.gainDb) / 20)
    const win = SR / 100
    let peak = 0
    let hot = 0
    for (let w = 0; w < b.len; w += win) {
      let p = 0
      for (let i = w * CH; i < Math.min(b.len, w + win) * CH; i++) p = Math.max(p, Math.abs(b.loop[i]))
      peak = Math.max(peak, p)
      if (p * g > PEAK_LIMIT) hot++
    }
    const over = Math.max(0, 20 * Math.log10((peak * g) / PEAK_LIMIT))
    const share = (100 * hot) / Math.ceil(b.len / win)
    console.log(
      `${b.name}.m4a  ${(b.len / SR).toFixed(2)} s  gain ${(gain + b.gainDb).toFixed(1)} dB  ` +
        `limiting up to ${over.toFixed(1)} dB, ${share.toFixed(1)}% of the time\n  ${b.cuts.join('\n  ')}`,
    )
  }
  console.log(`  ${texture}: ${loudness(mixOf(done)).toFixed(1)} LUFS`)
}

writeFileSync(
  MANIFEST,
  `// Generated by scripts/prepare-textures.mjs; edit the script, not this file.

export interface TextureLoop {
  file: string
  /** Seconds into the file where the seamless loop starts. */
  start: number
  /** Loop length in seconds. */
  length: number
}

export const TEXTURE_LOOPS: Record<string, TextureLoop[]> = ${JSON.stringify(manifest, null, 2).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")}
`,
)
console.log(`wrote ${MANIFEST.replace(ROOT + '/', '')}`)
