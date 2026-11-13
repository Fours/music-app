// Renders Drift's felt-piano notes, synthesized from sine partials so there
// are no third-party recordings to license. (The texture loops come from field
// recordings instead: see scripts/prepare-textures.mjs.)
//
//   node scripts/render-samples.mjs
//
// Output: public/samples/piano-*.wav (mono, 16-bit). The script is deterministic.

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
writeWav('piano-c3.wav', feltPiano(48))
writeWav('piano-c4.wav', feltPiano(60))
writeWav('piano-c5.wav', feltPiano(72))
