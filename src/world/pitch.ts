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
