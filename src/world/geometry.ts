import type { Kind, Orbit, Pulse, WorldObject } from './types'

/** radius = unit × (a + size × b) */
const RADIUS: Record<Kind, [number, number]> = {
  drone: [0.07, 0.13],
  chime: [0.012, 0.016],
  pulse: [0.02, 0.022],
  orbit: [0.06, 0.13],
  texture: [0.11, 0.17],
}

/** Visual and collision radius of an object, in px. */
export function radius(o: WorldObject, unit: number): number {
  const [a, b] = RADIUS[o.kind]
  return unit * (a + o.size * b)
}

/** Inverse of radius(): the size that gives a radius, clamped to 0–1. */
export function sizeForRadius(kind: Kind, r: number, unit: number): number {
  const [a, b] = RADIUS[kind]
  return Math.min(1, Math.max(0, (r / unit - a) / b))
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

/** Radius of the selection ring drawn around an object. */
export function selectionRadius(o: WorldObject, unit: number): number {
  switch (o.kind) {
    case 'orbit':
      return beadRadius(o, unit, Math.max(0, ...o.beads)) + 14
    case 'drone':
      return radius(o, unit) * 0.8
    case 'texture':
      return radius(o, unit) * 0.78
    default:
      return hitRadius(o, unit) + 4
  }
}

export const HANDLE_ANGLE = -Math.PI / 4
