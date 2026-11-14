import { useId, type CSSProperties, type ReactNode } from 'react'

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
  options: { value: T; label: string }[]
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
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
