import { useEffect, useRef } from 'react'
import { app } from '../app/controller'
import {
  baseOf,
  defaultOscillation,
  oscillationOf,
  periodFmt,
  periodToPos,
  posToPeriod,
  span,
  withOscillation,
  type OscParam,
} from '../world/oscillate'
import type { Oscillation, WorldObject } from '../world/types'
import { Slider } from './controls'
import { WaveIcon } from './icons'

/**
 * A slider that can oscillate on its own. The wave button swaps its thumb for
 * two draggable ends (the low and high points of the sweep) and adds a Cycle
 * slider for how long one sweep takes.
 */
export function OscillatingSlider({
  o,
  param,
  label,
  onChange,
  format,
  hint,
  step,
}: {
  o: WorldObject
  param: OscParam
  label: string
  /** Sets the slider's own value, used while it isn't oscillating. */
  onChange: (v: number) => void
  format: (v: number) => string
  hint?: [string, string]
  step?: number
}) {
  const osc = oscillationOf(o, param)
  const on = !!osc?.on
  const setOsc = (patch: Partial<Oscillation>) =>
    app.update(o.id, withOscillation(o, param, { ...(osc ?? defaultOscillation(baseOf(o, param))), ...patch }))

  const toggle = (
    <button
      className={on ? 'icon-button small toggle on' : 'icon-button small toggle'}
      aria-label={`Oscillate ${label.toLowerCase()}`}
      aria-pressed={on}
      title={on ? 'Stop oscillating' : 'Oscillate between two values'}
      onClick={() => setOsc({ on: !on })}
    >
      <WaveIcon />
    </button>
  )

  if (!osc || !on) {
    return (
      <Slider
        label={label}
        value={baseOf(o, param)}
        onChange={onChange}
        format={format}
        hint={hint}
        step={step}
        action={toggle}
      />
    )
  }

  const [lo, hi] = span(osc)
  return (
    <>
      <div className="field">
        <div className="field-head">
          <span className="label">{label}</span>
          <div className="mini-actions">
            <span className="field-value">
              {format(lo)} – {format(hi)}
            </span>
            {toggle}
          </div>
        </div>
        <RangeTrack o={o} param={param} label={label} format={format} ends={osc.ends} onChange={(ends) => setOsc({ ends })} />
        {hint && (
          <div className="field-hint">
            <span>{hint[0]}</span>
            <span>{hint[1]}</span>
          </div>
        )}
      </div>
      <Slider
        label="Cycle"
        value={periodToPos(osc.period)}
        onChange={(p) => setOsc({ period: posToPeriod(p) })}
        format={(p) => periodFmt(posToPeriod(p))}
        step={0.005}
        hint={['Quick', 'Slow']}
      />
    </>
  )
}

/**
 * A track with two draggable ends. They can pass each other freely; the sweep
 * always runs between whichever is lower and whichever is higher. A dot rides
 * along the line showing the value right now.
 */
function RangeTrack({
  o,
  param,
  label,
  format,
  ends,
  onChange,
}: {
  o: WorldObject
  param: OscParam
  label: string
  format: (v: number) => string
  ends: [number, number]
  onChange: (ends: [number, number]) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLSpanElement>(null)
  const grab = useRef<0 | 1>(0)
  const id = o.id

  // Moves the dot directly rather than re-rendering the whole field every frame.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const current = app.find(id)
      if (current && dot.current) dot.current.style.left = `${app.world.live(current, param) * 100}%`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id, param])

  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100) / 100
  }
  const move = (i: 0 | 1, v: number) => {
    if (v === ends[i]) return
    const next: [number, number] = [...ends]
    next[i] = v
    onChange(next)
  }

  const [lo, hi] = ends[0] <= ends[1] ? ends : [ends[1], ends[0]]

  return (
    <div
      ref={ref}
      className="range-track"
      onPointerDown={(e) => {
        const v = at(e.clientX)
        // Take the nearer end (they're interchangeable when they sit together).
        grab.current = Math.abs(v - ends[0]) <= Math.abs(v - ends[1]) ? 0 : 1
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.querySelectorAll<HTMLElement>('.range-thumb')[grab.current]?.focus()
        move(grab.current, v)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) move(grab.current, at(e.clientX))
      }}
    >
      <span className="range-line" />
      <span className="range-fill" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
      <span ref={dot} className="range-now" />
      {ends.map((v, i) => (
        <span
          key={i}
          className="range-thumb"
          role="slider"
          tabIndex={0}
          aria-label={`${label} ${v <= ends[1 - i] ? 'low' : 'high'} end`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(v * 100)}
          aria-valuetext={format(v)}
          style={{ left: `${v * 100}%` }}
          onKeyDown={(e) => {
            const step = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01 }[e.key]
            const big = e.shiftKey ? 10 : 1
            if (step) {
              e.preventDefault()
              move(i as 0 | 1, Math.round(Math.min(1, Math.max(0, v + step * big)) * 100) / 100)
            }
            if (e.key === 'Home') move(i as 0 | 1, 0)
            if (e.key === 'End') move(i as 0 | 1, 1)
          }}
        />
      ))}
    </div>
  )
}
