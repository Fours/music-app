import * as Tone from 'tone'
import type { Harmony } from '../music/theory'
import type { Settings, SoundEvent, WorldObject } from '../world/types'
import { createVoice, voiceSignature, withClock, type Buses, type Voice } from './voices'

/** Master gain at full volume; the compressor and limiter keep peaks in check. */
const MAKEUP = 2.4

const SAMPLES = ['rain', 'wind', 'waves', 'embers', 'piano-c3', 'piano-c4', 'piano-c5']

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

    const dry = new Tone.Gain(1).connect(this.master)
    const reverb = new Tone.Reverb({ decay: 9, preDelay: 0.04, wet: 1 })
    this.reverbReturn = new Tone.Gain(0.8).connect(this.master)
    reverb.connect(this.reverbReturn)
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.75, feedback: 0.42, wet: 1 })
    const delayTone = new Tone.Filter({ type: 'lowpass', frequency: 2600 })
    this.delay.chain(delayTone, reverb)
    delayTone.connect(this.master)

    let done = 0
    const buffers: Record<string, Tone.ToneAudioBuffer> = {}
    await Promise.all([
      reverb.ready,
      ...SAMPLES.map(async (name) => {
        buffers[name] = await new Tone.ToneAudioBuffer().load(
          `${import.meta.env.BASE_URL}samples/${name}.wav`,
        )
        onProgress?.(++done / SAMPLES.length)
      }),
    ])

    this.buses = { dry, reverb, delay: this.delay, buffers }
    this.ready = true
  }

  applySettings(s: Settings) {
    if (!this.ready) return
    this.master.gain.rampTo(s.volume * MAKEUP, 0.3)
    this.reverbReturn.gain.rampTo(0.15 + s.space * 1.1, 0.5)
    this.delay.feedback.rampTo(0.2 + s.space * 0.4, 0.5)
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
    this.master.gain.rampTo(paused ? 0 : volume * MAKEUP, paused ? 0.6 : 1.2)
  }

  level(): number {
    if (!this.ready) return 0
    const v = this.meter.getValue()
    return typeof v === 'number' ? v : Math.max(...v)
  }
}

export const engine = new AudioEngine()
