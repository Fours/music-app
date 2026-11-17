import { useSyncExternalStore } from 'react'
import type { Settings } from '../world/types'

export type Phase = 'welcome' | 'loading' | 'running'
export type Panel = 'none' | 'settings' | 'scenes' | 'record'
export type CaptureKind = 'audio' | 'video'

export interface Capture {
  kind: CaptureKind
  since: number
  saving: boolean
}

/** A finished recording or clip, shown in the app because iOS web views can't download files. */
export interface Preview {
  kind: CaptureKind
  url: string
  name: string
  type: string
  bytes: number
  seconds: number
  /** Clips only: frames painted, and how many a steady 30 fps would give. */
  frames?: { drawn: number; expected: number; width: number; height: number }
  /** Clips only: what went wrong, if the recorder failed or stopped early but left some video. */
  problem?: string | null
  /** Clips only: an image of the first frame, shown before the clip plays. */
  poster?: string
  /** The file is being written or the share sheet is open. */
  sharing?: boolean
}

export interface UIState {
  phase: Phase
  loadProgress: number
  playing: boolean
  selectedId: string | null
  /** A touch drag is under way; the inspector steps aside so it doesn't cover the object. */
  dragging: boolean
  sceneName: string
  presetId: string | null
  settings: Settings
  /** Bumped whenever object parameters change, so panels re-read them. */
  version: number
  /** An audio recording or video clip in progress (or being saved). */
  capture: Capture | null
  preview: Preview | null
  panel: Panel
  toast: { id: number; text: string } | null
  objectCount: number
}

type Listener = () => void

export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<Listener>()
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...next }
      for (const l of listeners) l()
    },
    subscribe(l: Listener) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>

export function useStore<T extends object, R>(store: Store<T>, select: (s: T) => R): R {
  return useSyncExternalStore(store.subscribe, () => select(store.get()))
}
