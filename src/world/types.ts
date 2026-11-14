import type { ScaleId } from '../music/theory'

export type Kind = 'drone' | 'chime' | 'pulse' | 'orbit' | 'texture'

export type DroneTimbre = 'warm' | 'glass' | 'reed' | 'choir'
export type ChimeSound = 'bell' | 'piano' | 'glass'
export type PulseSound = 'mallet' | 'soft' | 'piano'
export type OrbitSound = 'pluck' | 'musicbox' | 'marimba'
export type TextureSound = 'rain' | 'wind' | 'waves' | 'embers'

interface Base {
  id: string
  /** Position as a fraction of the canvas, 0–1. */
  x: number
  y: number
  /** Size 0–1; radius in px is derived from the canvas's short side. */
  size: number
  volume: number
  /** Sweeps the volume back and forth on its own. Missing in older saves and until first switched on. */
  oscillate?: Oscillation
  /** Low-pass filter on the object's sound. Missing in older saves and until first touched, which means fully open. */
  filter?: FilterSettings
}

export interface FilterSettings {
  /** 0–1 slider positions; see world/filter.ts for Hz and dB. */
  cutoff: number
  resonance: number
  /** Sweeps the cutoff back and forth on its own. */
  oscillate?: Oscillation
}

export interface Oscillation {
  on: boolean
  /** The two ends of the sweep, as 0–1 positions on the slider, in either order. */
  ends: [number, number]
  /** Seconds for one full cycle, low → high → low. */
  period: number
}

export interface Drone extends Base {
  kind: 'drone'
  timbre: DroneTimbre
  drift: number
}

export interface Chime extends Base {
  kind: 'chime'
  sound: ChimeSound
  speed: number
  /** Direction of travel in radians. */
  heading: number
  /** 0–1: how slowly each note swells in, from a sharp strike to a slow fade-in. Missing in older saves. */
  attack?: number
}

export interface Pulse extends Base {
  kind: 'pulse'
  sound: PulseSound
  rate: number
  reach: number
  /** 0–1: how slowly each note swells in, from a sharp strike to a slow fade-in. Missing in older saves. */
  attack?: number
}

export type OrbitDirection = 'forward' | 'backward'

export interface Orbit extends Base {
  kind: 'orbit'
  sound: OrbitSound
  /** One entry per bead: scale steps above (or below) the orbit's base note. */
  beads: number[]
  /** Parallel to `beads`: a muted step still turns the ring but makes no sound. Missing in older saves. */
  muted?: boolean[]
  /** Forward plays the pattern in order with the ring turning clockwise. Missing in older saves. */
  direction?: OrbitDirection
  /** Shifts every step off the eighth-note grid, from −1 (an eighth early) to 1 (an eighth late). Missing in older saves. */
  offset?: number
  length: number
  /** 0–1: how slowly each note swells in, from a sharp strike to a slow fade-in. Missing in older saves. */
  attack?: number
  evolve: number
}

export interface Texture extends Base {
  kind: 'texture'
  sound: TextureSound
  drift: number
}

export type WorldObject = Drone | Chime | Pulse | Orbit | Texture

export interface Settings {
  root: number
  scale: ScaleId
  tempo: number
  space: number
  /** Tape effects on the whole mix, 0–1. Missing in older saves. */
  wow?: number
  flutter?: number
  wear?: number
  volume: number
}

export interface Scene {
  name: string
  settings: Settings
  objects: WorldObject[]
}

/** Sound events produced by the simulation, scheduled at an audio time. */
export type SoundEvent =
  | { type: 'chime'; id: string; time: number; velocity: number }
  | { type: 'pulse'; id: string; time: number }
  | { type: 'orbit'; id: string; time: number; bead: number }

export const LIMITS: Record<Kind, number> = {
  drone: 5,
  chime: 12,
  pulse: 5,
  orbit: 5,
  texture: 4,
}
