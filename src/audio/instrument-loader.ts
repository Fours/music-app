import * as Tone from 'tone'
import type { SoundId } from '../world/types'
import type { Instrument } from './instruments'
import { sampledInstrument } from './sounds'

/** Notes fetched at once for one instrument. */
const PARALLEL = 4

/** How long an instrument took to have a note to play, for the debug badge (milestone 3, T6). */
export interface FirstNote {
  id: SoundId
  ms: number
  /** Loaded at Begin listening, with the scene's other sounds, rather than chosen while playing. */
  atBegin: boolean
}

interface Load {
  /** Every note file, nearest the first request's pitch first. */
  files: string[]
  loaded: number
  failed: number
  done: Promise<void>
}

/**
 * Fetches sampled instruments' notes when they're first needed, nearest the
 * pitch they're needed at first, so an instrument can start playing before
 * all of its notes arrive (milestone 3, T3). Decoded notes go into the shared
 * `buffers` and stay there, through an audio rebuild too.
 */
export class InstrumentLoader {
  private loads = new Map<SoundId, Load>()
  private noteListeners = new Set<(file: string) => void>()

  /** Called when the set of instruments still loading changes. */
  onChange?: () => void
  /** Called when none of an instrument's notes could be loaded. It can be asked for again. */
  onFailed?: (id: SoundId) => void
  /** Each instrument's time to its first note, oldest first. */
  readonly firstNotes: FirstNote[] = []
  /** Set while Begin listening loads the scene's instruments, so their times are labelled as such. */
  atBegin = false

  private buffers: Record<string, Tone.ToneAudioBuffer>
  private fetchNote: (file: string) => Promise<Tone.ToneAudioBuffer>

  constructor(buffers: Record<string, Tone.ToneAudioBuffer>, fetchNote: (file: string) => Promise<Tone.ToneAudioBuffer>) {
    this.buffers = buffers
    this.fetchNote = fetchNote
  }

  /**
   * Starts loading `id` if it isn't loaded or loading, and resolves when every
   * note has been tried. `nearMidi` is where it will be played first.
   * `onFile` hears each note finish, loaded or not, for a progress bar.
   */
  load(id: SoundId, nearMidi = 60, onFile?: () => void): Promise<void> {
    const existing = this.loads.get(id)
    if (existing) return existing.done
    const inst = sampledInstrument(id)
    if (!inst) return Promise.resolve()
    const files = noteFiles(inst, nearMidi)
    const load: Load = { files, loaded: 0, failed: 0, done: Promise.resolve() }
    this.loads.set(id, load)
    const queue = [...files]
    const started = performance.now()
    const atBegin = this.atBegin
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          if (!this.buffers[file]) this.buffers[file] = await this.fetchNote(file)
          load.loaded++
          if (load.loaded === 1) this.firstNotes.push({ id, ms: performance.now() - started, atBegin })
          for (const listener of this.noteListeners) listener(file)
        } catch (err) {
          load.failed++
          console.warn(`Could not load ${file}: ${err instanceof Error ? err.message : String(err)}`)
        }
        onFile?.()
      }
    }
    load.done = Promise.all(Array.from({ length: PARALLEL }, worker)).then(() => {
      if (load.loaded === 0) {
        // Forget it, so choosing it again tries again.
        this.loads.delete(id)
        this.onFailed?.(id)
      }
      this.onChange?.()
    })
    this.onChange?.()
    return load.done
  }

  /** How many note files `id` has, for a progress bar. */
  fileCount(id: SoundId): number {
    const inst = sampledInstrument(id)
    return inst ? inst.layers.reduce((n, l) => n + Object.keys(l.notes).length, 0) : 0
  }

  /** Whether `id` has at least one note to play. */
  playable(id: SoundId): boolean {
    return (this.loads.get(id)?.loaded ?? 0) > 0
  }

  /** Instruments with notes still to try. */
  loading(): SoundId[] {
    return [...this.loads].filter(([, l]) => l.loaded + l.failed < l.files.length).map(([id]) => id)
  }

  /** Hears every note as it arrives, so an instrument already playing can add it. Returns an unsubscribe. */
  onNote(listener: (file: string) => void): () => void {
    this.noteListeners.add(listener)
    return () => this.noteListeners.delete(listener)
  }
}

/** An instrument's note files, nearest `midi` first, alternating its layers at the same distance. */
function noteFiles(inst: Instrument, midi: number): string[] {
  const notes = inst.layers.flatMap((layer, order) =>
    Object.entries(layer.notes).map(([note, file]) => ({ file, distance: Math.abs(Tone.Frequency(note).toMidi() - midi), order })),
  )
  notes.sort((a, b) => a.distance - b.distance || a.order - b.order)
  return notes.map((n) => n.file)
}
