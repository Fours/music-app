export type ScaleId = 'bright' | 'wistful' | 'dreamy' | 'mellow' | 'melancholy' | 'mysterious'

export interface Scale {
  id: ScaleId
  mood: string
  name: string
  steps: number[]
  /**
   * Letter for each note, counted from the root's letter (0 = same letter).
   * Seven-note scales use every letter once. Five-note scales take theirs
   * from the seven-note scale they come from, so minor pentatonic is
   * 1 ♭3 4 5 ♭7 and spells A C D E G, never A C D E F𝄪.
   */
  letters: number[]
}

export const SCALES: Scale[] = [
  { id: 'bright', mood: 'Bright', name: 'Major pentatonic', steps: [0, 2, 4, 7, 9], letters: [0, 1, 2, 4, 5] },
  { id: 'dreamy', mood: 'Dreamy', name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11], letters: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'mellow', mood: 'Mellow', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], letters: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'wistful', mood: 'Wistful', name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10], letters: [0, 2, 3, 4, 6] },
  { id: 'melancholy', mood: 'Melancholy', name: 'Aeolian', steps: [0, 2, 3, 5, 7, 8, 10], letters: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'mysterious', mood: 'Mysterious', name: 'Hirajoshi', steps: [0, 2, 3, 7, 8], letters: [0, 1, 2, 4, 5] },
]

/** Default spelling of each pitch class, used where no key applies. */
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

// ------------------------------------------------------------ spelling

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
/** Pitch class of each natural letter. */
const NATURAL = [0, 2, 4, 5, 7, 9, 11]
const ACCIDENTAL: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' }

/** Semitones from a natural letter to a pitch class, in -6..5 (so -1 is a flat, 1 a sharp). */
const offset = (pc: number, letter: number) => ((((pc - NATURAL[letter]) % 12) + 18) % 12) - 6

interface Spelling {
  /** Letter index of the root, 0 = C. */
  letter: number
  /** Accidental of each scale note, in scale order. */
  accidentals: number[]
}

function spellFrom(h: Harmony, letter: number): Spelling {
  return {
    letter,
    accidentals: h.scale.steps.map((st, i) => offset(h.root + st, (letter + h.scale.letters[i]) % 7)),
  }
}

const spellings = new Map<string, Spelling>()

/**
 * How to spell a key: the root's letter is whichever reads most simply.
 * A C♯ root in Lydian would need F𝄪, so it is spelled D♭ there. Ties keep
 * the usual name from KEYS.
 */
function spelling(h: Harmony): Spelling {
  const id = `${h.root}:${h.scale.id}`
  let best = spellings.get(id)
  if (best) return best
  const usual = LETTERS.indexOf(KEYS[h.root][0])
  const cost = (sp: Spelling) => sp.accidentals.reduce((sum, a) => sum + (Math.abs(a) > 1 ? 10 : Math.abs(a)), 0)
  best = spellFrom(h, usual)
  for (let letter = 0; letter < 7; letter++) {
    if (Math.abs(offset(h.root, letter)) > 1) continue
    const sp = spellFrom(h, letter)
    if (cost(sp) < cost(best)) best = sp
  }
  spellings.set(id, best)
  return best
}

/** The key's name, spelled for its scale (C♯ or D♭, say). */
export function keyName(h: Harmony): string {
  const sp = spelling(h)
  return LETTERS[sp.letter] + ACCIDENTAL[sp.accidentals[0]]
}

/**
 * A note's name and octave, spelled as it is written in the key: G♯4 in
 * D Lydian, A♭4 in E♭ Aeolian. Notes outside the scale use KEYS.
 */
export function noteName(m: number, h: Harmony): string {
  const pc = (((m - h.root) % 12) + 12) % 12
  const i = h.scale.steps.indexOf(pc)
  if (i < 0) return `${KEYS[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`
  const sp = spelling(h)
  const acc = sp.accidentals[i]
  // The octave number follows the letter: B♯3 sounds as C4 but is written in octave 3.
  const octave = Math.floor((m - acc) / 12) - 1
  return `${LETTERS[(sp.letter + h.scale.letters[i]) % 7]}${ACCIDENTAL[acc]}${octave}`
}
