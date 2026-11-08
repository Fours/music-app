import { makeObject } from './objects'
import type { Kind, Scene, Settings, WorldObject } from './types'

export interface Preset {
  id: string
  name: string
  description: string
  /** Swatch colours for the scene menu. */
  colors: [string, string]
  build(): Scene
}

function obj<K extends Kind>(
  kind: K,
  x: number,
  y: number,
  props: Partial<Extract<WorldObject, { kind: K }>> = {},
): WorldObject {
  return { ...makeObject(kind, x, y), ...props } as WorldObject
}

const settings = (s: Partial<Settings>): Settings => ({
  root: 2,
  scale: 'dreamy',
  tempo: 60,
  space: 0.65,
  volume: 0.8,
  ...s,
})

export const PRESETS: Preset[] = [
  {
    id: 'morning-fog',
    name: 'Morning Fog',
    description: 'Soft drones and slow bells through a hazy breeze',
    colors: ['#c9c3e8', '#e8ddd0'],
    build: () => ({
      name: 'Morning Fog',
      settings: settings({ root: 2, scale: 'dreamy', tempo: 54, space: 0.75 }),
      objects: [
        obj('drone', 0.28, 0.72, { size: 0.75, timbre: 'warm', drift: 0.25 }),
        obj('drone', 0.66, 0.42, { size: 0.5, timbre: 'glass', volume: 0.68, drift: 0.35 }),
        obj('texture', 0.78, 0.24, { sound: 'wind', size: 0.7, volume: 0.63 }),
        obj('orbit', 0.5, 0.55, {
          size: 0.62,
          sound: 'musicbox',
          beads: [0, 2, 4, 6, 3, 5],
          length: 0.55,
          evolve: 0.25,
          volume: 0.68,
        }),
        obj('chime', 0.18, 0.3, { sound: 'glass', speed: 0.18, size: 0.45 }),
        obj('chime', 0.82, 0.68, { sound: 'glass', speed: 0.22, size: 0.6 }),
      ],
    }),
  },
  {
    id: 'rain-on-glass',
    name: 'Rain on Glass',
    description: 'A felt piano, a low reed and rain against the window',
    colors: ['#a9bccf', '#d9dfe6'],
    build: () => ({
      name: 'Rain on Glass',
      settings: settings({ root: 9, scale: 'wistful', tempo: 60, space: 0.7 }),
      objects: [
        obj('texture', 0.5, 0.3, { sound: 'rain', size: 0.85, volume: 0.7, drift: 0.08 }),
        obj('drone', 0.32, 0.78, { size: 0.7, timbre: 'reed', volume: 0.7, drift: 0.2 }),
        obj('pulse', 0.7, 0.62, { sound: 'piano', rate: 0.3, reach: 0.7, volume: 0.73 }),
        obj('chime', 0.25, 0.4, { sound: 'piano', speed: 0.25 }),
        obj('chime', 0.62, 0.22, { sound: 'piano', speed: 0.3, size: 0.4 }),
        obj('chime', 0.84, 0.82, { sound: 'piano', speed: 0.2, size: 0.65 }),
        obj('orbit', 0.2, 0.62, {
          size: 0.3,
          sound: 'pluck',
          beads: [0, 3, 5, 7],
          length: 0.3,
          volume: 0.65,
        }),
      ],
    }),
  },
  {
    id: 'open-sea',
    name: 'Open Sea',
    description: 'Long swells, a wordless choir and distant buoys',
    colors: ['#9fc8d3', '#e4eef0'],
    build: () => ({
      name: 'Open Sea',
      settings: settings({ root: 3, scale: 'mellow', tempo: 48, space: 0.85 }),
      objects: [
        obj('texture', 0.5, 0.8, { sound: 'waves', size: 0.9, volume: 0.73, drift: 0.1 }),
        obj('drone', 0.35, 0.6, { size: 0.85, timbre: 'choir', volume: 0.68, drift: 0.3 }),
        obj('drone', 0.7, 0.75, { size: 0.6, timbre: 'warm', volume: 0.7, drift: 0.2 }),
        obj('pulse', 0.55, 0.35, { sound: 'soft', rate: 0.2, reach: 0.95, size: 0.7 }),
        obj('chime', 0.2, 0.2, { sound: 'bell', speed: 0.15, size: 0.55 }),
        obj('chime', 0.8, 0.3, { sound: 'bell', speed: 0.12, size: 0.4 }),
      ],
    }),
  },
  {
    id: 'hearth',
    name: 'Hearth',
    description: 'Embers crackle under a warm, turning marimba figure',
    colors: ['#e7b79a', '#f1e4d6'],
    build: () => ({
      name: 'Hearth',
      settings: settings({ root: 5, scale: 'melancholy', tempo: 58, space: 0.55 }),
      objects: [
        obj('texture', 0.3, 0.78, { sound: 'embers', size: 0.6, volume: 0.72, drift: 0.05 }),
        obj('drone', 0.62, 0.7, { size: 0.8, timbre: 'warm', drift: 0.2 }),
        obj('orbit', 0.55, 0.4, {
          size: 0.55,
          sound: 'marimba',
          beads: [0, 2, 4, 2, 5, 4, 2, 1],
          length: 0.35,
          evolve: 0.3,
          volume: 0.73,
        }),
        obj('chime', 0.18, 0.3, { sound: 'piano', speed: 0.2, size: 0.55 }),
      ],
    }),
  },
  {
    id: 'night-garden',
    name: 'Night Garden',
    description: 'Two music boxes drift in and out of step',
    colors: ['#b7b0d9', '#d7e5d8'],
    build: () => ({
      name: 'Night Garden',
      settings: settings({ root: 1, scale: 'mysterious', tempo: 64, space: 0.7 }),
      objects: [
        obj('drone', 0.5, 0.78, { size: 0.7, timbre: 'glass', volume: 0.7, drift: 0.3 }),
        obj('orbit', 0.3, 0.42, {
          size: 0.45,
          sound: 'musicbox',
          beads: [0, 2, 4, 3, 5],
          length: 0.5,
          volume: 0.68,
        }),
        obj('orbit', 0.7, 0.38, {
          size: 0.52,
          sound: 'pluck',
          beads: [0, -1, 2, 4, 1, 3],
          length: 0.4,
          evolve: 0.4,
          volume: 0.68,
        }),
        obj('pulse', 0.52, 0.18, { sound: 'mallet', rate: 0.35, reach: 0.5, size: 0.35, volume: 0.7 }),
        obj('chime', 0.15, 0.75, { sound: 'glass', speed: 0.3, size: 0.4 }),
        obj('chime', 0.86, 0.66, { sound: 'glass', speed: 0.26, size: 0.5 }),
      ],
    }),
  },
  {
    id: 'paper-lanterns',
    name: 'Paper Lanterns',
    description: 'Three bright loops of different lengths, slowly phasing',
    colors: ['#f0cf8f', '#dfe8f2'],
    build: () => ({
      name: 'Paper Lanterns',
      settings: settings({ root: 7, scale: 'bright', tempo: 72, space: 0.6 }),
      objects: [
        obj('drone', 0.5, 0.82, { size: 0.65, timbre: 'warm', volume: 0.68, drift: 0.15 }),
        obj('orbit', 0.24, 0.45, { size: 0.32, sound: 'marimba', beads: [0, 2, 4, 2], length: 0.3, volume: 0.7 }),
        obj('orbit', 0.52, 0.4, {
          size: 0.4,
          sound: 'pluck',
          beads: [4, 3, 1, 2, 0],
          length: 0.35,
          volume: 0.68,
        }),
        obj('orbit', 0.8, 0.48, {
          size: 0.48,
          sound: 'musicbox',
          beads: [0, 4, 2, 5, 3, 6],
          length: 0.5,
          volume: 0.63,
        }),
        obj('pulse', 0.5, 0.15, { sound: 'soft', rate: 0.15, reach: 0.8, size: 0.4 }),
      ],
    }),
  },
]

export const EMPTY_SCENE = (current: Settings): Scene => ({
  name: 'Untitled',
  settings: current,
  objects: [],
})
