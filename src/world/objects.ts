import type { Kind, WorldObject } from './types'

let counter = 0
export const newId = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`

/** A new object of `kind` with pleasant defaults, at a canvas position. */
export function makeObject(kind: Kind, x: number, y: number): WorldObject {
  const base = { id: newId(), x, y, volume: 0.75 }
  switch (kind) {
    case 'drone':
      return { ...base, kind, size: 0.6, timbre: 'warm', drift: 0.3 }
    case 'chime':
      return { ...base, kind, size: 0.5, sound: 'bell', speed: 0.35, heading: Math.random() * Math.PI * 2 }
    case 'pulse':
      return { ...base, kind, size: 0.5, sound: 'mallet', rate: 0.45, reach: 0.55 }
    case 'orbit':
      return {
        ...base,
        kind,
        size: 0.5,
        sound: 'pluck',
        beads: [0, 2, 4, 1, 3, 5],
        direction: 'forward',
        length: 0.4,
        evolve: 0,
      }
    case 'texture':
      return { ...base, kind, size: 0.6, volume: 0.69, sound: 'rain', drift: 0.15 }
  }
}

export function cloneObject(o: WorldObject): WorldObject {
  const copy = structuredClone(o)
  copy.id = newId()
  copy.x = Math.min(0.92, o.x + 0.06)
  copy.y = Math.min(0.92, o.y + 0.05)
  return copy
}

export const KIND_LABELS: Record<Kind, { name: string; blurb: string }> = {
  drone: { name: 'Drone', blurb: 'A held, breathing tone' },
  chime: { name: 'Chime', blurb: 'Rings when it bumps into things' },
  pulse: { name: 'Pulse', blurb: 'Sends out ripples that ring chimes' },
  orbit: { name: 'Orbit', blurb: 'Plays a repeating pattern' },
  texture: { name: 'Texture', blurb: 'Rain, wind, waves or embers' },
}
