import * as Tone from 'tone'
import { hasNativeAudio, nativeSessionLabel } from '../app/native-audio'
import type { Harmony } from '../music/theory'
import { baseNote } from '../world/pitch'
import type { Settings, SoundEvent, SoundId, WorldObject } from '../world/types'
import { InstrumentLoader } from './instrument-loader'
import { sampledInstrument } from './sounds'
import { Tape } from './tape'
import { TEXTURE_LOOPS } from './texture-loops'
import { createVoice, taper, voiceSignature, withClock, type Buses, type Live, type Voice } from './voices'

/** Master gain at full volume; the compressor and limiter keep peaks in check. */
const MAKEUP = 2.4

/**
 * Texture loops, loaded at Begin listening. Sampled instruments' notes load
 * when a scene needs them (InstrumentLoader). Both are files in
 * public/samples, and keys of `Buses.buffers`.
 */
const TEXTURE_FILES = Object.values(TEXTURE_LOOPS).flatMap((layers) => layers.map((l) => l.file))

/** The sampled instrument an object plays, if it plays one. */
function sampledSound(o: WorldObject): SoundId | undefined {
  return (o.kind === 'chime' || o.kind === 'pulse' || o.kind === 'orbit') && sampledInstrument(o.sound) ? o.sound : undefined
}

/** The sampled instruments `objects` play, each with a pitch it's played at, for loading. */
export function instrumentsIn(objects: WorldObject[], h: Harmony): { id: SoundId; nearMidi: number }[] {
  const found = new Map<SoundId, number>()
  for (const o of objects) {
    const id = sampledSound(o)
    if (id && !found.has(id)) found.set(id, baseNote(o, h) ?? 60)
  }
  return [...found].map(([id, nearMidi]) => ({ id, nearMidi }))
}

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
  /** The master output as a MediaStream, for video clips. */
  stream!: MediaStreamAudioDestinationNode
  private meter!: Tone.Meter
  /** Decoded samples, kept so a rebuilt engine doesn't fetch and decode them again. */
  private samples: Record<string, Tone.ToneAudioBuffer> = {}
  /** Sampled instruments' notes, loaded as scenes need them. */
  readonly instruments = new InstrumentLoader(this.samples, (file) => loadSample(`${import.meta.env.BASE_URL}samples/${file}`))

  /**
   * Builds the audio graph and loads the texture loops plus every note of
   * `instruments`, the ones the scene starts with. An instrument that can't
   * load doesn't stop it: InstrumentLoader.onFailed hears about it.
   */
  async init(onProgress?: (p: number) => void, instruments: { id: SoundId; nearMidi: number }[] = []) {
    // Prefer stable playback over low latency; nothing here is played live.
    // iOS: ignore the mute switch, and take over from other apps' audio (decision 0002).
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
    Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: 0.12 }))
    // Outside a tap (a rebuild), iOS may leave this pending; the next tap starts it instead.
    await settle(Tone.start(), 2000)

    this.recorder = new Tone.Recorder()
    this.meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 })
    const limiter = new Tone.Limiter(-1)
    const comp = new Tone.Compressor({ threshold: -20, ratio: 2.5, attack: 0.08, release: 0.4 })
    this.master = new Tone.Gain(0)
    this.master.chain(comp, limiter)
    limiter.toDestination()
    limiter.connect(this.recorder)
    limiter.connect(this.meter)
    this.stream = Tone.getContext().createMediaStreamDestination()
    limiter.connect(this.stream)

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
    const total = TEXTURE_FILES.length + instruments.reduce((n, i) => n + this.instruments.fileCount(i.id), 0)
    const step = () => onProgress?.(++done / total)
    const buffers = this.samples
    this.instruments.atBegin = true
    const loading = Promise.all([
      reverb.ready,
      ...TEXTURE_FILES.map(async (file) => {
        buffers[file] ??= await loadSample(`${import.meta.env.BASE_URL}samples/${file}`)
        step()
      }),
      ...instruments.map((i) => this.instruments.load(i.id, i.nearMidi, step)),
    ])
    this.instruments.atBegin = false
    await loading

    this.buses = { dry, reverb, delay: this.delay, buffers, instruments: this.instruments }
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
  /** `live` gives each object's slider values with any oscillation applied. */
  sync(objects: WorldObject[], h: Harmony, time: number, live: (o: WorldObject) => Live) {
    if (!this.ready) return
    withClock(time, () => this.syncAt(objects, h, live))
  }

  private syncAt(objects: WorldObject[], h: Harmony, live: (o: WorldObject) => Live) {
    const seen = new Set<string>()
    for (const o of objects) {
      seen.add(o.id)
      const signature = voiceSignature(o)
      let slot = this.slots.get(o.id)
      if (slot && slot.signature !== signature) {
        slot.voice.release()
        this.slots.delete(o.id)
        slot = undefined
      }
      // A sampled instrument with no notes yet: start loading it, and stay quiet until its first note arrives.
      const sampled = sampledSound(o)
      if (!slot && sampled && !this.instruments.playable(sampled)) {
        void this.instruments.load(sampled, baseNote(o, h) ?? 60)
        continue
      }
      if (!slot) {
        slot = { voice: createVoice(o, this.buses), signature }
        this.slots.set(o.id, slot)
      }
      slot.voice.update(o, h, live(o))
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

  private suspendTimer = 0

  /**
   * Fades out for pausing, then suspends the context; voices keep their state.
   *
   * A context left running with nothing but silence isn't playing as far as
   * WebKit is concerned, so iOS suspends the web view once the app is in the
   * background. On return the context still said 'running' with its clock
   * stopped, and Play had nothing to restart. Suspended, it's resumed by the
   * Play tap like any other start. It also stops the phone working while paused.
   * `suspend` is false while a recording or clip runs, so it keeps capturing.
   */
  setPaused(paused: boolean, volume: number, suspend = paused) {
    if (!this.ready) return
    window.clearTimeout(this.suspendTimer)
    this.master.gain.rampTo(paused ? 0 : taper(volume, 0.8) * MAKEUP, paused ? 0.6 : 1.2)
    if (!paused || !suspend) return
    const ctx = Tone.getContext().rawContext as AudioContext
    this.suspendTimer = window.setTimeout(() => {
      if (ctx.state === 'running') void settle(ctx.suspend(), 1000)
    }, 800)
  }

  /**
   * Restarts the audio context if the system stopped it. On iPhone and iPad,
   * leaving the app suspends or interrupts the context, and coming back doesn't
   * always restart it. Returns whether audio is running.
   */
  async wake(): Promise<boolean> {
    if (!this.ready) return true
    // A pause's pending suspend would undo this.
    window.clearTimeout(this.suspendTimer)
    const ctx = Tone.getContext().rawContext as AudioContext
    // WebKit also has a non-standard 'interrupted' state, which resume() clears too.
    if (ctx.state === 'running') return true
    try {
      // resume() can stay pending while iOS holds the audio, so don't wait on it forever.
      await Promise.race([ctx.resume(), sleep(1500)])
    } catch (err) {
      console.warn(`Audio could not resume from '${ctx.state}': ${String(err)}`)
    }
    return (ctx.state as string) === 'running'
  }

  /**
   * For a context that says it's running but whose clock has stopped, which
   * happens on iOS after some interruptions. Suspends and resumes it, and
   * returns whether the clock moves again.
   */
  async kick(): Promise<boolean> {
    const ctx = Tone.getContext().rawContext as AudioContext
    const before = ctx.currentTime
    await settle(ctx.suspend(), 1000)
    await settle(ctx.resume(), 1000)
    await sleep(600)
    return ctx.state === 'running' && ctx.currentTime > before
  }

  /**
   * Replaces the audio context and every node in it, for when kick() doesn't
   * bring the clock back. The caller reconnects the simulation afterwards.
   * Outside a tap the new context may start suspended, so wake() it on the next tap.
   */
  async rebuild() {
    const old = Tone.getContext()
    this.ready = false
    // The voices belong to the old context and go with it.
    this.slots.clear()
    old.transport.stop()
    old.transport.cancel(0)
    await this.init()
    try {
      old.dispose()
      const raw = old.rawContext as AudioContext
      if (raw.state !== 'closed') void raw.close().catch(() => {})
    } catch (err) {
      console.warn(`Old audio context did not close cleanly: ${String(err)}`)
    }
  }

  /** The underlying Web Audio context. */
  context(): BaseAudioContext {
    return Tone.getContext().rawContext as BaseAudioContext
  }

  /** What the debug badge shows: context state, audio clock, output level and iOS audio session type. */
  debugInfo() {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    const ctx = Tone.getContext().rawContext
    return {
      state: this.ready ? (ctx.state as string) : 'not started',
      time: this.ready ? ctx.currentTime.toFixed(1) : '–',
      level: this.ready ? this.level().toFixed(3) : '–',
      session: hasNativeAudio
        ? `${nativeSessionLabel()} · web ${nav.audioSession?.type ?? 'n/a'}`
        : (nav.audioSession?.type ?? 'n/a'),
    }
  }

  /** Decoded audio held in memory: every loaded texture loop and note, as 32-bit samples. */
  decodedBytes(): number {
    return Object.values(this.samples).reduce((n, b) => n + b.length * b.numberOfChannels * 4, 0)
  }

  level(): number {
    if (!this.ready) return 0
    const v = this.meter.getValue()
    return typeof v === 'number' ? v : Math.max(...v)
  }
}

export const engine = new AudioEngine()

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/** Waits for a promise to settle, but no longer than `ms`. Errors are ignored. */
const settle = (p: Promise<unknown>, ms: number) =>
  Promise.race([p.then(
    () => {},
    () => {},
  ), sleep(ms)])

/**
 * Fetches and decodes an audio file. This replaces Tone's own loader, which
 * rejects any response that isn't `ok`: in the iOS app, Capacitor serves audio
 * files (.wav, .m4a) without an HTTP status, so fetch reports status 0 even
 * though the file arrives in full.
 */
async function loadSample(url: string): Promise<Tone.ToneAudioBuffer> {
  const response = await fetch(url)
  if (!response.ok && response.status !== 0) throw new Error(`Could not load ${url} (${response.status})`)
  const data = await response.arrayBuffer()
  if (data.byteLength === 0) throw new Error(`Could not load ${url} (empty)`)
  return new Tone.ToneAudioBuffer(await Tone.getContext().decodeAudioData(data))
}
