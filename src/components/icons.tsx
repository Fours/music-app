import { useId, type SVGProps } from 'react'
import { KIND_COLORS } from '../world/palette'
import type { Kind } from '../world/types'

type P = SVGProps<SVGSVGElement>

const base = (p: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
})

export const PlayIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
  </svg>
)
/** A landscape frame with a play mark, for recording video clips. */
export const ClipIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="3" />
    <path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" />
  </svg>
)
export const PauseIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5.5" width="3.5" height="13" rx="1" fill="currentColor" stroke="none" />
  </svg>
)
export const SlidersIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
)
export const ScenesIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="11" height="14" rx="2.5" />
    <path d="M17.5 7.5v9M20.5 9.5v5" />
  </svg>
)
export const CloseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const TrashIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </svg>
)
export const CopyIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="11" height="11" rx="2.5" />
    <path d="M5 15V7a2 2 0 0 1 2-2h8" />
  </svg>
)
export const ShuffleIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.7-1.4 3.8-3.2M13.2 10.2C14.3 8.4 15.5 7 17 7h3M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5" />
  </svg>
)
export const MinusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 12h12" />
  </svg>
)
export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 6v12M6 12h12" />
  </svg>
)
export const SpeakerIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
)
export const MutedIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
)

/** Small drawings of each object, matching how they look on the canvas. */
export function KindIcon({ kind, size = 36 }: { kind: Kind; size?: number }) {
  const id = useId()
  const c = KIND_COLORS[kind]
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor={c} stopOpacity="0.75" />
          <stop offset="0.5" stopColor={c} stopOpacity="0.35" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
      </defs>
      {kind === 'drone' && (
        <>
          <circle cx="20" cy="20" r="18" fill={`url(#${id}g)`} />
          <circle cx="20" cy="20" r="9" stroke="#2a2d38" strokeOpacity="0.3" fill="none" />
          <circle cx="20" cy="20" r="1.6" fill="#2a2d38" fillOpacity="0.6" />
        </>
      )}
      {kind === 'chime' && (
        <>
          <path d="M5 31 Q 12 24 17 22" stroke={c} strokeOpacity="0.45" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <circle cx="22" cy="19" r="9" stroke={c} strokeOpacity="0.45" fill="none" />
          <circle cx="22" cy="19" r="4.6" fill={c} />
        </>
      )}
      {kind === 'pulse' && (
        <>
          <circle cx="20" cy="20" r="17" stroke={c} strokeOpacity="0.25" fill="none" />
          <circle cx="20" cy="20" r="11.5" stroke={c} strokeOpacity="0.5" fill="none" />
          <path d="M20 13.5 A 6.5 6.5 0 1 1 13.5 20" stroke={c} strokeWidth="1.6" fill="none" />
          <circle cx="20" cy="20" r="3.6" fill={c} />
        </>
      )}
      {kind === 'orbit' && (
        <>
          <circle cx="20" cy="21" r="12" stroke={c} strokeOpacity="0.6" fill="none" />
          <path d="M20 4.5 V 8" stroke="#2a2d38" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="round" />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
            const r = 12 + [0, 3, 1.5, 4, 2][i]
            return <circle key={i} cx={20 + Math.cos(a) * r} cy={21 + Math.sin(a) * r} r="2.4" fill={c} />
          })}
        </>
      )}
      {kind === 'texture' && (
        <>
          <circle cx="20" cy="20" r="18" fill={`url(#${id}g)`} />
          {[
            [12, 11],
            [21, 8],
            [28, 14],
            [16, 19],
            [25, 22],
            [12, 27],
            [21, 29],
          ].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} l-1 5`} stroke={c} strokeWidth="1.4" strokeLinecap="round" />
          ))}
        </>
      )}
    </svg>
  )
}
