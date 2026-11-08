import { noteName } from '../music/theory'
import { beadRadius, HANDLE_ANGLE, radius, selectionRadius } from './geometry'
import { INK, KIND_COLORS, TEXTURE_COLORS, rgba } from './palette'
import { baseNote, beadNote, harmonyOf, pitchesFor } from './pitch'
import { beadAngle, type World } from './sim'
import type { Chime, Drone, Orbit, Pulse, Settings, Texture, WorldObject } from './types'

export interface View {
  /** Current time on the same clock the simulation stamps events with. */
  now: number
  /** Wall-clock seconds, for purely decorative motion. */
  t: number
  selectedId: string | null
  /** Object being dragged, for pitch guides and note labels. */
  heldId: string | null
  settings: Settings
  level: number
}

const TAU = Math.PI * 2

function seed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, Math.max(0, r), 0, TAU)
}

/** 0 → 1 over `len` seconds after `at`, or 1 if long past. */
function since(now: number, at: number, len: number): number {
  return Math.min(1, Math.max(0, (now - at) / len))
}

export function draw(ctx: CanvasRenderingContext2D, world: World, view: View) {
  const { width: w, height: h } = world
  const unit = world.unit

  // Paper-like base with a faint cool horizon.
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#f8f6f2')
  bg.addColorStop(0.6, '#f2f1ee')
  bg.addColorStop(1, '#e9eef1')
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Textures wash colour across the whole sky.
  ctx.globalCompositeOperation = 'multiply'
  for (const o of world.objects) {
    if (o.kind !== 'texture') continue
    const x = o.x * w
    const y = o.y * h
    const r = radius(o, unit) * 3.2
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const c = TEXTURE_COLORS[o.sound]
    g.addColorStop(0, rgba(c, 0.2 * o.volume + 0.06))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  // The whole scene glows very slightly with loudness.
  if (view.level > 0.001) {
    const g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.7)
    g.addColorStop(0, rgba('#f3e7d8', Math.min(0.5, view.level * 1.4)))
    g.addColorStop(1, rgba('#f3e7d8', 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  const held = view.heldId ? world.objects.find((o) => o.id === view.heldId) : undefined
  if (held && held.kind !== 'texture') drawPitchGuides(ctx, world, held, view.settings)

  const order: WorldObject['kind'][] = ['texture', 'drone', 'orbit', 'pulse', 'chime']
  for (const kind of order) {
    for (const o of world.objects) {
      if (o.kind !== kind) continue
      switch (o.kind) {
        case 'texture':
          drawTexture(ctx, world, o, view)
          break
        case 'drone':
          drawDrone(ctx, world, o, view)
          break
        case 'orbit':
          drawOrbit(ctx, world, o, view)
          break
        case 'pulse':
          drawPulse(ctx, world, o, view)
          break
        case 'chime':
          drawChime(ctx, world, o, view)
          break
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over'
  const selected = view.selectedId ? world.objects.find((o) => o.id === view.selectedId) : undefined
  if (selected) drawSelection(ctx, world, selected, view)
  if (held) drawNoteLabel(ctx, world, held, view.settings)
}

function drawPitchGuides(ctx: CanvasRenderingContext2D, world: World, o: WorldObject, s: Settings) {
  const pitches = pitchesFor(o.kind, harmonyOf(s))
  const n = pitches.length
  const current = baseNote(o, harmonyOf(s))
  ctx.globalCompositeOperation = 'source-over'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const y = (1 - i / (n - 1)) * world.height
    const isRoot = ((pitches[i] - s.root) % 12 + 12) % 12 === 0
    const active = pitches[i] === current
    ctx.strokeStyle = rgba(INK, active ? 0.22 : isRoot ? 0.09 : 0.045)
    ctx.beginPath()
    ctx.moveTo(0, Math.round(y) + 0.5)
    ctx.lineTo(world.width, Math.round(y) + 0.5)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'multiply'
}

function drawNoteLabel(ctx: CanvasRenderingContext2D, world: World, o: WorldObject, s: Settings) {
  const h = harmonyOf(s)
  const n = baseNote(o, h)
  if (n === null) return
  const x = o.x * world.width
  const y = o.y * world.height
  const r = selectionRadius(o, world.unit)
  const label = noteName(n, h)
  ctx.font = '500 12px "Inter Variable", system-ui, sans-serif'
  const tw = ctx.measureText(label).width
  let lx = x + r + 12
  if (lx + tw + 16 > world.width) lx = x - r - 12 - tw - 16
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.roundRect(lx, y - 11, tw + 16, 22, 11)
  ctx.fill()
  ctx.fillStyle = rgba(INK, 0.75)
  ctx.textBaseline = 'middle'
  ctx.fillText(label, lx + 8, y + 0.5)
}

function drawSelection(ctx: CanvasRenderingContext2D, world: World, o: WorldObject, view: View) {
  const x = o.x * world.width
  const y = o.y * world.height
  const r = selectionRadius(o, world.unit)
  ctx.save()
  ctx.strokeStyle = rgba(INK, 0.38)
  ctx.lineWidth = 1
  ctx.setLineDash([3, 5])
  ctx.lineDashOffset = -view.t * 6
  circle(ctx, x, y, r)
  ctx.stroke()
  ctx.restore()
  const hx = x + Math.cos(HANDLE_ANGLE) * r
  const hy = y + Math.sin(HANDLE_ANGLE) * r
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = rgba(INK, 0.55)
  ctx.lineWidth = 1.25
  circle(ctx, hx, hy, 6.5)
  ctx.fill()
  ctx.stroke()
  // Two little arrows hint "drag to resize".
  ctx.beginPath()
  ctx.moveTo(hx - 2.5, hy + 2.5)
  ctx.lineTo(hx + 2.5, hy - 2.5)
  ctx.stroke()
}

// ---------------------------------------------------------------- drone

function drawDrone(ctx: CanvasRenderingContext2D, world: World, o: Drone, view: View) {
  const rt = world.runtime(o)
  const s = seed(o.id)
  const x = o.x * world.width
  const y = o.y * world.height
  const base = radius(o, world.unit)
  const breath = 1 + 0.05 * Math.sin(view.t * 0.55 + s * TAU)
  const r = base * breath
  const color = KIND_COLORS.drone
  const bump = 1 - since(view.now, rt.flash, 1.2)
  const a = 0.32 + 0.5 * o.volume + bump * 0.15

  // Two offset lobes so drones read as soft, living shapes rather than discs.
  for (let i = 0; i < 2; i++) {
    const ang = view.t * 0.12 * (i ? -1 : 1) + s * TAU + i * 2
    const ox = Math.cos(ang) * r * 0.12
    const oy = Math.sin(ang) * r * 0.1
    const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r * (i ? 0.92 : 1))
    g.addColorStop(0, rgba(color, a * 0.6))
    g.addColorStop(0.45, rgba(color, a * 0.32))
    g.addColorStop(1, rgba(color, 0))
    ctx.fillStyle = g
    circle(ctx, x + ox, y + oy, r)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = rgba(INK, 0.16 + bump * 0.2)
  ctx.lineWidth = 1
  circle(ctx, x, y, base * 0.55 * (1 + bump * 0.06))
  ctx.stroke()
  // Fine concentric line that drifts in and out with the breath.
  ctx.strokeStyle = rgba(color, 0.35)
  circle(ctx, x, y, base * (0.7 + 0.04 * Math.sin(view.t * 0.4 + s * 9)))
  ctx.stroke()
  ctx.fillStyle = rgba(INK, 0.55)
  circle(ctx, x, y, 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'multiply'
}

// ---------------------------------------------------------------- chime

function drawChime(ctx: CanvasRenderingContext2D, world: World, o: Chime, view: View) {
  const rt = world.runtime(o)
  const x = o.x * world.width
  const y = o.y * world.height
  const r = radius(o, world.unit)
  const color = KIND_COLORS.chime

  ctx.globalCompositeOperation = 'source-over'
  if (rt.trail.length > 1) {
    for (let i = 1; i < rt.trail.length; i++) {
      const p0 = rt.trail[i - 1]
      const p1 = rt.trail[i]
      ctx.strokeStyle = rgba(color, (i / rt.trail.length) * 0.35)
      ctx.lineWidth = (i / rt.trail.length) * r * 0.6
      ctx.beginPath()
      ctx.moveTo(p0.x * world.width, p0.y * world.height)
      ctx.lineTo(p1.x * world.width, p1.y * world.height)
      ctx.stroke()
    }
  }

  // Ring-out: two thin circles spreading from the bead.
  const k = since(view.now, rt.flash, 1.6)
  if (k < 1) {
    for (let i = 0; i < 2; i++) {
      const kk = Math.max(0, k - i * 0.12)
      ctx.strokeStyle = rgba(color, (1 - kk) * 0.55 * rt.flashAmount)
      ctx.lineWidth = 1
      circle(ctx, x, y, r * (1.4 + kk * 7))
      ctx.stroke()
    }
  }

  const glow = 1 - since(view.now, rt.flash, 0.6)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
  g.addColorStop(0, rgba(color, 0.25 + glow * 0.35))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  circle(ctx, x, y, r * 3)
  ctx.fill()

  ctx.fillStyle = color
  circle(ctx, x, y, r * (1 + glow * 0.18))
  ctx.fill()
  ctx.globalCompositeOperation = 'multiply'
}

// ---------------------------------------------------------------- pulse

function drawPulse(ctx: CanvasRenderingContext2D, world: World, o: Pulse, view: View) {
  const rt = world.runtime(o)
  const x = o.x * world.width
  const y = o.y * world.height
  const r = radius(o, world.unit)
  const color = KIND_COLORS.pulse
  ctx.globalCompositeOperation = 'source-over'

  for (const rp of rt.ripples) {
    const k = rp.r / rp.max
    if (rp.r <= 0) continue
    ctx.strokeStyle = rgba(color, Math.pow(1 - k, 1.4) * 0.6 * (0.4 + o.volume * 0.6))
    ctx.lineWidth = 1.4 * (1 - k) + 0.4
    circle(ctx, x, y, rp.r + r)
    ctx.stroke()
  }

  const bump = 1 - since(view.now, rt.flash, 0.9)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6)
  g.addColorStop(0, rgba(color, 0.28 + bump * 0.3))
  g.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = g
  circle(ctx, x, y, r * 2.6)
  ctx.fill()

  // Countdown arc to the next ripple.
  ctx.strokeStyle = rgba(INK, 0.12)
  ctx.lineWidth = 1
  circle(ctx, x, y, r * 1.35)
  ctx.stroke()
  ctx.strokeStyle = rgba(color, 0.9)
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.arc(x, y, r * 1.35, -Math.PI / 2, -Math.PI / 2 + rt.phase * TAU)
  ctx.stroke()

  ctx.fillStyle = color
  circle(ctx, x, y, r * (0.62 + bump * 0.2))
  ctx.fill()
  ctx.globalCompositeOperation = 'multiply'
}

// ---------------------------------------------------------------- orbit

function drawOrbit(ctx: CanvasRenderingContext2D, world: World, o: Orbit, view: View) {
  const rt = world.runtime(o)
  const x = o.x * world.width
  const y = o.y * world.height
  const r = radius(o, world.unit)
  const color = KIND_COLORS.orbit
  const n = o.beads.length
  ctx.globalCompositeOperation = 'source-over'

  const soft = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.5)
  soft.addColorStop(0, rgba(color, 0.08))
  soft.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = soft
  circle(ctx, x, y, r * 1.5)
  ctx.fill()

  ctx.strokeStyle = rgba(color, 0.5)
  ctx.lineWidth = 1
  circle(ctx, x, y, r)
  ctx.stroke()
  ctx.strokeStyle = rgba(INK, 0.07)
  circle(ctx, x, y, r * 0.55)
  ctx.stroke()

  const pts = o.beads.map((step, i) => {
    const a = beadAngle(rt, i, n)
    const br = beadRadius(o, world.unit, step)
    return { a, br, px: x + Math.cos(a) * br, py: y + Math.sin(a) * br }
  })

  // The melody's outline, connecting beads in playing order.
  if (n > 2) {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)))
    ctx.closePath()
    ctx.fillStyle = rgba(color, 0.05)
    ctx.fill()
    ctx.strokeStyle = rgba(color, 0.22)
    ctx.stroke()
  }

  // Marker at the top: beads sound as they pass it.
  const top = y - r
  ctx.strokeStyle = rgba(INK, 0.5)
  ctx.lineWidth = 1.25
  ctx.beginPath()
  ctx.moveTo(x, top - 14)
  ctx.lineTo(x, top - 5)
  ctx.stroke()
  ctx.fillStyle = rgba(INK, 0.5)
  ctx.beginPath()
  ctx.moveTo(x - 3.5, top - 16)
  ctx.lineTo(x + 3.5, top - 16)
  ctx.lineTo(x, top - 11)
  ctx.closePath()
  ctx.fill()

  const beadR = Math.max(3.5, world.unit * 0.0075)
  pts.forEach((p, i) => {
    if (o.muted?.[i]) {
      // Muted steps: a hollow bead on a faint spoke.
      ctx.strokeStyle = rgba(color, 0.15)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(p.a) * r, y + Math.sin(p.a) * r)
      ctx.lineTo(p.px, p.py)
      ctx.stroke()
      ctx.strokeStyle = rgba(color, 0.7)
      ctx.lineWidth = 1.25
      circle(ctx, p.px, p.py, beadR - 0.6)
      ctx.stroke()
      return
    }
    const lit = 1 - since(view.now, rt.lit[i] ?? -10, 0.6)
    ctx.strokeStyle = rgba(color, 0.35)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(p.a) * r, y + Math.sin(p.a) * r)
    ctx.lineTo(p.px, p.py)
    ctx.stroke()
    if (lit > 0) {
      const g = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, beadR * 6)
      g.addColorStop(0, rgba(color, 0.5 * lit))
      g.addColorStop(1, rgba(color, 0))
      ctx.fillStyle = g
      circle(ctx, p.px, p.py, beadR * 6)
      ctx.fill()
    }
    ctx.fillStyle = color
    circle(ctx, p.px, p.py, beadR * (1 + lit * 0.6))
    ctx.fill()
  })

  ctx.fillStyle = rgba(INK, 0.45)
  circle(ctx, x, y, 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'multiply'
}

/** Where each bead of an orbit is drawn, for hit-testing. */
export function beadPositions(world: World, o: Orbit): { x: number; y: number }[] {
  const rt = world.runtime(o)
  const n = o.beads.length
  return o.beads.map((step, i) => {
    const a = beadAngle(rt, i, n)
    const br = beadRadius(o, world.unit, step)
    return { x: o.x * world.width + Math.cos(a) * br, y: o.y * world.height + Math.sin(a) * br }
  })
}

export function beadNoteName(o: Orbit, i: number, s: Settings): string {
  const h = harmonyOf(s)
  return noteName(beadNote(baseNote(o, h)!, o.beads[i], h), h)
}

// --------------------------------------------------------------- texture

function drawTexture(ctx: CanvasRenderingContext2D, world: World, o: Texture, view: View) {
  const x = o.x * world.width
  const y = o.y * world.height
  const r = radius(o, world.unit)
  const s = seed(o.id)
  const color = TEXTURE_COLORS[o.sound]
  const haze = ctx.createRadialGradient(x, y, 0, x, y, r)
  haze.addColorStop(0, rgba(color, 0.3 + o.volume * 0.3))
  haze.addColorStop(0.7, rgba(color, 0.14))
  haze.addColorStop(1, rgba(color, 0))
  ctx.fillStyle = haze
  circle(ctx, x, y, r)
  ctx.fill()

  ctx.globalCompositeOperation = 'source-over'
  const t = view.t
  const fall = (d: number) => Math.max(0, 1 - d / r)
  ctx.lineCap = 'round'

  switch (o.sound) {
    case 'rain': {
      const count = 52
      ctx.lineWidth = 1.3
      for (let i = 0; i < count; i++) {
        const hx = hash(i + s * 100)
        const speed = 0.35 + hash(i * 3.1 + s) * 0.3
        const py = (((t * speed + hash(i * 7.7)) % 1) * 2 - 1) * r
        const px = (hx * 2 - 1) * r
        const a = Math.min(1, fall(Math.hypot(px, py)) * 1.4)
        if (a <= 0) continue
        ctx.strokeStyle = rgba(color, a)
        ctx.beginPath()
        ctx.moveTo(x + px, y + py)
        ctx.lineTo(x + px - 2, y + py + 12)
        ctx.stroke()
      }
      break
    }
    case 'wind': {
      ctx.lineWidth = 1.4
      for (let i = 0; i < 14; i++) {
        const py = (hash(i + s * 50) * 2 - 1) * r * 0.7
        const speed = 0.06 + hash(i * 2.3) * 0.06
        const px = (((t * speed + hash(i * 5.1)) % 1) * 2 - 1) * r
        const len = r * (0.2 + hash(i * 9.3) * 0.25)
        const a = Math.min(1, fall(Math.hypot(px, py)) * 1.2)
        if (a <= 0) continue
        ctx.strokeStyle = rgba(color, a)
        ctx.beginPath()
        ctx.moveTo(x + px - len, y + py)
        ctx.quadraticCurveTo(x + px - len / 2, y + py - 6 * Math.sin(t + i), x + px, y + py)
        ctx.stroke()
      }
      break
    }
    case 'waves': {
      ctx.lineWidth = 1.1
      for (let k = 0; k < 6; k++) {
        const py = (k / 5 - 0.5) * r * 1.2
        ctx.beginPath()
        for (let px = -r; px <= r; px += 6) {
          const yy = py + Math.sin(px / (r * 0.18) + t * 0.8 + k * 1.3) * r * 0.035
          if (px === -r) ctx.moveTo(x + px, y + yy)
          else ctx.lineTo(x + px, y + yy)
        }
        const g = ctx.createLinearGradient(x - r, 0, x + r, 0)
        const a = 0.85 * fall(Math.abs(py) * 1.2)
        g.addColorStop(0, rgba(color, 0))
        g.addColorStop(0.5, rgba(color, a))
        g.addColorStop(1, rgba(color, 0))
        ctx.strokeStyle = g
        ctx.stroke()
      }
      break
    }
    case 'embers': {
      for (let i = 0; i < 22; i++) {
        const speed = 0.05 + hash(i * 1.7 + s) * 0.07
        const k = (t * speed + hash(i * 4.3)) % 1
        const py = r * 0.8 - k * r * 1.6
        const px = (hash(i + s * 30) * 2 - 1) * r * 0.7 + Math.sin(t * 0.7 + i) * 6
        const flicker = 0.5 + 0.5 * Math.sin(t * (3 + hash(i) * 4) + i)
        const a = Math.min(1, fall(Math.hypot(px, py)) * (1 - k) * (0.6 + 0.9 * flicker))
        ctx.fillStyle = rgba(color, a)
        circle(ctx, x + px, y + py, 1.6 + hash(i * 8.1) * 1.4)
        ctx.fill()
      }
      break
    }
  }
  ctx.lineCap = 'butt'
  ctx.globalCompositeOperation = 'multiply'
}
