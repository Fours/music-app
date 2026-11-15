import { createStore } from './store'

/**
 * Notes about what the app did to keep audio running (restarts, rebuilds),
 * shown in the debug badge's log. Kept apart from the controller so the badge
 * can read it without an import cycle.
 */
export const audioLog = createStore({ lines: [] as { id: number; text: string }[] })

let id = 0

export function noteAudio(text: string) {
  console.info(`[audio] ${text}`)
  audioLog.set((s) => ({ lines: [...s.lines, { id: ++id, text }].slice(-10) }))
}
