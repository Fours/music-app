import type { Oscillation } from './types'

/** Shortest and longest cycle the Cycle slider offers, in seconds. */
export const PERIOD_MIN = 2
export const PERIOD_MAX = 120

const TAU = Math.PI * 2

/** What switching oscillation on for the first time starts from: a dip below the current volume. */
export function defaultOscillation(volume: number): Oscillation {
  return { on: true, ends: [Math.max(0, round(volume - 0.3)), volume], period: 8 }
}

const round = (v: number) => Math.round(v * 100) / 100

export function span(osc: Oscillation): [number, number] {
  const [a, b] = osc.ends
  return a <= b ? [a, b] : [b, a]
}

/**
 * Volume at `phase` (0–1) through a cycle. A raised cosine, so it eases in and
 * out at each end rather than bouncing off them: quietest at 0, loudest at 0.5.
 */
export function sweep(osc: Oscillation, phase: number): number {
  const [lo, hi] = span(osc)
  return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(phase * TAU))
}

/** The phase on the rising half of the cycle where the sweep passes `volume`, so switching on doesn't jump. */
export function phaseFor(osc: Oscillation, volume: number): number {
  const [lo, hi] = span(osc)
  if (hi - lo < 1e-6) return 0
  const t = Math.min(1, Math.max(0, (volume - lo) / (hi - lo)))
  return Math.acos(1 - 2 * t) / TAU
}

/** Cycle slider position (0–1) ↔ seconds. Logarithmic, so short cycles get as much room as long ones. */
export function posToPeriod(pos: number): number {
  const s = PERIOD_MIN * (PERIOD_MAX / PERIOD_MIN) ** pos
  if (s < 10) return Math.round(s * 2) / 2
  if (s < 60) return Math.round(s)
  return Math.round(s / 5) * 5
}

export function periodToPos(s: number): number {
  return Math.log(s / PERIOD_MIN) / Math.log(PERIOD_MAX / PERIOD_MIN)
}

export function periodFmt(s: number): string {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s - m * 60)
  return rest ? `${m} min ${rest} s` : `${m} min`
}
