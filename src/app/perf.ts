import { Capacitor } from '@capacitor/core'
import { createStore } from './store'

/**
 * Switches for measuring what drawing costs on a device (milestone 2, T1).
 * Toggled from the debug badge and remembered on the device, so they survive
 * relaunching from Xcode. The iOS app draws at 30 fps by default, which halved
 * the WebKit GPU process's CPU on an iPhone 14; the web version still draws at 60.
 */
export interface PerfSwitches {
  /** Draw every other frame. */
  fps30: boolean
  /** No backdrop blur behind the buttons and tray. */
  noBlur: boolean
  /** Hide the paper grain overlay. */
  noGrain: boolean
}

const KEY = 'skyloom:perf'
const DEFAULTS: PerfSwitches = { fps30: Capacitor.isNativePlatform(), noBlur: false, noGrain: false }

function read(): PerfSwitches {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export const perfSwitches = createStore<PerfSwitches>(read())

export function togglePerf(key: keyof PerfSwitches) {
  perfSwitches.set((s) => ({ [key]: !s[key] }))
  try {
    localStorage.setItem(KEY, JSON.stringify(perfSwitches.get()))
  } catch {
    // Private mode: the switch still applies for this session.
  }
}

/** Frames drawn and the time spent drawing them (ms), written by the draw loop. */
export const drawStats = { frames: 0, ms: 0 }
