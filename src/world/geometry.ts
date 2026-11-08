import type { Orbit, Pulse, WorldObject } from './types'

/** Visual and collision radius of an object, in px. */
export function radius(o: WorldObject, unit: number): number {
  switch (o.kind) {
    case 'drone':
      return unit * (0.07 + o.size * 0.13)
    case 'chime':
      return unit * (0.012 + o.size * 0.016)
    case 'pulse':
      return unit * (0.02 + o.size * 0.022)
    case 'orbit':
      return unit * (0.06 + o.size * 0.13)
    case 'texture':
      return unit * (0.11 + o.size * 0.17)
  }
}

/** How far a pulse's ripples travel before fading out. */
export function reach(p: Pulse, unit: number): number {
  return unit * (0.12 + p.reach * 0.38)
}

/** Distance from an orbit's centre to a bead that sits `step` degrees up. */
export function beadRadius(o: Orbit, unit: number, step: number): number {
  const r = radius(o, unit)
  return r * (1 + step * 0.075)
}

export const BEAD_MIN = -3
export const BEAD_MAX = 8

/** Radius used for chime bounces. Drones are soft, so only their core is solid. */
export function solidRadius(o: WorldObject, unit: number): number {
  switch (o.kind) {
    case 'drone':
      return radius(o, unit) * 0.55
    case 'orbit':
      return radius(o, unit) * 1.05
    case 'texture':
      return 0
    default:
      return radius(o, unit)
  }
}

/** Generous touch target: small things are easier to grab than they look. */
export function hitRadius(o: WorldObject, unit: number): number {
  const r = radius(o, unit)
  switch (o.kind) {
    case 'chime':
      return Math.max(r * 2.2, 22)
    case 'pulse':
      return Math.max(r * 2, 26)
    case 'orbit':
      return r * 1.15
    case 'drone':
      return r * 0.8
    case 'texture':
      return r * 0.75
  }
}
