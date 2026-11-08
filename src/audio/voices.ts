import * as Tone from 'tone'
import { midiToFreq, type Harmony } from '../music/theory'
import { baseNote, beadNote } from '../world/pitch'
import type { Chime, Drone, Orbit, Pulse, SoundEvent, Texture, WorldObject } from '../world/types'

export interface Buses {
  dry: Tone.InputNode
  reverb: Tone.InputNode
  delay: Tone.InputNode
  buffers: Record<string, Tone.ToneAudioBuffer>
}

export interface Voice {
  /** Called every simulation tick with the object's current state. */
  update(o: WorldObject, h: Harmony): void
  trigger?(e: SoundEvent, o: WorldObject, h: Harmony): void
  /** Fade out and free nodes. */
  release(): void
}

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
 * Per-object output stage: level → panner → dry bus, plus reverb and delay sends.
 * Starts silent and fades in.
 */
class Channel {
  level = new Tone.Gain(0)
  panner = new Tone.Panner(0)
  sends: Tone.Gain[]
  private nodes: { dispose(): unknown }[] = []

  constructor(buses: Buses, reverb: number, delay: number) {
    this.level.connect(this.panner)
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

  release(fade = 2.5) {
    const t = at()
    this.level.gain.cancelScheduledValues(t)
    this.level.gain.rampTo(0, fade * 0.6, t)
    window.setTimeout(() => {
      for (const n of this.nodes) n.dispose()
      this.level.dispose()
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

  update(o: WorldObject, h: Harmony) {
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
    this.ch.set(d.volume * (0.4 + 0.6 * d.size) * 0.3, d.x, 1.2)
  }

  release() {
    this.ch.release(3)
  }
}

// ----------------------------------------------------- struck instruments

type Struck = Tone.PolySynth | Tone.Sampler

function piano(buses: Buses): Tone.Sampler {
  const b = buses.buffers
  return new Tone.Sampler({
    urls: { C3: b['piano-c3'], C4: b['piano-c4'], C5: b['piano-c5'] },
    release: 1.2,
  })
}

function bell(decay: number, harmonicity: number, index: number): Tone.PolySynth {
  return new Tone.PolySynth(Tone.FMSynth, {
    harmonicity,
    modulationIndex: index,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.002, decay, sustain: 0, release: decay },
    modulationEnvelope: { attack: 0.002, decay: decay * 0.3, sustain: 0, release: decay * 0.3 },
  })
}

function makeStruck(sound: string, buses: Buses, length = 0.5): Struck {
  const decay = 0.25 + length * 2.2
  let inst: Struck
  switch (sound) {
    case 'piano':
      inst = piano(buses)
      break
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
      inst.volume.value = -6
      break
    default: // soft
      inst = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.04, decay: 2.8, sustain: 0, release: 2.4 },
      })
      inst.volume.value = -6
  }
  if (inst instanceof Tone.PolySynth) inst.maxPolyphony = 10
  return inst
}

function strike(inst: Struck, midi: number, time: number, velocity: number, dur = 1.5) {
  try {
    inst.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), dur, time, velocity)
  } catch {
    // Overlapping retriggers can land in the past during a tab stall; drop them.
  }
}

class ChimeVoice implements Voice {
  private ch: Channel
  private inst: Struck
  constructor(o: Chime, buses: Buses) {
    this.ch = new Channel(buses, 0.55, 0.18)
    this.inst = this.ch.own(makeStruck(o.sound, buses))
    this.inst.connect(this.ch.level)
  }
  update(o: WorldObject) {
    this.ch.set(o.volume * (0.5 + 0.5 * o.size) * 0.9, o.x, 0.05)
  }
  trigger(e: SoundEvent, o: WorldObject, h: Harmony) {
    if (e.type !== 'chime') return
    strike(this.inst, baseNote(o, h)!, e.time, 0.35 + 0.6 * e.velocity, 2)
  }
  release() {
    this.ch.release(4)
  }
}

class PulseVoice implements Voice {
  private ch: Channel
  private inst: Struck
  constructor(o: Pulse, buses: Buses) {
    this.ch = new Channel(buses, 0.6, 0.12)
    this.inst = this.ch.own(makeStruck(o.sound, buses))
    this.inst.connect(this.ch.level)
  }
  update(o: WorldObject) {
    this.ch.set(o.volume * (0.5 + 0.5 * o.size) * 0.8, o.x, 0.05)
  }
  trigger(e: SoundEvent, o: WorldObject, h: Harmony) {
    if (e.type !== 'pulse') return
    strike(this.inst, baseNote(o, h)!, e.time, 0.7, 1.8)
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
  private sound: string
  private buses: Buses

  constructor(o: Orbit, buses: Buses) {
    this.buses = buses
    this.sound = o.sound
    this.length = o.length
    this.ch = new Channel(buses, 0.45, 0.32)
    this.filter = this.ch.own(new Tone.Filter({ type: 'lowpass', frequency: 3200, rolloff: -12 }))
    this.filter.connect(this.ch.level)
    this.inst = this.ch.own(makeStruck(o.sound, buses, o.length))
    this.inst.connect(this.filter)
  }

  update(o: WorldObject) {
    const orbit = o as Orbit
    if (Math.abs(orbit.length - this.length) > 0.02) {
      // Note length lives in the envelope, so swap in a freshly built instrument.
      this.length = orbit.length
      const old = this.inst
      this.inst = this.ch.own(makeStruck(this.sound, this.buses, orbit.length))
      this.inst.connect(this.filter)
      window.setTimeout(() => old.dispose(), 4000)
    }
    ramp(this.filter.frequency, 1400 + orbit.x * 4200, 0.3)
    this.ch.set(orbit.volume * (0.55 + 0.45 * orbit.size) * 0.85, orbit.x, 0.05)
  }

  trigger(e: SoundEvent, o: WorldObject, h: Harmony) {
    if (e.type !== 'orbit') return
    const orbit = o as Orbit
    const base = baseNote(orbit, h)!
    const step = orbit.beads[e.bead] ?? 0
    const octave = orbit.sound === 'musicbox' ? 12 : 0
    const dur = 0.15 + orbit.length * 1.2
    strike(this.inst, beadNote(base, step, h) + octave, e.time, 0.55 + Math.random() * 0.25, dur)
  }

  release() {
    this.ch.release(4)
  }
}

// --------------------------------------------------------------- texture

/** Evens out the loudness of the rendered loops (measured, not guessed). */
const TEXTURE_TRIM = { rain: 1.4, wind: 1, waves: 1, embers: 1.9 }

class TextureVoice implements Voice {
  private ch: Channel
  private player: Tone.Player
  private filter: Tone.Filter

  constructor(o: Texture, buses: Buses) {
    this.ch = new Channel(buses, 0.25, 0)
    const sway = this.ch.own(new Tone.Gain(1))
    sway.connect(this.ch.level)
    const lfo = this.ch.own(
      new Tone.LFO({ frequency: 0.02 + Math.random() * 0.03, min: 0.6, max: 1 }).start(at()),
    )
    lfo.connect(sway.gain)
    this.filter = this.ch.own(new Tone.Filter({ type: 'lowpass', frequency: 6000, rolloff: -12 }))
    this.filter.connect(sway)
    this.player = this.ch.own(new Tone.Player(buses.buffers[o.sound]))
    this.player.loop = true
    this.player.connect(this.filter)
    const buf = buses.buffers[o.sound]
    this.player.start(at() + 0.05, Math.random() * buf.duration)
  }

  update(o: WorldObject) {
    ramp(this.filter.frequency, 700 + Math.pow(1 - o.y, 1.6) * 11000, 0.5)
    const trim = TEXTURE_TRIM[(o as Texture).sound]
    this.ch.set(o.volume * (0.3 + 0.7 * o.size) * 0.75 * trim, o.x, 1.5)
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
