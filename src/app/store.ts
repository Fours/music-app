import { useSyncExternalStore } from 'react'
import type { Settings } from '../world/types'

export type Phase = 'welcome' | 'loading' | 'running'
export type Panel = 'none' | 'settings' | 'scenes'

export interface UIState {
  phase: Phase
  loadProgress: number
  playing: boolean
  selectedId: string | null
  sceneName: string
  presetId: string | null
  settings: Settings
  /** Bumped whenever object parameters change, so panels re-read them. */
  version: number
  recordingSince: number | null
  saving: boolean
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
