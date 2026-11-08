import { useRef, useState } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'
import { KIND_LABELS } from '../world/objects'
import type { Kind } from '../world/types'
import { KindIcon } from './icons'
import { toCanvas } from './stage-coords'

const KINDS: Kind[] = ['drone', 'chime', 'pulse', 'orbit', 'texture']

/** Drag a shape onto the canvas, or tap to drop one somewhere pleasant. */
export function Tray() {
  const [ghost, setGhost] = useState<{ kind: Kind; x: number; y: number } | null>(null)
  const drag = useRef<{ kind: Kind; x: number; y: number; moved: boolean } | null>(null)
  const count = useStore(app.ui, (s) => s.objectCount)

  return (
    <>
      {count === 0 && (
        <p className="empty-hint">
          An empty sky. <strong>Drag a shape up</strong> from below to begin.
        </p>
      )}
      <nav className="tray" aria-label="Add to the canvas">
        {KINDS.map((kind) => (
          <button
            key={kind}
            className="tray-item"
            title={KIND_LABELS[kind].blurb}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { kind, x: e.clientX, y: e.clientY, moved: false }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) d.moved = true
              if (d.moved) setGhost({ kind, x: e.clientX, y: e.clientY })
            }}
            onPointerUp={(e) => {
              const d = drag.current
              drag.current = null
              setGhost(null)
              if (!d) return
              if (!d.moved) {
                app.add(kind)
                return
              }
              const p = toCanvas(e.clientX, e.clientY)
              const tray = e.currentTarget.closest('.tray')!.getBoundingClientRect()
              const overTray = e.clientY > tray.top - 4
              if (p && !overTray) app.add(kind, p.x, p.y)
            }}
            onPointerCancel={() => {
              drag.current = null
              setGhost(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                app.add(kind)
              }
            }}
          >
            <KindIcon kind={kind} />
            <span>{KIND_LABELS[kind].name}</span>
          </button>
        ))}
      </nav>
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <KindIcon kind={ghost.kind} size={56} />
        </div>
      )}
    </>
  )
}
