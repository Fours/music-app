export type ScaleId = 'bright' | 'wistful' | 'dreamy' | 'mellow' | 'melancholy' | 'mysterious'

export interface Scale {
  id: ScaleId
  mood: string
  name: string
  steps: number[]
}

export const SCALES: Scale[] = [
  { id: 'bright', mood: 'Bright', name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  { id: 'dreamy', mood: 'Dreamy', name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mellow', mood: 'Mellow', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'wistful', mood: 'Wistful', name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  { id: 'melancholy', mood: 'Melancholy', name: 'Aeolian', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'mysterious', mood: 'Mysterious', name: 'Hirajoshi', steps: [0, 2, 3, 7, 8] },
]

export const KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']

export function scaleById(id: ScaleId): Scale {
  return SCALES.find((s) => s.id === id) ?? SCALES[0]
}

export interface Harmony {
  root: number // pitch class 0–11
  scale: Scale
}

/** All scale pitches (MIDI) in [low, high]. */
export function scalePitches(h: Harmony, low: number, high: number): number[] {
  const out: number[] = []
  for (let m = low; m <= high; m++) {
    if (h.scale.steps.includes((((m - h.root) % 12) + 12) % 12)) out.push(m)
  }
  return out
}

/** Root, fifth and third: notes that can be held together without clashing. */
export function chordPitches(h: Harmony, low: number, high: number): number[] {
  const s = h.scale.steps
  const third = s.includes(4) ? 4 : s.includes(3) ? 3 : 2
  const pcs = [0, 7, third]
  const out: number[] = []
  for (let m = low; m <= high; m++) {
    if (pcs.includes((((m - h.root) % 12) + 12) % 12)) out.push(m)
  }
  return out
}

/** Map a vertical position (0 = top) onto the nearest pitch in a set. */
export function pitchAt(y: number, pitches: number[]): number {
  const t = 1 - Math.min(1, Math.max(0, y))
  const i = Math.round(t * (pitches.length - 1))
  return pitches[i]
}

/** Move `steps` scale degrees away from a scale pitch. */
export function stepFrom(h: Harmony, midi: number, steps: number): number {
  const all = scalePitches(h, 12, 120)
  let i = all.indexOf(midi)
  if (i < 0) i = all.findIndex((m) => m >= midi)
  return all[Math.min(all.length - 1, Math.max(0, i + steps))]
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export function noteName(m: number): string {
  return `${KEYS[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
}
