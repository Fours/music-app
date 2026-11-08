// Renders Drift's bundled audio: seamless ambient texture loops and a few
// felt-piano notes. Everything is synthesized from noise and sine partials,
// so there are no third-party recordings to license.
//
//   node scripts/render-samples.mjs
//
// Output: public/samples/*.wav (mono, 16-bit). The script is deterministic.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples')
const SR = 24000
const TAU = Math.PI * 2

// ---------------------------------------------------------------- utilities

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** RBJ biquad; coefficients can be updated per sample for sweeps. */
class Biquad {
  constructor(type, freq, q = 0.707) {
    this.type = type
    this.x1 = this.x2 = this.y1 = this.y2 = 0
    this.set(freq, q)
  }
  set(freq, q = this.q) {
    this.q = q
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    let b0, b1, b2
    if (this.type === 'lowpass') {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2
    } else if (this.type === 'highpass') {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha // bandpass, constant peak gain
    }
    const a0 = 1 + alpha
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }
}

/** Paul Kellet's pink noise filter. */
function pinkSource(rand) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  return () => {
    const w = rand() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179
    b1 = 0.99332 * b1 + w * 0.0750759
    b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856
    b4 = 0.55 * b4 + w * 0.5329522
    b5 = -0.7616 * b5 - w * 0.016898
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
    return out * 0.11
  }
}

function brownSource(rand) {
  let last = 0
  return () => {
    last = (last + 0.02 * (rand() * 2 - 1)) / 1.02
    return last * 3.5
  }
}

/** Sum of sines whose periods divide the loop length, so it loops exactly. */
function loopLfo(seconds, cycles, rand) {
  const parts = cycles.map((c) => ({ f: c / seconds, p: rand() * TAU }))
  return (t) => parts.reduce((s, { f, p }) => s + Math.sin(TAU * f * t + p), 0) / parts.length
}

/**
 * Renders `seconds + fade` of audio and folds the overhang back onto the
 * start with an equal-power crossfade, giving a click-free loop.
 */
function renderLoop(seconds, fade, fn) {
  const n = Math.round(seconds * SR)
  const f = Math.round(fade * SR)
  const raw = new Float32Array(n + f)
  fn(raw)
  const out = raw.slice(0, n)
  for (let i = 0; i < f; i++) {
    const k = i / f
    out[i] = raw[n + i] * Math.cos((k * Math.PI) / 2) + raw[i] * Math.sin((k * Math.PI) / 2)
  }
  return out
}

function normalize(buf, peak = 0.89) {
  let max = 0
  for (const v of buf) max = Math.max(max, Math.abs(v))
  const g = max > 0 ? peak / max : 1
  for (let i = 0; i < buf.length; i++) buf[i] *= g
  return buf
}

function writeWav(name, data) {
  const bytes = 44 + data.length * 2
  const b = Buffer.alloc(bytes)
  b.write('RIFF', 0); b.writeUInt32LE(bytes - 8, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(data.length * 2, 40)
  for (let i = 0; i < data.length; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2)
  }
  writeFileSync(join(OUT, name), b)
  console.log(`${name.padEnd(14)} ${(bytes / 1024).toFixed(0).padStart(5)} KB`)
}

// ----------------------------------------------------------------- textures

function rain() {
  const L = 10
  return normalize(renderLoop(L, 1, (buf) => {
    const rand = rng(11)
    const pink = pinkSource(rand)
    const hp = new Biquad('highpass', 500)
    const lp = new Biquad('lowpass', 5200)
    const swell = loopLfo(L, [1, 2, 5], rand)
    for (let i = 0; i < buf.length; i++) {
      const t = i / SR
      buf[i] = lp.run(hp.run(pink())) * (0.55 + 0.12 * swell(t))
    }
    // Individual drops: short falling sine pings with a tiny noise click.
    const drops = Math.round(buf.length / SR * 70)
    for (let d = 0; d < drops; d++) {
      const start = Math.floor(rand() * buf.length)
      const heavy = rand() < 0.08
      const f0 = heavy ? 900 + rand() * 900 : 2200 + rand() * 3200
      const decay = heavy ? 0.03 : 0.006 + rand() * 0.012
      const amp = (heavy ? 0.5 : 0.25) * Math.pow(rand(), 2.2)
      const len = Math.floor(decay * 6 * SR)
      let phase = 0
      for (let j = 0; j < len && start + j < buf.length; j++) {
        const t = j / SR
        const env = Math.exp(-t / decay)
        phase += (TAU * f0 * (1 - 0.25 * Math.min(1, t / (decay * 3)))) / SR
        const click = j < 24 ? (rand() * 2 - 1) * (1 - j / 24) * 0.6 : 0
        buf[start + j] += amp * env * (Math.sin(phase) + click)
      }
    }
  }))
}

function wind() {
  const L = 12
  return normalize(renderLoop(L, 1.5, (buf) => {
    const rand = rng(23)
    const brown = brownSource(rand)
    const pink = pinkSource(rand)
    const bp1 = new Biquad('bandpass', 400, 2.5)
    const bp2 = new Biquad('bandpass', 900, 4)
    const lp = new Biquad('lowpass', 2500)
    const sweep1 = loopLfo(L, [1, 3], rand)
    const sweep2 = loopLfo(L, [2, 5], rand)
    const gust = loopLfo(L, [1, 2, 3], rand)
    for (let i = 0; i < buf.length; i++) {
      const t = i / SR
      if (i % 32 === 0) {
        bp1.set(380 + 260 * sweep1(t), 2.2)
        bp2.set(950 + 450 * sweep2(t), 5)
      }
      const g = 0.5 + 0.5 * gust(t)
      const body = bp1.run(brown() + pink() * 0.6) * 1.6
      const whistle = bp2.run(pink()) * 0.9 * g * g
      buf[i] = lp.run(body * (0.35 + 0.65 * g) + whistle)
    }
  }))
}

function waves() {
  const L = 14 // two waves per loop
  return normalize(renderLoop(L, 1.5, (buf) => {
    const rand = rng(37)
    const pink = pinkSource(rand)
    const brown = brownSource(rand)
    const lp = new Biquad('lowpass', 600, 0.8)
    const hp = new Biquad('highpass', 1800)
    const foamLp = new Biquad('lowpass', 7000)
    const waveShape = (t) => {
      // Rises slowly, crests, then a long hiss as it draws back.
      const p = (t % (L / 2)) / (L / 2)
      return p < 0.35 ? Math.pow(p / 0.35, 2) : Math.exp(-(p - 0.35) * 4.2)
    }
    for (let i = 0; i < buf.length; i++) {
      const t = i / SR
      const w = waveShape(t)
      if (i % 32 === 0) lp.set(250 + 1500 * w, 0.8)
      const body = lp.run(pink() + brown() * 0.8) * (0.25 + 0.9 * w)
      const foam = foamLp.run(hp.run(pink())) * Math.pow(w, 3) * 0.9
      buf[i] = body + foam
    }
  }))
}

function embers() {
  const L = 10
  return normalize(renderLoop(L, 1, (buf) => {
    const rand = rng(53)
    const brown = brownSource(rand)
    const lp = new Biquad('lowpass', 320)
    const breath = loopLfo(L, [1, 2], rand)
    for (let i = 0; i < buf.length; i++) {
      buf[i] = lp.run(brown()) * (0.5 + 0.15 * breath(i / SR))
    }
    // Crackles: tiny bursts of band-limited noise, now and then a pop.
    const crackleBp = new Biquad('bandpass', 2500, 1.2)
    const crackles = Math.round(buf.length / SR * 26)
    for (let c = 0; c < crackles; c++) {
      const start = Math.floor(rand() * buf.length)
      const pop = rand() < 0.1
      const len = Math.floor((pop ? 0.012 : 0.002 + rand() * 0.004) * SR)
      const amp = (pop ? 1.1 : 0.6) * Math.pow(rand(), 1.6)
      crackleBp.set(pop ? 900 + rand() * 600 : 1500 + rand() * 4000, 1.2)
      for (let j = 0; j < len * 3 && start + j < buf.length; j++) {
        const env = j < len ? 1 : Math.exp(-(j - len) / (len * 0.4))
        buf[start + j] += crackleBp.run((rand() * 2 - 1) * env) * amp * 3
      }
    }
  }))
}

// -------------------------------------------------------------- felt piano

function feltPiano(midi) {
  const rand = rng(midi * 7)
  const f0 = 440 * Math.pow(2, (midi - 69) / 12)
  const seconds = 4.5
  const n = Math.round(seconds * SR)
  const buf = new Float32Array(n)
  const B = 0.00035 // string inharmonicity
  for (let k = 1; k <= 14; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k)
    if (fk > SR * 0.45) break
    // Felt damps the upper partials heavily.
    const amp = Math.pow(k, -1.4) * Math.exp(-(fk / 2600))
    const fast = 0.18 / Math.pow(k, 0.6)
    const slow = (2.6 * Math.pow(261.6 / f0, 0.35)) / Math.pow(k, 0.5)
    for (const detune of [-0.7, 0, 0.6]) {
      const f = fk * Math.pow(2, detune / 1200)
      const p = rand() * TAU
      for (let i = 0; i < n; i++) {
        const t = i / SR
        const env = 0.55 * Math.exp(-t / fast) + 0.45 * Math.exp(-t / slow)
        buf[i] += (amp / 3) * env * Math.sin(TAU * f * t + p)
      }
    }
  }
  // Hammer thump.
  const thump = new Biquad('lowpass', 700 + f0 * 0.6)
  for (let i = 0; i < SR * 0.05; i++) {
    buf[i] += thump.run(rand() * 2 - 1) * Math.exp(-i / (SR * 0.008)) * 0.25
  }
  // Soft attack and a tail that reaches true silence.
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, i / (SR * 0.004))
    const r = Math.min(1, (n - i) / (SR * 0.6))
    buf[i] *= a * r
  }
  return normalize(buf, 0.8)
}

// --------------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true })
writeWav('rain.wav', rain())
writeWav('wind.wav', wind())
writeWav('waves.wav', waves())
writeWav('embers.wav', embers())
writeWav('piano-c3.wav', feltPiano(48))
writeWav('piano-c4.wav', feltPiano(60))
writeWav('piano-c5.wav', feltPiano(72))
