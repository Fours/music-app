import { useEffect, useRef } from 'react'
import { app } from '../app/controller'
import { defaultOscillation, periodFmt, periodToPos, posToPeriod, span } from '../world/oscillate'
import type { Oscillation, WorldObject } from '../world/types'
import { Slider } from './controls'
import { WaveIcon } from './icons'

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * An object's volume. The wave button switches it to oscillating, where the
 * track gets two ends to drag (the quietest and loudest points of the sweep)
 * and a Cycle slider sets how long one sweep takes.
 */
export function VolumeField({ o }: { o: WorldObject }) {
  const osc = o.oscillate
  const on = !!osc?.on
  const setOsc = (patch: Partial<Oscillation>) =>
    app.update(o.id, { oscillate: { ...(osc ?? defaultOscillation(o.volume)), ...patch } })

  const toggle = (
    <button
      className={on ? 'icon-button small toggle on' : 'icon-button small toggle'}
      aria-label="Oscillate volume"
      aria-pressed={on}
      title={on ? 'Stop oscillating' : 'Oscillate between two volumes'}
      onClick={() => setOsc({ on: !on })}
    >
      <WaveIcon />
    </button>
  )

  if (!osc || !on) {
    return (
      <Slider
        label="Volume"
        value={o.volume}
        onChange={(volume) => app.update(o.id, { volume })}
        format={pct}
        action={toggle}
      />
    )
  }

  const [lo, hi] = span(osc)
  return (
    <>
      <div className="field">
        <div className="field-head">
          <span className="label">Volume</span>
          <div className="mini-actions">
            <span className="field-value">
              {pct(lo)} – {pct(hi)}
            </span>
            {toggle}
          </div>
        </div>
        <RangeTrack id={o.id} ends={osc.ends} onChange={(ends) => setOsc({ ends })} />
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
 * A volume track with two draggable ends. They can pass each other freely;
 * the sweep always runs between whichever is lower and whichever is higher.
 * A dot rides along the line showing the volume right now.
 */
function RangeTrack({
  id,
  ends,
  onChange,
}: {
  id: string
  ends: [number, number]
  onChange: (ends: [number, number]) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLSpanElement>(null)
  const grab = useRef<0 | 1>(0)

  useEffect(() => {
    let raf = 0
    const loop = () => {
      const o = app.find(id)
      if (o && dot.current) dot.current.style.left = `${app.world.level(o) * 100}%`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [id])

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
          aria-label={v <= ends[1 - i] ? 'Quietest volume' : 'Loudest volume'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(v * 100)}
          aria-valuetext={pct(v)}
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
