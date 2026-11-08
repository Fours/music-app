import { chordPitches, pitchAt, scaleById, scalePitches, stepFrom, type Harmony } from '../music/theory'
import type { Settings, WorldObject } from './types'

export function harmonyOf(s: Settings): Harmony {
  return { root: s.root, scale: scaleById(s.scale) }
}

/** The pitch set a kind snaps to as it moves up and down the canvas. */
export function pitchesFor(kind: WorldObject['kind'], h: Harmony): number[] {
  switch (kind) {
    case 'drone':
      return chordPitches(h, 36, 64)
    case 'chime':
      return scalePitches(h, 62, 93)
    case 'pulse':
      return scalePitches(h, 50, 79)
    case 'orbit':
      return scalePitches(h, 50, 74)
    case 'texture':
      return []
  }
}

/** The object's base note, or null for textures. */
export function baseNote(o: WorldObject, h: Harmony): number | null {
  if (o.kind === 'texture') return null
  return pitchAt(o.y, pitchesFor(o.kind, h))
}

export function beadNote(base: number, step: number, h: Harmony): number {
  return stepFrom(h, base, step)
}

/** How far an orbit step can be moved, in octaves from the orbit's base note. */
export const OCTAVE_MIN = -2
export const OCTAVE_MAX = 2

/** Lowest and highest bead step for the current scale: whole octaves either side of the base. */
export function beadRange(h: Harmony): [number, number] {
  const n = h.scale.steps.length
  return [OCTAVE_MIN * n, (OCTAVE_MAX + 1) * n - 1]
}

export function clampBead(step: number, h: Harmony): number {
  const [lo, hi] = beadRange(h)
  return Math.min(hi, Math.max(lo, step))
}

/** Split a bead step into a scale degree within the octave (0 = base note) and an octave offset. */
export function splitBead(step: number, h: Harmony): { degree: number; octave: number } {
  const n = h.scale.steps.length
  const octave = Math.floor(step / n)
  return { degree: step - octave * n, octave }
}

export function joinBead(degree: number, octave: number, h: Harmony): number {
  return octave * h.scale.steps.length + degree
}
