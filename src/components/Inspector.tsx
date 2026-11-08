import { useRef } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'
import { noteName } from '../music/theory'
import { BEAD_MAX, BEAD_MIN } from '../world/geometry'
import { KIND_LABELS } from '../world/objects'
import { KIND_COLORS, TEXTURE_COLORS } from '../world/palette'
import { baseNote, beadNote, harmonyOf } from '../world/pitch'
import type { Orbit, WorldObject } from '../world/types'
import { Segmented, Slider } from './controls'
import { CloseIcon, CopyIcon, MinusIcon, PlusIcon, ShuffleIcon, TrashIcon } from './icons'

const pctFmt = (v: number) => `${Math.round(v * 100)}%`

/** Panel for the selected object: a few big, friendly controls. */
export function Inspector() {
  const selectedId = useStore(app.ui, (s) => s.selectedId)
  useStore(app.ui, (s) => s.version) // re-read the object when it changes
  const settings = useStore(app.ui, (s) => s.settings)
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
                <span className="note">{noteName(note)}</span>
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
            <Segmented
              label="Sound"
              value={o.timbre}
              onChange={(timbre) => set({ timbre })}
              options={[
                { value: 'warm', label: 'Warm' },
                { value: 'glass', label: 'Glass' },
                { value: 'reed', label: 'Reed' },
                { value: 'choir', label: 'Choir' },
              ]}
            />
            <Slider label="Volume" value={o.volume} onChange={(volume) => set({ volume })} format={pctFmt} />
            <Slider label="Size" value={o.size} onChange={(size) => set({ size })} format={pctFmt} />
            <Slider label="Drift" value={o.drift} onChange={(drift) => set({ drift })} hint={['Still', 'Wandering']} format={pctFmt} />
            <p className="tip">Drag it higher or lower to change its note. Further right sounds brighter.</p>
          </>
        )}

        {o.kind === 'chime' && (
          <>
            <Segmented
              label="Sound"
              value={o.sound}
              onChange={(sound) => set({ sound })}
              options={[
                { value: 'bell', label: 'Bell' },
                { value: 'piano', label: 'Felt piano' },
                { value: 'glass', label: 'Glass' },
              ]}
            />
            <Slider label="Volume" value={o.volume} onChange={(volume) => set({ volume })} format={pctFmt} />
            <Slider label="Speed" value={o.speed} onChange={(speed) => set({ speed })} hint={['Drifting', 'Darting']} format={pctFmt} />
            <Slider label="Size" value={o.size} onChange={(size) => set({ size })} format={pctFmt} />
            <p className="tip">Flick it to send it flying. Higher on the canvas rings higher notes.</p>
          </>
        )}

        {o.kind === 'pulse' && (
          <>
            <Segmented
              label="Sound"
              value={o.sound}
              onChange={(sound) => set({ sound })}
              options={[
                { value: 'mallet', label: 'Mallet' },
                { value: 'soft', label: 'Soft' },
                { value: 'piano', label: 'Felt piano' },
              ]}
            />
            <Slider label="Volume" value={o.volume} onChange={(volume) => set({ volume })} format={pctFmt} />
            <Slider label="Rate" value={o.rate} onChange={(rate) => set({ rate })} hint={['Seldom', 'Often']} format={pctFmt} />
            <Slider label="Reach" value={o.reach} onChange={(reach) => set({ reach })} hint={['Close', 'Far']} format={pctFmt} />
            <p className="tip">Its ripples ring any chimes they pass through.</p>
          </>
        )}

        {o.kind === 'orbit' && <OrbitControls o={o} />}

        {o.kind === 'texture' && (
          <>
            <Segmented
              label="Sound"
              value={o.sound}
              onChange={(sound) => set({ sound })}
              options={[
                { value: 'rain', label: 'Rain' },
                { value: 'wind', label: 'Wind' },
                { value: 'waves', label: 'Waves' },
                { value: 'embers', label: 'Embers' },
              ]}
            />
            <Slider label="Volume" value={o.volume} onChange={(volume) => set({ volume })} format={pctFmt} />
            <Slider label="Size" value={o.size} onChange={(size) => set({ size })} format={pctFmt} />
            <Slider label="Drift" value={o.drift} onChange={(drift) => set({ drift })} hint={['Still', 'Wandering']} format={pctFmt} />
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
  const set = (patch: Partial<Orbit>) => app.update(o.id, patch)
  const h = harmonyOf(settings)
  const base = baseNote(o, h)!

  const setBeads = (beads: number[]) => set({ beads })
  const shuffle = () =>
    setBeads(o.beads.map(() => Math.floor(Math.random() * 7) - (Math.random() < 0.2 ? 2 : 0)))

  return (
    <>
      <Segmented
        label="Sound"
        value={o.sound}
        onChange={(sound) => set({ sound })}
        options={[
          { value: 'pluck', label: 'Pluck' },
          { value: 'musicbox', label: 'Music box' },
          { value: 'marimba', label: 'Marimba' },
        ]}
      />
      <Segmented
        label="Order"
        value={o.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'loop', label: 'Loop' },
          { value: 'bounce', label: 'Bounce' },
          { value: 'wander', label: 'Wander' },
        ]}
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
        <div className="beads">
          {o.beads.map((step, i) => (
            <BeadColumn
              key={i}
              value={step}
              note={noteName(beadNote(base, step, h))}
              onChange={(v) => {
                const next = [...o.beads]
                next[i] = v
                setBeads(next)
              }}
            />
          ))}
        </div>
      </div>
      <Slider label="Note length" value={o.length} onChange={(length) => set({ length })} hint={['Short', 'Ringing']} format={pctFmt} />
      <Slider label="Evolve" value={o.evolve} onChange={(evolve) => set({ evolve })} hint={['Fixed', 'Restless']} format={pctFmt} />
      <Slider label="Volume" value={o.volume} onChange={(volume) => set({ volume })} format={pctFmt} />
      <Slider label="Size" value={o.size} onChange={(size) => set({ size })} hint={['Small & quick', 'Big & slow']} format={pctFmt} />
      <p className="tip">Drag a bead on the canvas outward to raise its note, inward to lower it.</p>
    </>
  )
}

const RANGE = BEAD_MAX - BEAD_MIN

/** One step of the pattern: drag up or down to change its note. */
function BeadColumn({ value, note, onChange }: { value: number; note: string; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const setFrom = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const t = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    const v = Math.round(BEAD_MIN + t * RANGE)
    if (v !== value) onChange(v)
  }
  const pos = (value - BEAD_MIN) / RANGE
  return (
    <div className="bead-col">
      <div
        ref={ref}
        className="bead-track"
        role="slider"
        tabIndex={0}
        aria-label="Step note"
        aria-valuemin={BEAD_MIN}
        aria-valuemax={BEAD_MAX}
        aria-valuenow={value}
        aria-valuetext={note}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setFrom(e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFrom(e.clientY)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onChange(Math.min(BEAD_MAX, value + 1))
          if (e.key === 'ArrowDown') onChange(Math.max(BEAD_MIN, value - 1))
        }}
      >
        <span className="bead-stem" style={{ height: `${pos * 100}%` }} />
        <span className="bead-dot" style={{ bottom: `calc(${pos * 100}% - 6px)` }} />
      </div>
      <span className="bead-note">{note}</span>
    </div>
  )
}
