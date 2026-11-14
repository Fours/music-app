import { app } from '../app/controller'
import { CURVE_RANGE, OPEN_FILTER, cutoffFmt, cutoffHz, isOpen, responseDb } from '../world/filter'
import type { FilterSettings, WorldObject } from '../world/types'
import { Slider } from './controls'

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * An object's low-pass filter: a drawing of its curve, then Cutoff (where the
 * highs start to fall away) and Resonance (how sharply it peaks there).
 */
export function FilterField({ o }: { o: WorldObject }) {
  const f = o.filter ?? OPEN_FILTER
  const set = (patch: Partial<FilterSettings>) => app.update(o.id, { filter: { ...f, ...patch } })

  return (
    <div className="field filter-group">
      <div className="field-head">
        <span className="label">Filter</span>
        <div className="mini-actions">
          <span className="field-value">Low-pass</span>
          {!isOpen(f) && (
            <button className="text-button small" onClick={() => set(OPEN_FILTER)}>
              Reset
            </button>
          )}
        </div>
      </div>
      <FilterCurve f={f} />
      <Slider label="Cutoff" value={f.cutoff} onChange={(cutoff) => set({ cutoff })} format={cutoffFmt} hint={['Dark', 'Bright']} step={0.005} />
      <Slider label="Resonance" value={f.resonance} onChange={(resonance) => set({ resonance })} format={pct} hint={['Smooth', 'Peaky']} />
    </div>
  )
}

const W = 240
const H = 52
const TOP_DB = 18
const BOTTOM_DB = -30
const [LO, HI] = CURVE_RANGE

const xOf = (hz: number) => (Math.log(hz / LO) / Math.log(HI / LO)) * W
const yOf = (db: number) => ((TOP_DB - Math.max(BOTTOM_DB, Math.min(TOP_DB, db))) / (TOP_DB - BOTTOM_DB)) * H

/** The filter's frequency response on a log scale, with a dot at the cutoff. */
function FilterCurve({ f }: { f: FilterSettings }) {
  const points: string[] = []
  for (let i = 0; i <= 96; i++) {
    const hz = LO * (HI / LO) ** (i / 96)
    points.push(`${xOf(hz).toFixed(1)},${yOf(responseDb(f, hz)).toFixed(1)}`)
  }
  const line = `M${points.join('L')}`
  const fc = cutoffHz(f.cutoff)
  // The dot is HTML rather than SVG so it stays round while the drawing stretches to the panel's width.
  return (
    <div className="filter-curve" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line className="filter-zero" x1={0} x2={W} y1={yOf(0)} y2={yOf(0)} vectorEffect="non-scaling-stroke" />
        <path className="filter-area" d={`${line}L${W},${H}L0,${H}Z`} />
        <path className="filter-line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      {fc < HI * 0.98 && (
        <span
          className="filter-knee"
          style={{ left: `${(xOf(fc) / W) * 100}%`, top: `${(yOf(responseDb(f, fc)) / H) * 100}%` }}
        />
      )}
    </div>
  )
}
