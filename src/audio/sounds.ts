import type { SoundId, WorldObject } from '../world/types'
import { INSTRUMENTS, type Instrument, type InstrumentKind } from './instruments'

/**
 * Every sound a chime, pulse or orbit can play: the synthesized ones in
 * voices.ts, then the sampled instruments in the manifest that
 * scripts/prepare-instruments.mjs writes. Adding an instrument there adds it
 * here, with no code changes.
 */

export interface SoundChoice {
  id: SoundId
  label: string
  sampled: boolean
}

/** The synthesized sounds each kind offers, its default first. */
const SYNTHESIZED: Record<InstrumentKind, { id: SoundId; label: string }[]> = {
  chime: [
    { id: 'bell', label: 'Bell' },
    { id: 'glass', label: 'Glass' },
  ],
  pulse: [
    { id: 'mallet', label: 'Mallet' },
    { id: 'soft', label: 'Soft' },
  ],
  orbit: [
    { id: 'pluck', label: 'Pluck' },
    { id: 'musicbox', label: 'Music box' },
    { id: 'marimba', label: 'Marimba' },
  ],
}

const SYNTH_IDS = new Set(Object.values(SYNTHESIZED).flatMap((list) => list.map((s) => s.id)))

/** Sampled instruments by id. One with a synthesized sound's id would be unreachable, so it's left out. */
const SAMPLED = new Map<SoundId, Instrument>()
for (const inst of INSTRUMENTS) {
  if (SYNTH_IDS.has(inst.id)) console.error(`Instrument "${inst.id}" has a synthesized sound's id; rename its folder.`)
  else SAMPLED.set(inst.id, inst)
}

const CHOICES = Object.fromEntries(
  (Object.keys(SYNTHESIZED) as InstrumentKind[]).map((kind) => [
    kind,
    [
      ...SYNTHESIZED[kind].map((s) => ({ ...s, sampled: false })),
      ...[...SAMPLED.values()].filter((i) => i.kinds.includes(kind)).map((i) => ({ id: i.id, label: i.name, sampled: true })),
    ],
  ]),
) as Record<InstrumentKind, SoundChoice[]>

/** The sounds a kind offers, in the order the picker shows them. */
export const soundsFor = (kind: InstrumentKind): SoundChoice[] => CHOICES[kind]

/** The kind's sound for `id`, or its default when it doesn't offer that one (an instrument since removed). */
export function soundOf(kind: InstrumentKind, id: unknown): SoundId {
  return CHOICES[kind].some((s) => s.id === id) ? (id as SoundId) : SYNTHESIZED[kind][0].id
}

/** The sampled instrument with this id, if it is one. */
export const sampledInstrument = (id: SoundId): Instrument | undefined => SAMPLED.get(id)

/** Every file the sampled instruments play, as paths in public/samples/. */
export const INSTRUMENT_FILES = [...SAMPLED.values()].flatMap((i) => i.layers.flatMap((l) => Object.values(l.notes)))

/** Gives every chime, pulse and orbit a sound its kind offers, in place. */
export function checkSounds(objects: WorldObject[]) {
  for (const o of objects) if (o.kind === 'chime' || o.kind === 'pulse' || o.kind === 'orbit') o.sound = soundOf(o.kind, o.sound)
}
