import { radius, reach, solidRadius } from './geometry'
import { clampBead, harmonyOf } from './pitch'
import { phaseFor, sweep } from './oscillate'
import type { Orbit, Settings, SoundEvent, WorldObject } from './types'

export interface Ripple {
  born: number
  r: number
  max: number
  hits: Set<string>
}

/** Transient per-object state that is never saved with a scene. */
export interface Runtime {
  wander: number
  vx: number
  vy: number
  lastHit: number
  /** Time of the most recent sound, for visual flashes. */
  flash: number
  flashAmount: number
  /** How far through its volume oscillation the object is, 0–1. */
  swell: number
  swellOn: boolean
  // pulse
  phase: number
  ripples: Ripple[]
  // orbit
  theta: number
  from: number
  to: number
  stepT: number
  index: number
  steps: number
  lit: number[]
  // chime
  trail: { x: number; y: number }[]
}

const TAU = Math.PI * 2
const MARKER = -Math.PI / 2

function newRuntime(o: WorldObject): Runtime {
  const theta = MARKER
  return {
    wander: Math.random() * TAU,
    vx: 0,
    vy: 0,
    lastHit: -10,
    flash: -10,
    flashAmount: 0,
    swell: 0,
    swellOn: false,
    phase: o.kind === 'pulse' ? 0.6 + Math.random() * 0.3 : 0,
    ripples: [],
    theta,
    from: theta,
    to: theta,
    stepT: 0,
    index: 0,
    steps: 0,
    lit: [],
    trail: [],
  }
}

/** Angle that brings bead `i` of `n` under the marker. */
function beadTarget(i: number, n: number): number {
  return MARKER + (i * TAU) / n
}


export function orbitStepDuration(o: Orbit, tempo: number): number {
  return (0.22 + o.size * 0.85) * (60 / tempo)
}

export function pulsePeriod(rate: number, tempo: number): number {
  return (2 + (1 - rate) * 10) * (60 / tempo)
}

const RIPPLE_LIFE = 4.5

export class World {
  objects: WorldObject[] = []
  rt = new Map<string, Runtime>()
  width = 1
  height = 1
  /** Lowest point chimes bounce off, in px (the tray sits below it). */
  floor = Infinity
  /** Objects currently held by a pointer; the simulation leaves them alone. */
  held = new Set<string>()
  /** Set when the simulation itself edits saved parameters (orbit evolve). */
  mutated = false

  get unit() {
    return Math.min(this.width, this.height)
  }

  runtime(o: WorldObject): Runtime {
    let r = this.rt.get(o.id)
    if (!r) {
      r = newRuntime(o)
      this.rt.set(o.id, r)
    }
    return r
  }

  /** The volume an object is playing at right now, with any oscillation applied. */
  level(o: WorldObject): number {
    const osc = o.oscillate
    return osc?.on ? sweep(osc, this.runtime(o).swell) : o.volume
  }

  /** Advance by dt seconds. `time` is when this tick starts on the audio clock. */
  step(dt: number, time: number, settings: Settings): SoundEvent[] {
    const events: SoundEvent[] = []
    const unit = this.unit
    const pace = settings.tempo / 60

    for (const id of this.rt.keys()) {
      if (!this.objects.some((o) => o.id === id)) this.rt.delete(id)
    }

    const ring = (o: WorldObject, at: number, velocity: number) => {
      const r = this.runtime(o)
      if (at - r.lastHit < 0.22) return
      r.lastHit = at
      r.flash = at
      r.flashAmount = velocity
      events.push({ type: 'chime', id: o.id, time: at, velocity })
    }

    for (const o of this.objects) {
      const r = this.runtime(o)
      const held = this.held.has(o.id)

      // Phase is accumulated rather than read off the clock, so changing the
      // cycle length mid-sweep doesn't make the volume jump.
      const osc = o.oscillate
      if (osc?.on) {
        if (!r.swellOn) r.swell = phaseFor(osc, o.volume)
        r.swellOn = true
        r.swell = (r.swell + dt / osc.period) % 1
      } else r.swellOn = false

      switch (o.kind) {
        case 'drone':
        case 'texture': {
          if (held || o.drift <= 0) break
          r.wander += (Math.random() - 0.5) * dt * 1.2
          // Steer back toward the middle near the edges.
          const cx = 0.5 - o.x
          const cy = 0.5 - o.y
          const edge = Math.max(Math.abs(cx), Math.abs(cy))
          if (edge > 0.36) {
            const toward = Math.atan2(cy * this.height, cx * this.width)
            let d = toward - r.wander
            d = Math.atan2(Math.sin(d), Math.cos(d))
            r.wander += d * dt * 0.8
          }
          const speed = o.drift * unit * 0.014
          o.x += (Math.cos(r.wander) * speed * dt) / this.width
          o.y += (Math.sin(r.wander) * speed * dt) / this.height
          o.x = Math.min(0.96, Math.max(0.04, o.x))
          o.y = Math.min(0.96, Math.max(0.04, o.y))
          break
        }

        case 'chime': {
          if (held) {
            r.trail.length = 0
            break
          }
          const speed = unit * (0.015 + o.speed * 0.15)
          let px = o.x * this.width + Math.cos(o.heading) * speed * dt
          let py = o.y * this.height + Math.sin(o.heading) * speed * dt
          const rad = radius(o, unit)
          let hx = Math.cos(o.heading)
          let hy = Math.sin(o.heading)
          let bounced = false
          if (px < rad || px > this.width - rad) {
            hx = px < rad ? Math.abs(hx) : -Math.abs(hx)
            px = Math.min(this.width - rad, Math.max(rad, px))
            bounced = true
          }
          const floor = Math.min(this.height, this.floor)
          if (py < rad || py > floor - rad) {
            hy = py < rad ? Math.abs(hy) : -Math.abs(hy)
            py = Math.min(floor - rad, Math.max(rad, py))
            bounced = true
          }
          if (bounced) ring(o, time + dt, 0.45 + o.speed * 0.3)

          for (const b of this.objects) {
            if (b === o || b.kind === 'texture') continue
            const bx = b.x * this.width
            const by = b.y * this.height
            const dx = px - bx
            const dy = py - by
            const dist = Math.hypot(dx, dy)
            const min = rad + solidRadius(b, unit)
            if (dist >= min || dist === 0) continue
            const nx = dx / dist
            const ny = dy / dist
            const into = hx * nx + hy * ny
            if (into < 0) {
              hx -= 2 * into * nx
              hy -= 2 * into * ny
              ring(o, time + dt, 0.55 + Math.min(0.4, -into * 0.4))
              if (b.kind === 'chime') {
                b.heading = Math.atan2(-ny, -nx) + (Math.random() - 0.5) * 0.4
                ring(b, time + dt, 0.5)
              } else {
                const br = this.runtime(b)
                br.flash = time + dt
                br.flashAmount = 0.35
              }
            }
            px = bx + nx * min
            py = by + ny * min
          }
          o.heading = Math.atan2(hy, hx)
          o.x = px / this.width
          o.y = py / this.height
          r.trail.push({ x: o.x, y: o.y })
          if (r.trail.length > 28) r.trail.shift()
          break
        }

        case 'pulse': {
          const period = pulsePeriod(o.rate, settings.tempo)
          r.phase += dt / period
          if (r.phase >= 1) {
            r.phase -= 1
            const at = time + dt - r.phase * period
            r.flash = at
            r.flashAmount = 1
            r.ripples.push({ born: at, r: 0, max: reach(o, unit), hits: new Set() })
            events.push({ type: 'pulse', id: o.id, time: at })
          }
          const px = o.x * this.width
          const py = o.y * this.height
          for (const rp of r.ripples) {
            const age = time + dt - rp.born
            const prev = rp.r
            rp.r = Math.max(0, (age / RIPPLE_LIFE) * rp.max * pace)
            // Ripples set off chimes as the wavefront passes them.
            for (const c of this.objects) {
              if (c.kind !== 'chime' || rp.hits.has(c.id) || this.held.has(c.id)) continue
              const d = Math.hypot(c.x * this.width - px, c.y * this.height - py)
              if (d > prev && d <= rp.r && rp.r <= rp.max) {
                rp.hits.add(c.id)
                ring(c, time + dt, 0.4 * (1 - rp.r / rp.max) + 0.2)
                const away = Math.atan2(c.y * this.height - py, c.x * this.width - px)
                let delta = away - c.heading
                delta = Math.atan2(Math.sin(delta), Math.cos(delta))
                c.heading += delta * 0.35
              }
            }
          }
          r.ripples = r.ripples.filter((rp) => rp.r < rp.max)
          break
        }

        case 'orbit': {
          const n = Math.max(1, o.beads.length)
          if (r.lit.length !== n) {
            r.lit = Array.from({ length: n }, (_, i) => r.lit[i] ?? -10)
            r.index = Math.min(r.index, n - 1)
            r.from = r.to = r.theta = beadTarget(r.index, n) + Math.round((r.theta - beadTarget(r.index, n)) / TAU) * TAU
          }
          const dur = orbitStepDuration(o, settings.tempo)
          r.stepT += dt
          while (r.stepT >= dur) {
            r.stepT -= dur
            const at = time + dt - r.stepT
            r.theta = r.to
            // A muted step keeps its place in the loop but stays silent.
            if (!o.muted?.[r.index]) {
              r.lit[r.index] = at
              r.flash = at
              r.flashAmount = 0.6
              events.push({ type: 'orbit', id: o.id, time: at, bead: r.index })
            }
            r.steps++
            if (r.steps % n === 0 && o.evolve > 0 && Math.random() < o.evolve * 0.7) {
              const b = Math.floor(Math.random() * n)
              const shift = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.7 ? 1 : 2)
              o.beads[b] = clampBead(o.beads[b] + shift, harmonyOf(settings))
              this.mutated = true
            }
            // Turn one step to bring the next bead to the marker: clockwise
            // through the pattern going forward, counterclockwise going backward.
            const dir = o.direction === 'backward' ? -1 : 1
            r.from = r.theta
            r.to = r.theta + (dir * TAU) / n
            r.index = (r.index + dir + n) % n
          }
          r.theta = r.from + (r.to - r.from) * (r.stepT / dur)
          break
        }
      }
    }
    return events
  }
}

/** Beads are laid out counterclockwise in pattern order, so playing forward turns the ring clockwise. */
export function beadAngle(rt: Runtime, i: number, n: number): number {
  return rt.theta - (i * TAU) / n
}
