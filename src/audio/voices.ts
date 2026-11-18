import * as Tone from 'tone'
import { midiToFreq, type Harmony } from '../music/theory'
import { OPEN_FILTER, cutoffHz, resonanceDb } from '../world/filter'
import { baseNote, beadNote } from '../world/pitch'
import { PLAYBACK_GAIN_DB, type Instrument, type LayerName } from './instruments'
import type { InstrumentLoader } from './instrument-loader'
import { sampledInstrument } from './sounds'
import { TEXTURE_LOOPS } from './texture-loops'
import type { Chime, Drone, FilterSettings, Orbit, Pulse, SoundEvent, Texture, WorldObject } from '../world/types'

export interface Buses {
  dry: Tone.InputNode
  reverb: Tone.InputNode
  delay: Tone.InputNode
  buffers: Record<string, Tone.ToneAudioBuffer>
  /** Sampled instruments' notes, which can still be arriving when a voice is built. */
  instruments: InstrumentLoader
}

/** Slider values as they stand this tick, after any oscillation. */
export interface Live {
  volume: number
  /** 0–1 position on the Cutoff slider. */
  cutoff: number
}

export interface Voice {
  /** Called every simulation tick with the object's current state; `live` has any oscillation applied. */
  update(o: WorldObject, h: Harmony, live: Live): void
  trigger?(e: SoundEvent, o: WorldObject, h: Harmony): void
  /** Fade out and free nodes. */
  release(): void
}

/** dB covered by the whole slider: about 9 dB per quarter, so each quarter sounds about half as loud. */
const SLIDER_DB = 36

/**
 * Turns a 0–1 volume slider into gain. The response is even in decibels, which is
 * how loudness is heard, rather than linear. It matches the old linear gain at
 * `ref`, so default levels are unchanged, and fades to true silence near 0.
 */
export function taper(v: number, ref = 0.75): number {
  if (v <= 0) return 0
  return ref * 10 ** (((v - ref) * SLIDER_DB) / 20) * Math.min(1, v / 0.08)
}

/** Level changes normally glide slowly; an oscillating volume has to follow each tick closely instead. */
const glide = (o: WorldObject, time: number) => (o.oscillate?.on ? Math.min(time, 0.1) : time)

const pan = (x: number) => Math.max(-0.8, Math.min(0.8, (x - 0.5) * 1.5))

/**
 * Audio time that parameter changes are scheduled at. Inside a transport
 * callback this is the callback's time, which keeps Tone's timing exact.
 */
let clock: number | null = null
export function withClock<T>(time: number, fn: () => T): T {
  clock = time
  try {
    return fn()
  } finally {
    clock = null
  }
}
const at = () => clock ?? Tone.now()

const lastSet = new WeakMap<object, number>()

/** Ramp a parameter only when its target has actually moved; updates arrive every tick. */
function ramp(param: { rampTo(v: number, t: number, start?: number): unknown }, value: number, time: number) {
  const prev = lastSet.get(param)
  if (prev !== undefined && Math.abs(prev - value) <= Math.abs(value) * 0.004 + 1e-4) return
  lastSet.set(param, value)
  param.rampTo(value, time, at())
}

/**
 * Per-object output stage: level → the object's own low-pass → panner → dry
 * bus, plus reverb and delay sends. Starts silent and fades in.
 */
class Channel {
  level = new Tone.Gain(0)
  filter = new Tone.Filter({ type: 'lowpass', frequency: cutoffHz(1), Q: 0, rolloff: -12 })
  panner: Tone.Panner
  sends: Tone.Gain[]
  private nodes: { dispose(): unknown }[] = []

  /** `channels`: 2 keeps a stereo source's width through the panner, which otherwise sums it to mono. */
  constructor(buses: Buses, reverb: number, delay: number, channels: 1 | 2 = 1) {
    this.panner = new Tone.Panner({ pan: 0, channelCount: channels })
    this.level.connect(this.filter)
    this.filter.connect(this.panner)
    this.panner.connect(buses.dry)
    const r = new Tone.Gain(reverb)
    const d = new Tone.Gain(delay)
    this.panner.connect(r)
    this.panner.connect(d)
    r.connect(buses.reverb)
    d.connect(buses.delay)
    this.sends = [r, d]
  }

  own<T extends { dispose(): unknown }>(node: T): T {
    this.nodes.push(node)
    return node
  }

  set(level: number, x: number, time = 0.25) {
    ramp(this.level.gain, level, time)
    ramp(this.panner.pan, pan(x), time)
  }

  /** The object's Cutoff and Resonance sliders; a short glide so dragging them doesn't zipper. */
  shape(f: FilterSettings = OPEN_FILTER, cutoff = f.cutoff) {
    ramp(this.filter.frequency, cutoffHz(cutoff), 0.08)
    ramp(this.filter.Q, resonanceDb(f.resonance), 0.08)
  }

  release(fade = 2.5) {
    const t = at()
    this.level.gain.cancelScheduledValues(t)
    this.level.gain.rampTo(0, fade * 0.6, t)
    window.setTimeout(() => {
      for (const n of this.nodes) n.dispose()
      this.level.dispose()
      this.filter.dispose()
      this.panner.dispose()
      for (const s of this.sends) s.dispose()
    }, fade * 1000 + 500)
  }
}

// ----------------------------------------------------------------- drone

const DRONE_TIMBRES = {
  warm: { type: 'triangle', count: 3, spread: 18, cutoff: 900, q: 0.7, octave: 0 },
  glass: { type: 'sine', count: 2, spread: 8, cutoff: 5000, q: 0.5, octave: 0.22 },
  reed: { type: 'sawtooth', count: 3, spread: 12, cutoff: 520, q: 2.2, octave: 0 },
  choir: { type: 'sawtooth', count: 5, spread: 34, cutoff: 1100, q: 1.2, octave: 0.08 },
} as const

class DroneVoice implements Voice {
  private ch: Channel
  private osc: Tone.FatOscillator
  private shimmer: Tone.Oscillator
  private filter: Tone.Filter
  private note = -1
  private spec

  constructor(o: Drone, buses: Buses) {
    this.spec = DRONE_TIMBRES[o.timbre]
    this.ch = new Channel(buses, 0.7, 0.05)
    const breath = this.ch.own(new Tone.Gain(1))
    breath.connect(this.ch.level)
    // Slow swell so the drone breathes rather than sits still.
    const lfo = this.ch.own(
      new Tone.LFO({ frequency: 0.04 + Math.random() * 0.06, min: 0.55, max: 1 }).start(at()),
    )
    lfo.connect(breath.gain)
    this.filter = this.ch.own(
      new Tone.Filter({ type: 'lowpass', frequency: this.spec.cutoff, Q: this.spec.q, rolloff: -24 }),
    )
    this.filter.connect(breath)
    this.osc = this.ch.own(
      new Tone.FatOscillator({ type: this.spec.type, count: this.spec.count, spread: this.spec.spread }),
    )
    this.osc.volume.value = -6
    this.osc.connect(this.filter).start(at())
    this.shimmer = this.ch.own(new Tone.Oscillator({ type: 'sine' }))
    this.shimmer.volume.value = Tone.gainToDb(Math.max(0.0001, this.spec.octave))
    this.shimmer.connect(this.filter).start(at())
  }

  update(o: WorldObject, h: Harmony, live: Live) {
    const d = o as Drone
    const n = baseNote(d, h)!
    if (n !== this.note) {
      const f = midiToFreq(n)
      const glide = this.note < 0 ? 0.01 : 1.6
      this.osc.frequency.rampTo(f, glide, at())
      this.shimmer.frequency.rampTo(f * 2, glide, at())
      this.note = n
    }
    ramp(this.filter.frequency, this.spec.cutoff * (0.45 + d.x * 1.3), 0.4)
    this.ch.set(taper(live.volume) * (0.4 + 0.6 * d.size) * 0.3, d.x, glide(o, 1.2))
    this.ch.shape(o.filter, live.cutoff)
  }

  release() {
    this.ch.release(3)
  }
}

// ----------------------------------------------------- struck instruments

/**
 * Which layer of a sampled instrument a strike plays, from how hard it is
 * (0–1). The only place that decides, so a later Soft, Hard or Auto setting
 * changes just this. Chimes strike at 0.35 to 0.95 with what hits them, orbits
 * at 0.55 to 0.8 at random, and pulses always at 0.7, so between the two
 * thresholds it's a random choice weighted by strength: orbits and pulses get
 * a mix, and chimes follow how hard they're hit.
 */
export function pickLayer(layers: LayerName[], velocity: number): LayerName {
  if (layers.length === 1) return layers[0]
  const SOFT_BELOW = 0.45
  const HARD_ABOVE = 0.8
  const hard = velocity <= SOFT_BELOW ? 0 : velocity >= HARD_ABOVE ? 1 : (velocity - SOFT_BELOW) / (HARD_ABOVE - SOFT_BELOW)
  return Math.random() < hard ? 'hard' : 'soft'
}

/**
 * A sampled instrument from the manifest (src/audio/instruments.ts): one
 * Tone.Sampler per layer, each repitching its nearest recorded note. Each
 * strike plays one layer, and its strength still scales the level within it.
 *
 * It can be built before all its notes have loaded: it starts with the ones
 * that have and adds the rest as they arrive, repitching further until then.
 */
class Sampled {
  private output = new Tone.Gain(1)
  private layers: { name: LayerName; sampler: Tone.Sampler; notes: number }[]
  private fullRelease: number
  private unsubscribe: () => void

  constructor(inst: Instrument, buses: Buses, length?: number) {
    this.fullRelease = inst.release
    /** Note files not loaded yet → the layer and note each one fills in. */
    const missing = new Map<string, { layer: number; note: string }>()
    this.layers = inst.layers.map((layer, i) => {
      const urls: Record<string, Tone.ToneAudioBuffer> = {}
      for (const [note, file] of Object.entries(layer.notes)) {
        if (buses.buffers[file]) urls[note] = buses.buffers[file]
        else missing.set(file, { layer: i, note })
      }
      const sampler = new Tone.Sampler({ urls, release: inst.release, volume: PLAYBACK_GAIN_DB })
      sampler.connect(this.output)
      return { name: layer.name, sampler, notes: Object.keys(urls).length }
    })
    this.unsubscribe = buses.instruments.onNote((file) => {
      const m = missing.get(file)
      if (!m) return
      missing.delete(file)
      const layer = this.layers[m.layer]
      layer.sampler.add(m.note as Tone.Unit.Note, buses.buffers[file])
      layer.notes++
    })
    this.setLength(length)
  }

  set attack(seconds: number) {
    for (const l of this.layers) l.sampler.attack = seconds
  }

  /** An orbit's Length: from a quarter of the instrument's release at Short to all of it at Ringing. */
  setLength(length: number | undefined) {
    const release = length === undefined ? this.fullRelease : this.fullRelease * (0.25 + 0.75 * length)
    for (const l of this.layers) l.sampler.release = release
  }

  triggerAttackRelease(freq: number, duration: number, time: number, velocity: number) {
    // Only layers with a note yet, while the instrument is still loading.
    const ready = this.layers.filter((l) => l.notes > 0)
    if (!ready.length) return
    const name = pickLayer(
      ready.map((l) => l.name),
      velocity,
    )
    ready.find((l) => l.name === name)!.sampler.triggerAttackRelease(freq, duration, time, velocity)
  }

  connect(destination: Tone.InputNode) {
    this.output.connect(destination)
    return this
  }

  dispose() {
    this.unsubscribe()
    for (const l of this.layers) l.sampler.dispose()
    this.output.dispose()
  }
}

type Struck = Tone.PolySynth | Sampled

/** Attack slider (0–1) → seconds. Squared so the low end keeps fine control. */
export const attackTime = (a = 0) => a * a * 2

/** Each instrument's own attack, which the slider only ever lengthens, and whether it's an FM bell. */
const STRUCK_ATTACK = new WeakMap<Struck, { base: number; fm: boolean }>()

function setAttack(inst: Struck, a: number) {
  const { base, fm } = STRUCK_ATTACK.get(inst) ?? { base: 0, fm: false }
  const attack = Math.max(base, attackTime(a))
  if (inst instanceof Sampled) inst.attack = attack
  // An FM bell's brightness has its own envelope; swell it too, or the strike still clicks.
  else if (fm) (inst as unknown as Tone.PolySynth<Tone.FMSynth>).set({ envelope: { attack }, modulationEnvelope: { attack } })
  else inst.set({ envelope: { attack } })
}

function bell(decay: number, harmonicity: number, index: number): Tone.PolySynth {
  const inst = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity,
    modulationIndex: index,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.002, decay, sustain: 0, release: decay },
    modulationEnvelope: { attack: 0.002, decay: decay * 0.3, sustain: 0, release: decay * 0.3 },
  })
  STRUCK_ATTACK.set(inst, { base: 0.002, fm: true })
  return inst
}

/** `length` is an orbit's Length (0–1); chimes and pulses leave it out. */
function makeStruck(sound: string, buses: Buses, attack: number, length?: number): Struck {
  const decay = 0.25 + (length ?? 0.5) * 2.2
  const sampled = sampledInstrument(sound)
  let inst: Struck
  if (sampled) {
    inst = new Sampled(sampled, buses, length)
    setAttack(inst, attack)
    return inst
  }
  switch (sound) {
    case 'bell':
      inst = bell(2.6, 3.01, 11)
      inst.volume.value = 5
      break
    case 'glass':
      inst = bell(3.6, 5.07, 2.4)
      inst.volume.value = 2
      break
    case 'mallet':
      inst = bell(1.4, 4, 2.2)
      inst.volume.value = 3
      break
    case 'marimba':
      inst = bell(decay, 3.98, 1.4)
      inst.volume.value = -1
      break
    case 'musicbox':
      inst = bell(decay * 1.2, 6.98, 1.6)
      inst.volume.value = 0
      break
    case 'pluck':
      inst = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.004, decay, sustain: 0, release: decay },
      })
      STRUCK_ATTACK.set(inst, { base: 0.004, fm: false })
      inst.volume.value = -6
      break
    default: // soft
      inst = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.04, decay: 2.8, sustain: 0, release: 2.4 },
      })
      STRUCK_ATTACK.set(inst, { base: 0.04, fm: false })
      inst.volume.value = -6
  }
  if (inst instanceof Tone.PolySynth) inst.maxPolyphony = 10
  setAttack(inst, attack)
  return inst
}

function strike(inst: Struck, midi: number, time: number, velocity: number, dur: number, attack: number) {
  // Hold the note at least until its swell peaks, or the release cuts it off part-way up.
  dur = Math.max(dur, attackTime(attack) + 0.1)
  try {
    inst.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), dur, time, velocity)
  } catch {
    // Overlapping retriggers can land in the past during a tab stall; drop them.
  }
}

/** Applies a changed Attack slider to a live instrument; returns the value now in effect. */
function syncAttack(inst: Struck, next: number | undefined, current: number): number {
  const a = next ?? 0
  if (a !== current) setAttack(inst, a)
  return a
}

class ChimeVoice implements Voice {
  private ch: Channel
  private inst: Struck
  private attack: number
  constructor(o: Chime, buses: Buses) {
    this.ch = new Channel(buses, 0.55, 0.18)
    this.attack = o.attack ?? 0
    this.inst = this.ch.own(makeStruck(o.sound, buses, this.attack))
    this.inst.connect(this.ch.level)
  }
  update(o: WorldObject, _h: Harmony, live: Live) {
    this.attack = syncAttack(this.inst, (o as Chime).attack, this.attack)
    this.ch.set(taper(live.volume) * (0.5 + 0.5 * o.size) * 0.9, o.x, 0.05)
    this.ch.shape(o.filter, live.cutoff)
  }
  trigger(e: SoundEvent, o: WorldObject, h: Harmony) {
    if (e.type !== 'chime') return
    strike(this.inst, baseNote(o, h)!, e.time, 0.35 + 0.6 * e.velocity, 2, this.attack)
  }
  release() {
    this.ch.release(4)
  }
}

class PulseVoice implements Voice {
  private ch: Channel
  private inst: Struck
  private attack: number
  constructor(o: Pulse, buses: Buses) {
    this.ch = new Channel(buses, 0.6, 0.12)
    this.attack = o.attack ?? 0
    this.inst = this.ch.own(makeStruck(o.sound, buses, this.attack))
    this.inst.connect(this.ch.level)
  }
  update(o: WorldObject, _h: Harmony, live: Live) {
    this.attack = syncAttack(this.inst, (o as Pulse).attack, this.attack)
    this.ch.set(taper(live.volume) * (0.5 + 0.5 * o.size) * 0.8, o.x, 0.05)
    this.ch.shape(o.filter, live.cutoff)
  }
  trigger(e: SoundEvent, o: WorldObject, h: Harmony) {
    if (e.type !== 'pulse') return
    strike(this.inst, baseNote(o, h)!, e.time, 0.7, 1.8, this.attack)
  }
  release() {
    this.ch.release(4)
  }
}

class OrbitVoice implements Voice {
  private ch: Channel
  private inst: Struck
  private filter: Tone.Filter
  private length: number
  private attack: number
  private sound: string
  private buses: Buses

  constructor(o: Orbit, buses: Buses) {
    this.buses = buses
    this.sound = o.sound
    this.length = o.length
    this.attack = o.attack ?? 0
    this.ch = new Channel(buses, 0.45, 0.32)
    this.filter = this.ch.own(new Tone.Filter({ type: 'lowpass', frequency: 3200, rolloff: -12 }))
    this.filter.connect(this.ch.level)
    this.inst = this.ch.own(makeStruck(o.sound, buses, this.attack, o.length))
    this.inst.connect(this.filter)
  }

  update(o: WorldObject, _h: Harmony, live: Live) {
    const orbit = o as Orbit
    if (Math.abs(orbit.length - this.length) > 0.02) {
      this.length = orbit.length
      if (this.inst instanceof Sampled) this.inst.setLength(orbit.length)
      else {
        // A synthesized note's length lives in its envelope, so swap in a freshly built instrument.
        const old = this.inst
        this.inst = this.ch.own(makeStruck(this.sound, this.buses, this.attack, orbit.length))
        this.inst.connect(this.filter)
        window.setTimeout(() => old.dispose(), 4000)
      }
    }
    this.attack = syncAttack(this.inst, orbit.attack, this.attack)
    ramp(this.filter.frequency, 1400 + orbit.x * 4200, 0.3)
    this.ch.set(taper(live.volume) * (0.55 + 0.45 * orbit.size) * 0.85, orbit.x, 0.05)
    this.ch.shape(o.filter, live.cutoff)
  }

  trigger(e: SoundEvent, o: WorldObject, h: Harmony) {
    if (e.type !== 'orbit') return
    const orbit = o as Orbit
    const base = baseNote(orbit, h)!
    const step = orbit.beads[e.bead] ?? 0
    const octave = orbit.sound === 'musicbox' ? 12 : 0
    const dur = 0.15 + orbit.length * 1.2
    strike(this.inst, beadNote(base, step, h) + octave, e.time, 0.55 + Math.random() * 0.25, dur, this.attack)
  }

  release() {
    this.ch.release(4)
  }
}

// --------------------------------------------------------------- texture

/**
 * A field recording looped, through a lowpass that opens up higher on the
 * canvas. Some textures have several layers on different loop lengths (fire's
 * roar and crackle), so their repeats rarely line up. The loops are already
 * matched in loudness by scripts/prepare-textures.mjs.
 */
class TextureVoice implements Voice {
  private ch: Channel
  private filter: Tone.Filter

  constructor(o: Texture, buses: Buses) {
    this.ch = new Channel(buses, 0.25, 0, 2)
    const sway = this.ch.own(new Tone.Gain(1))
    sway.connect(this.ch.level)
    const lfo = this.ch.own(
      new Tone.LFO({ frequency: 0.02 + Math.random() * 0.03, min: 0.6, max: 1 }).start(at()),
    )
    lfo.connect(sway.gain)
    this.filter = this.ch.own(new Tone.Filter({ type: 'lowpass', frequency: 6000, rolloff: -12 }))
    this.filter.connect(sway)
    for (const layer of TEXTURE_LOOPS[o.sound]) {
      const player = this.ch.own(new Tone.Player(buses.buffers[layer.file]))
      // Loop the window inside the file's padding, which hides the encoder's edges.
      player.loop = true
      player.loopStart = layer.start
      player.loopEnd = layer.start + layer.length
      player.connect(this.filter)
      player.start(at() + 0.05, layer.start + Math.random() * layer.length)
    }
  }

  update(o: WorldObject, _h: Harmony, live: Live) {
    ramp(this.filter.frequency, 700 + Math.pow(1 - o.y, 1.6) * 11000, 0.5)
    this.ch.set(taper(live.volume) * (0.3 + 0.7 * o.size) * 0.75, o.x, glide(o, 1.5))
    this.ch.shape(o.filter, live.cutoff)
  }

  release() {
    this.ch.release(3)
  }
}

/** Voices are rebuilt when anything that changes their instrument changes. */
export function voiceSignature(o: WorldObject): string {
  switch (o.kind) {
    case 'drone':
      return `drone:${o.timbre}`
    case 'texture':
    case 'chime':
    case 'pulse':
    case 'orbit':
      return `${o.kind}:${o.sound}`
  }
}

export function createVoice(o: WorldObject, buses: Buses): Voice {
  switch (o.kind) {
    case 'drone':
      return new DroneVoice(o, buses)
    case 'chime':
      return new ChimeVoice(o, buses)
    case 'pulse':
      return new PulseVoice(o, buses)
    case 'orbit':
      return new OrbitVoice(o, buses)
    case 'texture':
      return new TextureVoice(o, buses)
  }
}
