import { createStore } from './store'

/**
 * Notes about what the app did to keep audio running (restarts, rebuilds),
 * shown in the debug badge. Kept apart from the controller so the badge can
 * read it without an import cycle, and saved on the device so a relaunch
 * doesn't lose the evidence.
 */
export interface AudioNote {
  id: number
  /** Wall-clock time, HH:MM:SS. */
  at: string
  text: string
}

interface AudioLog {
  lines: AudioNote[]
  /** This launch: quick restarts (suspend and resume), full rebuilds, and iOS interruptions. */
  kicks: number
  rebuilds: number
  interruptions: number
}

const KEY = 'skyloom:audio-log'
const KEEP = 8

function read(): AudioNote[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

const saved = read()
export const audioLog = createStore<AudioLog>({ lines: saved, kicks: 0, rebuilds: 0, interruptions: 0 })

let id = saved.reduce((n, l) => Math.max(n, l.id), 0)

export function noteAudio(text: string, count?: 'kicks' | 'rebuilds' | 'interruptions') {
  console.info(`[audio] ${text}`)
  const line = { id: ++id, at: new Date().toTimeString().slice(0, 8), text }
  audioLog.set((s) => ({
    lines: [...s.lines, line].slice(-KEEP),
    ...(count ? { [count]: s[count] + 1 } : {}),
  }))
  try {
    localStorage.setItem(KEY, JSON.stringify(audioLog.get().lines))
  } catch {
    // Private mode: the log still shows for this launch.
  }
}
