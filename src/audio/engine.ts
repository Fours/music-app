import * as Tone from 'tone'
import type { Harmony } from '../music/theory'
import type { Settings, SoundEvent, WorldObject } from '../world/types'
import { Tape } from './tape'
import { TEXTURE_LOOPS } from './texture-loops'
import { createVoice, taper, voiceSignature, withClock, type Buses, type Voice } from './voices'

/** Master gain at full volume; the compressor and limiter keep peaks in check. */
const MAKEUP = 2.4

/** Files in public/samples, which are also the keys of `Buses.buffers`. */
const SAMPLES = [
  'piano-c3.wav',
  'piano-c4.wav',
  'piano-c5.wav',
  ...Object.values(TEXTURE_LOOPS).flatMap((layers) => layers.map((l) => l.file)),
]

interface Slot {
  voice: Voice
  signature: string
}

/**
 * Owns the Tone.js graph: a shared reverb and delay, a master bus with gentle
 * compression and limiting, and one voice per object on the canvas.
 */
export class AudioEngine {
  ready = false
  private buses!: Buses
  private master!: Tone.Gain
  private reverbReturn!: Tone.Gain
  private delay!: Tone.FeedbackDelay
  private tape!: Tape
  private slots = new Map<string, Slot>()
  // Created in init(), after the playback context is installed.
  recorder!: Tone.Recorder
  private meter!: Tone.Meter

  async init(onProgress?: (p: number) => void) {
    // Prefer stable playback over low latency; nothing here is played live.
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback' // iOS: ignore the mute switch
    Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.12 }))
    await Tone.start()

    this.recorder = new Tone.Recorder()
    this.meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 })
    const limiter = new Tone.Limiter(-1)
    const comp = new Tone.Compressor({ threshold: -20, ratio: 2.5, attack: 0.08, release: 0.4 })
    this.master = new Tone.Gain(0)
    this.master.chain(comp, limiter)
    limiter.toDestination()
    limiter.connect(this.recorder)
    limiter.connect(this.meter)

    // Everything passes through the tape stage before the master volume, so
    // Volume doesn't change how hard the tape saturates.
    this.tape = new Tape()
    this.tape.output.connect(this.master)
    const mix = this.tape.input
    const dry = new Tone.Gain(1).connect(mix)
    const reverb = new Tone.Reverb({ decay: 9, preDelay: 0.04, wet: 1 })
    this.reverbReturn = new Tone.Gain(0.8).connect(mix)
    reverb.connect(this.reverbReturn)
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.75, feedback: 0.42, wet: 1 })
    const delayTone = new Tone.Filter({ type: 'lowpass', frequency: 2600 })
    this.delay.chain(delayTone, reverb)
    delayTone.connect(mix)

    let done = 0
    const buffers: Record<string, Tone.ToneAudioBuffer> = {}
    await Promise.all([
      reverb.ready,
      ...SAMPLES.map(async (file) => {
        buffers[file] = await new Tone.ToneAudioBuffer().load(`${import.meta.env.BASE_URL}samples/${file}`)
        onProgress?.(++done / SAMPLES.length)
      }),
    ])

    this.buses = { dry, reverb, delay: this.delay, buffers }
    this.ready = true
  }

  applySettings(s: Settings) {
    if (!this.ready) return
    this.master.gain.rampTo(taper(s.volume, 0.8) * MAKEUP, 0.3)
    this.reverbReturn.gain.rampTo(0.15 + s.space * 1.1, 0.5)
    this.delay.feedback.rampTo(0.2 + s.space * 0.4, 0.5)
    this.tape.set(s)
    // A dotted-eighth echo at the current tempo.
    this.delay.delayTime.rampTo((60 / s.tempo) * 0.75, 1)
  }

  /** Bring voices in line with the objects on the canvas. */
  sync(objects: WorldObject[], h: Harmony, time = Tone.now()) {
    if (!this.ready) return
    withClock(time, () => this.syncAt(objects, h))
  }

  private syncAt(objects: WorldObject[], h: Harmony) {
    const seen = new Set<string>()
    for (const o of objects) {
      seen.add(o.id)
      const signature = voiceSignature(o)
      let slot = this.slots.get(o.id)
      if (slot && slot.signature !== signature) {
        slot.voice.release()
        slot = undefined
      }
      if (!slot) {
        slot = { voice: createVoice(o, this.buses), signature }
        this.slots.set(o.id, slot)
      }
      slot.voice.update(o, h)
    }
    for (const [id, slot] of this.slots) {
      if (!seen.has(id)) {
        slot.voice.release()
        this.slots.delete(id)
      }
    }
  }

  play(e: SoundEvent, o: WorldObject, h: Harmony) {
    this.slots.get(e.id)?.voice.trigger?.(e, o, h)
  }

  /** Soft-mute for pausing; voices keep their state. */
  setPaused(paused: boolean, volume: number) {
    if (!this.ready) return
    this.master.gain.rampTo(paused ? 0 : taper(volume, 0.8) * MAKEUP, paused ? 0.6 : 1.2)
  }

  level(): number {
    if (!this.ready) return 0
    const v = this.meter.getValue()
    return typeof v === 'number' ? v : Math.max(...v)
  }
}

export const engine = new AudioEngine()
