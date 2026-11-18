import { useRef } from 'react'
import { app } from '../app/controller'
import type { InstrumentKind } from '../audio/instruments'
import { soundsFor } from '../audio/sounds'
import { attackTime } from '../audio/voices'
import { useStore } from '../app/store'
import { noteName } from '../music/theory'
import { KIND_LABELS } from '../world/objects'
import { ORBIT_STEP_NAMES, orbitStepIndex } from '../world/sim'
import { KIND_COLORS, TEXTURE_COLORS } from '../world/palette'
import { OCTAVE_MAX, OCTAVE_MIN, baseNote, beadNote, clampBead, harmonyOf, joinBead, splitBead } from '../world/pitch'
import type { Orbit, WorldObject } from '../world/types'
import { Segmented, Slider, SoundPicker } from './controls'
import { FilterField } from './FilterField'
import { OscillatingSlider } from './OscillatingSlider'
import { CloseIcon, CopyIcon, MinusIcon, MutedIcon, PlusIcon, ShuffleIcon, SpeakerIcon, TrashIcon } from './icons'

const pctFmt = (v: number) => `${Math.round(v * 100)}%`

/** A Sound field's choices: the kind's synthesized sounds, then its sampled instruments, marked while their notes load. */
const soundOptions = (kind: InstrumentKind, loading: string[]) =>
  soundsFor(kind).map((s) => ({ value: s.id, label: s.label, sampled: s.sampled, busy: loading.includes(s.id) }))

/** Orbit Size: the step length it snaps to. */
const stepFmt = (v: number) => ORBIT_STEP_NAMES[orbitStepIndex(v)]

/** Orbit Offset, in eighth notes either side of the beat. */
const offsetFmt = (v: number) => (v === 0 ? 'On the beat' : `${Math.round(Math.abs(v) * 100)}% of an 8th ${v < 0 ? 'early' : 'late'}`)

/** Close to zero snaps to it, so an orbit is easy to put back on the beat. */
const snapOffset = (v: number) => (Math.abs(v) < 0.06 ? 0 : v)

const attackFmt = (v: number) => {
  const t = attackTime(v)
  return t < 1 ? `${Math.round(t * 1000)} ms` : `${t.toFixed(1)} s`
}

/** How slowly each note swells in, so struck sounds can blend in rather than ping. */
function AttackSlider({ value, onChange }: { value: number | undefined; onChange: (attack: number) => void }) {
  return <Slider label="Attack" value={value ?? 0} onChange={onChange} hint={['Sharp', 'Swelling']} format={attackFmt} />
}

/** Volume, which can oscillate between two levels. */
function VolumeField({ o }: { o: WorldObject }) {
  return (
    <OscillatingSlider o={o} param="volume" label="Volume" onChange={(volume) => app.update(o.id, { volume })} format={pctFmt} />
  )
}

/** Panel for the selected object: a few big, friendly controls. */
export function Inspector() {
  const selectedId = useStore(app.ui, (s) => s.selectedId)
  useStore(app.ui, (s) => s.version) // re-read the object when it changes
  const settings = useStore(app.ui, (s) => s.settings)
  const loading = useStore(app.ui, (s) => s.loadingSounds)
  const o = app.find(selectedId)
  if (!o) return null

  const set = (patch: Partial<WorldObject>) => app.update(o.id, patch)
  const label = KIND_LABELS[o.kind]
  const h = harmonyOf(settings)
  const note = baseNote(o, h)
  const color = o.kind === 'texture' ? TEXTURE_COLORS[o.sound] : KIND_COLORS[o.kind]

  return (
    <aside className="sheet inspector" aria-label={`${label.name} settings`} key={o.id}>
      <header className="sheet-head">
        <span className="kind-dot" style={{ background: color }} />
        <div className="sheet-title">
          <h2>{label.name}</h2>
          <p>
            {label.blurb}
            {note !== null && (
              <>
                {' · '}
                <span className="note">{noteName(note, h)}</span>
              </>
            )}
          </p>
        </div>
        <button className="icon-button" onClick={() => app.select(null)} aria-label="Close">
          <CloseIcon />
        </button>
      </header>

      <div className="sheet-body">
        {o.kind === 'drone' && (
          <>
            <SoundPicker
              value={o.timbre}
              onChange={(timbre) => set({ timbre })}
              options={[
                { value: 'warm', label: 'Warm' },
                { value: 'glass', label: 'Glass' },
                { value: 'reed', label: 'Reed' },
                { value: 'choir', label: 'Choir' },
              ]}
            />
            <VolumeField o={o} />
            <Slider label="Size" value={o.size} onChange={(size) => set({ size })} format={pctFmt} />
            <Slider label="Wander" value={o.drift} onChange={(drift) => set({ drift })} hint={['Still', 'Wandering']} format={pctFmt} />
            <FilterField o={o} />
            <p className="tip">Drag it higher or lower to change its note. Further right sounds brighter.</p>
          </>
        )}

        {o.kind === 'chime' && (
          <>
            <SoundPicker
              value={o.sound}
              onChange={(sound) => set({ sound })}
              options={soundOptions('chime', loading)}
            />
            <VolumeField o={o} />
            <AttackSlider value={o.attack} onChange={(attack) => set({ attack })} />
            <Slider label="Speed" value={o.speed} onChange={(speed) => set({ speed })} hint={['Drifting', 'Darting']} format={pctFmt} />
            <Slider label="Size" value={o.size} onChange={(size) => set({ size })} format={pctFmt} />
            <FilterField o={o} />
            <p className="tip">Flick it to send it flying. Higher on the canvas rings higher notes.</p>
          </>
        )}

        {o.kind === 'pulse' && (
          <>
            <SoundPicker
              value={o.sound}
              onChange={(sound) => set({ sound })}
              options={soundOptions('pulse', loading)}
            />
            <VolumeField o={o} />
            <AttackSlider value={o.attack} onChange={(attack) => set({ attack })} />
            <Slider label="Rate" value={o.rate} onChange={(rate) => set({ rate })} hint={['Seldom', 'Often']} format={pctFmt} />
            <Slider label="Reach" value={o.reach} onChange={(reach) => set({ reach })} hint={['Close', 'Far']} format={pctFmt} />
            <FilterField o={o} />
            <p className="tip">Its ripples ring any chimes they pass through.</p>
          </>
        )}

        {o.kind === 'orbit' && <OrbitControls o={o} />}

        {o.kind === 'texture' && (
          <>
            <SoundPicker
              value={o.sound}
              onChange={(sound) => set({ sound })}
              options={[
                { value: 'rain', label: 'Rain' },
                { value: 'wind', label: 'Wind' },
                { value: 'waves', label: 'Waves' },
                { value: 'embers', label: 'Embers' },
              ]}
            />
            <VolumeField o={o} />
            <Slider label="Size" value={o.size} onChange={(size) => set({ size })} format={pctFmt} />
            <Slider label="Wander" value={o.drift} onChange={(drift) => set({ drift })} hint={['Still', 'Wandering']} format={pctFmt} />
            <FilterField o={o} />
            <p className="tip">Higher up sounds airier and brighter; lower is more muffled.</p>
          </>
        )}
      </div>

      <footer className="sheet-foot">
        <button className="text-button" onClick={() => app.duplicate(o.id)}>
          <CopyIcon /> Duplicate
        </button>
        <button className="text-button danger" onClick={() => app.remove(o.id)}>
          <TrashIcon /> Remove
        </button>
      </footer>
    </aside>
  )
}

function OrbitControls({ o }: { o: Orbit }) {
  const settings = useStore(app.ui, (s) => s.settings)
  const loading = useStore(app.ui, (s) => s.loadingSounds)
  const set = (patch: Partial<Orbit>) => app.update(o.id, patch)
  const h = harmonyOf(settings)
  const base = baseNote(o, h)!

  const muted = o.beads.map((_, i) => o.muted?.[i] ?? false)
  // Keep the mute flags lined up with the steps whenever steps are added or removed.
  const setBeads = (beads: number[]) => set({ beads, muted: beads.map((_, i) => muted[i] ?? false) })
  const toggleMute = (i: number) => set({ muted: muted.map((m, j) => (j === i ? !m : m)) })
  // Mostly within the base octave, with the odd step an octave up or down.
  const shuffle = () =>
    setBeads(
      o.beads.map(() => {
        const r = Math.random()
        const octave = r < 0.12 ? -1 : r > 0.85 ? 1 : 0
        return joinBead(Math.floor(Math.random() * h.scale.steps.length), octave, h)
      }),
    )

  return (
    <>
      <SoundPicker
        value={o.sound}
        onChange={(sound) => set({ sound })}
        options={soundOptions('orbit', loading)}
      />
      <div className="field">
        <div className="field-head">
          <span className="label">Pattern</span>
          <div className="mini-actions">
            <button
              className="icon-button small"
              aria-label="Remove a step"
              disabled={o.beads.length <= 2}
              onClick={() => setBeads(o.beads.slice(0, -1))}
            >
              <MinusIcon />
            </button>
            <span className="field-value">{o.beads.length} steps</span>
            <button
              className="icon-button small"
              aria-label="Add a step"
              disabled={o.beads.length >= 12}
              onClick={() => setBeads([...o.beads, o.beads[o.beads.length - 2] ?? 0])}
            >
              <PlusIcon />
            </button>
            <button className="icon-button small" aria-label="Shuffle the pattern" onClick={shuffle}>
              <ShuffleIcon />
            </button>
          </div>
        </div>
        <div className="steps" role="group" aria-label="Pattern steps">
          <div className="step-head" aria-hidden>
            <span />
            <span>Note in scale</span>
            <span />
            <span>Octave</span>
          </div>
          {o.beads.map((step, i) => {
            const { degree, octave } = splitBead(step, h)
            const change = (v: number) => {
              const next = [...o.beads]
              next[i] = clampBead(v, h)
              if (next[i] === o.beads[i]) return
              setBeads(next)
              app.previewStep(o.id, i)
            }
            return (
              <StepRow
                key={i}
                index={i}
                degree={degree}
                octave={octave}
                size={h.scale.steps.length}
                note={noteName(beadNote(base, step, h), h)}
                tickNote={(d) => noteName(beadNote(base, joinBead(d, octave, h), h), h)}
                muted={muted[i]}
                onToggleMute={() => toggleMute(i)}
                onDegree={(d) => change(joinBead(d, octave, h))}
                onOctave={(oc) => change(joinBead(degree, oc, h))}
              />
            )
          })}
        </div>
      </div>
      <AttackSlider value={o.attack} onChange={(attack) => set({ attack })} />
      <Slider label="Note length" value={o.length} onChange={(length) => set({ length })} hint={['Short', 'Ringing']} format={pctFmt} />
      <Segmented
        label="Direction"
        value={o.direction ?? 'forward'}
        onChange={(direction) => set({ direction })}
        options={[
          { value: 'forward', label: 'Forward' },
          { value: 'backward', label: 'Backward' },
        ]}
      />
      <Slider
        label="Offset"
        value={o.offset ?? 0}
        min={-1}
        max={1}
        onChange={(offset) => set({ offset: snapOffset(offset) })}
        hint={['Earlier', 'Later']}
        format={offsetFmt}
      />
      <Slider label="Evolve" value={o.evolve} onChange={(evolve) => set({ evolve })} hint={['Fixed', 'Restless']} format={pctFmt} />
      <VolumeField o={o} />
      <Slider label="Size" value={o.size} onChange={(size) => set({ size })} hint={['Small & quick', 'Big & slow']} format={stepFmt} />
      <FilterField o={o} />
      <p className="tip">Drag a bead on the canvas outward to raise its note, inward to lower it.</p>
    </>
  )
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : '0')

/**
 * One step of the pattern, as a row: mute, a note slider that snaps to each
 * note of the scale within one octave, and an octave stepper.
 */
function StepRow({
  index,
  degree,
  octave,
  size,
  note,
  tickNote,
  muted,
  onDegree,
  onOctave,
  onToggleMute,
}: {
  index: number
  degree: number
  octave: number
  /** Notes per octave in the current scale. */
  size: number
  note: string
  tickNote: (degree: number) => string
  muted: boolean
  onDegree: (d: number) => void
  onOctave: (o: number) => void
  onToggleMute: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = size - 1
  const setFrom = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    onDegree(Math.round(t * last))
  }
  const pos = (d: number) => `${(d / last) * 100}%`
  return (
    <div className={muted ? 'step-row muted' : 'step-row'}>
      <button
        className="step-mute"
        aria-label={`Mute step ${index + 1}`}
        aria-pressed={muted}
        title={muted ? 'Unmute step' : 'Mute step'}
        onClick={onToggleMute}
      >
        {muted ? <MutedIcon /> : <SpeakerIcon />}
      </button>
      <div
        ref={ref}
        className="note-track"
        role="slider"
        tabIndex={0}
        aria-label={`Step ${index + 1} note`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={degree}
        aria-valuetext={note}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setFrom(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(e.clientX)
        }}
        onKeyDown={(e) => {
          const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
          if (step) {
            e.preventDefault()
            onDegree(Math.min(last, Math.max(0, degree + step)))
          }
          if (e.key === 'Home') onDegree(0)
          if (e.key === 'End') onDegree(last)
        }}
      >
        <span className="note-line" />
        <span className="note-fill" style={{ width: pos(degree) }} />
        {Array.from({ length: size }, (_, d) => (
          <span
            key={d}
            className={d === 0 ? 'note-tick root' : d <= degree ? 'note-tick passed' : 'note-tick'}
            style={{ left: pos(d) }}
            title={tickNote(d)}
          />
        ))}
        <span className="note-thumb" style={{ left: pos(degree) }} />
      </div>
      <span className="step-note">{note}</span>
      <div className="octave" role="group" aria-label={`Step ${index + 1} octave`}>
        <button
          aria-label={`Step ${index + 1} octave down`}
          disabled={octave <= OCTAVE_MIN}
          onClick={() => onOctave(octave - 1)}
        >
          <MinusIcon />
        </button>
        <span className={octave === 0 ? 'octave-value' : 'octave-value shifted'} aria-live="polite">
          {signed(octave)}
        </span>
        <button
          aria-label={`Step ${index + 1} octave up`}
          disabled={octave >= OCTAVE_MAX}
          onClick={() => onOctave(octave + 1)}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}
