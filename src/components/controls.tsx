import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { RecordedIcon } from './icons'

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
  hint,
  action,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  hint?: [string, string]
  /** A small control beside the value, such as a toggle. */
  action?: ReactNode
}) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        {action ? (
          <div className="mini-actions">
            <span className="field-value">{format ? format(value) : `${Math.round(pct)}`}</span>
            {action}
          </div>
        ) : (
          <span className="field-value">{format ? format(value) : `${Math.round(pct)}`}</span>
        )}
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <div className="field-hint">
          <span>{hint[0]}</span>
          <span>{hint[1]}</span>
        </div>
      )}
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  /** `busy`: the choice is still loading (a sampled instrument's notes). */
  options: { value: T; label: string; busy?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="label">{label}</span>
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            aria-busy={o.busy || undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {o.busy && <span className="loading-dot" aria-hidden />}
          </button>
        ))}
      </div>
    </div>
  )
}

export interface SoundOption {
  value: string
  label: string
  /** A recorded (sampled) instrument rather than a synthesized sound. */
  sampled?: boolean
  /** Its notes are still loading. */
  busy?: boolean
}

/**
 * Columns for `n` choices, so the rows come out even: 3 → 3, 4 → 4, 5 and 6 →
 * rows of 3, 7 and 8 → rows of 4. At most 4, so a chip is at least about 72 px
 * wide in the 340 px panel, and names wrap to a second line rather than being cut.
 */
const pickerColumns = (n: number) => Math.ceil(n / Math.ceil(n / 4))

/**
 * The Sound field: a grid of chips in the segmented control's style, for 5 to
 * 8 choices (milestone 3, T4). A radio group: Tab lands on the chosen chip,
 * the arrows move and choose (Up and Down by a row), Home and End go to the
 * ends. Recorded instruments carry a small mark, which a pulsing dot replaces
 * while their notes load.
 */
export function SoundPicker<T extends string>({
  label = 'Sound',
  value,
  options,
  onChange,
}: {
  label?: string
  value: T
  options: (SoundOption & { value: T })[]
  onChange: (v: T) => void
}) {
  const chips = useRef<(HTMLButtonElement | null)[]>([])
  const columns = pickerColumns(options.length)
  const current = options.findIndex((o) => o.value === value)
  const choose = (i: number) => {
    onChange(options[i].value)
    chips.current[i]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const n = options.length
    const at = Math.max(0, current)
    let to: number | undefined
    if (e.key === 'ArrowRight') to = (at + 1) % n
    else if (e.key === 'ArrowLeft') to = (at - 1 + n) % n
    else if (e.key === 'ArrowDown') to = at + columns < n ? at + columns : at
    else if (e.key === 'ArrowUp') to = at - columns >= 0 ? at - columns : at
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = n - 1
    if (to === undefined) return
    e.preventDefault()
    if (to !== at || current < 0) choose(to)
  }
  return (
    <div className="field">
      <div className="field-head">
        <span className="label">{label}</span>
      </div>
      <div
        className="sound-picker"
        role="radiogroup"
        aria-label={label}
        style={{ '--columns': columns } as CSSProperties}
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => (
          <button
            key={o.value}
            ref={(el) => {
              chips.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={i === current}
            aria-busy={o.busy || undefined}
            aria-label={o.sampled ? `${o.label}, recorded` : o.label}
            tabIndex={i === Math.max(0, current) ? 0 : -1}
            className={i === current ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            <SoundName label={o.label} mark={o.busy ? <span className="loading-dot" aria-hidden /> : o.sampled && <RecordedIcon className="sound-mark" />} />
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A chip's name with its mark after the last word, kept together so the mark
 * never wraps onto a line of its own, covers the name, or takes a column.
 */
function SoundName({ label, mark }: { label: string; mark: ReactNode }) {
  if (!mark) return <span className="sound-name">{label}</span>
  const cut = label.lastIndexOf(' ') + 1
  return (
    <span className="sound-name">
      {label.slice(0, cut)}
      <span className="sound-last">
        {label.slice(cut)}
        {mark}
      </span>
    </span>
  )
}
