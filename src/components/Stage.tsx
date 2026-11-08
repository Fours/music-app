import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'
import { app } from '../app/controller'
import { BEAD_MAX, BEAD_MIN, HANDLE_ANGLE, hitRadius, radius, selectionRadius, sizeForRadius } from '../world/geometry'
import { beadPositions, draw } from '../world/render'
import type { Orbit, WorldObject } from '../world/types'

type Gesture =
  | { mode: 'move'; id: string; dx: number; dy: number; samples: { x: number; y: number; t: number }[] }
  | { mode: 'resize'; id: string; startDist: number; startRadius: number }
  | { mode: 'pinch'; id: string; startDist: number; startRadius: number }
  | { mode: 'bead'; id: string; bead: number; startStep: number; startDist: number }
  | { mode: 'none' }

/** Full-bleed canvas: draws the world and turns pointers into edits. */
export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heldRef = useRef<string | null>(null)

  // ------------------------------------------------------ draw loop
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let last = performance.now()
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      app.world.width = rect.width
      app.world.height = rect.height
    }
    // Keep chimes bouncing above the tray rather than hiding behind it.
    const measureTray = () => {
      const tray = document.querySelector('.tray')
      const rect = canvas.getBoundingClientRect()
      app.world.floor = tray ? Math.min(rect.height, tray.getBoundingClientRect().top - rect.top - 6) : rect.height
    }
    let frames = 0
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const loop = (ms: number) => {
      const dt = (ms - last) / 1000
      last = ms
      if (frames++ % 30 === 0) measureTray()
      app.frame(dt)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const s = app.ui.get()
      draw(ctx, app.world, {
        now: app.now(),
        t: ms / 1000,
        selectedId: s.selectedId,
        heldId: heldRef.current,
        settings: s.settings,
        level: s.playing ? engine.level() : 0,
      })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // ------------------------------------------------------ gestures
  useEffect(() => {
    const canvas = canvasRef.current!
    const pointers = new Map<number, { x: number; y: number }>()
    let gesture: Gesture = { mode: 'none' }
    let changed = false

    const local = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const world = app.world
    const center = (o: WorldObject) => ({ x: o.x * world.width, y: o.y * world.height })

    const hold = (id: string | null) => {
      if (heldRef.current) world.held.delete(heldRef.current)
      heldRef.current = id
      if (id) world.held.add(id)
    }

    /** Topmost object under a point: small things win over big soft ones. */
    const pick = (p: { x: number; y: number }): WorldObject | undefined => {
      const order: WorldObject['kind'][] = ['chime', 'pulse', 'orbit', 'drone', 'texture']
      let best: { o: WorldObject; score: number } | undefined
      for (const o of world.objects) {
        const c = center(o)
        const d = Math.hypot(p.x - c.x, p.y - c.y)
        const hr = hitRadius(o, world.unit)
        if (d > hr) continue
        const score = order.indexOf(o.kind) * 10 + d / hr
        if (!best || score < best.score) best = { o, score }
      }
      return best?.o
    }

    const down = (e: PointerEvent) => {
      if (app.ui.get().phase === 'welcome') return
      canvas.setPointerCapture(e.pointerId)
      const p = local(e)
      pointers.set(e.pointerId, p)

      // A second finger turns a drag into a pinch on the same object.
      if (pointers.size === 2 && gesture.mode === 'move') {
        const o = app.find(gesture.id)
        const [a, b] = [...pointers.values()]
        if (o) {
          gesture = {
            mode: 'pinch',
            id: o.id,
            startDist: Math.hypot(a.x - b.x, a.y - b.y),
            startRadius: radius(o, world.unit),
          }
        }
        return
      }
      if (pointers.size > 1) return

      const sel = app.find(app.ui.get().selectedId)
      if (sel) {
        const c = center(sel)
        const sr = selectionRadius(sel, world.unit)
        const hx = c.x + Math.cos(HANDLE_ANGLE) * sr
        const hy = c.y + Math.sin(HANDLE_ANGLE) * sr
        if (Math.hypot(p.x - hx, p.y - hy) < 16) {
          gesture = {
            mode: 'resize',
            id: sel.id,
            startDist: Math.hypot(p.x - c.x, p.y - c.y),
            startRadius: radius(sel, world.unit),
          }
          hold(sel.id)
          return
        }
        if (sel.kind === 'orbit') {
          const beads = beadPositions(world, sel)
          const i = beads.findIndex((b) => Math.hypot(p.x - b.x, p.y - b.y) < 14)
          if (i >= 0) {
            gesture = {
              mode: 'bead',
              id: sel.id,
              bead: i,
              startStep: sel.beads[i],
              startDist: Math.hypot(p.x - c.x, p.y - c.y),
            }
            return
          }
        }
      }

      const o = pick(p)
      if (!o) {
        app.select(null)
        gesture = { mode: 'none' }
        return
      }
      app.select(o.id)
      const c = center(o)
      gesture = { mode: 'move', id: o.id, dx: c.x - p.x, dy: c.y - p.y, samples: [{ ...p, t: e.timeStamp }] }
      hold(o.id)
    }

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) {
        canvas.style.cursor = pick(local(e)) ? 'grab' : 'default'
        return
      }
      const p = local(e)
      pointers.set(e.pointerId, p)
      const o = 'id' in gesture ? app.find(gesture.id) : undefined
      if (!o) return
      changed = true
      switch (gesture.mode) {
        case 'move': {
          o.x = Math.min(1, Math.max(0, (p.x + gesture.dx) / world.width))
          o.y = Math.min(1, Math.max(0, (p.y + gesture.dy) / world.height))
          gesture.samples.push({ ...p, t: e.timeStamp })
          if (gesture.samples.length > 6) gesture.samples.shift()
          canvas.style.cursor = 'grabbing'
          break
        }
        case 'resize': {
          const c = center(o)
          const d = Math.hypot(p.x - c.x, p.y - c.y)
          o.size = sizeForRadius(o.kind, gesture.startRadius * (d / Math.max(1, gesture.startDist)), world.unit)
          break
        }
        case 'pinch': {
          const [a, b] = [...pointers.values()]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          o.size = sizeForRadius(o.kind, gesture.startRadius * (d / Math.max(1, gesture.startDist)), world.unit)
          break
        }
        case 'bead': {
          const orbit = o as Orbit
          const c = center(o)
          const d = Math.hypot(p.x - c.x, p.y - c.y)
          const per = radius(o, world.unit) * 0.075
          const step = Math.round(gesture.startStep + (d - gesture.startDist) / per)
          const clamped = Math.min(BEAD_MAX, Math.max(BEAD_MIN, step))
          if (clamped !== orbit.beads[gesture.bead]) {
            orbit.beads[gesture.bead] = clamped
            app.bump()
          }
          break
        }
      }
    }

    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      if (gesture.mode === 'pinch') {
        // Keep dragging with the remaining finger.
        const o = app.find(gesture.id)
        const rest = [...pointers.values()][0]
        if (o && rest) {
          const c = center(o)
          gesture = { mode: 'move', id: o.id, dx: c.x - rest.x, dy: c.y - rest.y, samples: [] }
          app.edited()
          return
        }
      }
      if (pointers.size > 0) return
      if (gesture.mode === 'move') {
        const o = app.find(gesture.id)
        // Flick: a chime leaves in the direction it was thrown.
        if (o?.kind === 'chime' && gesture.samples.length > 1) {
          const a = gesture.samples[0]
          const b = gesture.samples[gesture.samples.length - 1]
          const dt = (b.t - a.t) / 1000
          const v = dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / dt : 0
          if (v > 120 && e.timeStamp - b.t < 80) {
            o.heading = Math.atan2(b.y - a.y, b.x - a.x)
            o.speed = Math.min(1, Math.max(o.speed, (v / world.unit - 0.015) / 0.15 / 3))
          }
        }
      }
      if (gesture.mode !== 'none' && changed) app.edited()
      changed = false
      gesture = { mode: 'none' }
      hold(null)
    }

    const wheel = (e: WheelEvent) => {
      const o = app.find(app.ui.get().selectedId) ?? pick(local(e))
      if (!o) return
      e.preventDefault()
      const r = radius(o, world.unit) * Math.exp(-e.deltaY * 0.0015)
      o.size = sizeForRadius(o.kind, r, world.unit)
      app.select(o.id)
      app.bump()
    }

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
    }
  }, [])

  return <canvas ref={canvasRef} className="stage" aria-label="Music canvas" />
}
