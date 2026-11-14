import type { FilterSettings } from './types'

/**
 * Each object's own low-pass filter. Cutoff and resonance are stored as 0–1
 * slider positions, like volume, and turned into Hz and dB here, so the audio,
 * the readouts and the curve drawing all agree.
 */

/** Fully open, which is how every object sounds until its filter is touched. */
export const OPEN_FILTER: FilterSettings = { cutoff: 1, resonance: 0 }

const LOW_HZ = 60
const HIGH_HZ = 20000
/** Peak at the cutoff with resonance all the way up. */
const MAX_PEAK_DB = 16

/** Logarithmic, so each stretch of the slider covers the same number of octaves. */
export function cutoffHz(pos: number): number {
  return LOW_HZ * (HIGH_HZ / LOW_HZ) ** pos
}

/**
 * Resonance as the filter's Q. For a Web Audio low-pass, Q is in decibels:
 * 0 is a smooth roll-off and higher values add a peak at the cutoff.
 */
export function resonanceDb(r: number): number {
  return r * MAX_PEAK_DB
}

export const isOpen = (f: FilterSettings) => f.cutoff >= 0.995 && f.resonance <= 0.005

export function cutoffFmt(pos: number): string {
  if (pos >= 0.995) return 'Open'
  const hz = cutoffHz(pos)
  if (hz < 1000) return `${Math.round(hz / 10) * 10} Hz`
  return `${(hz / 1000).toFixed(hz < 10000 ? 1 : 0)} kHz`
}

/** Gain in dB at `hz`, for drawing the curve: a two-pole low-pass, the same shape the audio filter has. */
export function responseDb(f: FilterSettings, hz: number): number {
  const x = hz / cutoffHz(f.cutoff)
  const q = 10 ** (resonanceDb(f.resonance) / 20)
  const mag = 1 / Math.sqrt((1 - x * x) ** 2 + (x / q) ** 2)
  return 20 * Math.log10(mag)
}

/** Frequency range the curve spans, in Hz. */
export const CURVE_RANGE: [number, number] = [30, HIGH_HZ]
