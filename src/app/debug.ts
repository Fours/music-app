import { useRef } from 'react'
import { app } from './controller'
import { createStore } from './store'

const KEY = 'skyloom:debug'

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Whether the audio debug badge is showing. Remembered on this device. */
export const debug = createStore({ on: read() })

/** Returns a click handler that turns the badge on or off after five quick taps. */
export function useDebugTaps() {
  const taps = useRef<number[]>([])
  return () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 2000), now]
    if (taps.current.length < 5) return
    taps.current = []
    const on = !debug.get().on
    debug.set({ on })
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      // Private mode: the badge still toggles for this session.
    }
    app.toast(on ? 'Audio debug badge on' : 'Audio debug badge off')
  }
}
