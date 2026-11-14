import { useEffect, useRef, useState } from 'react'
import { app } from '../app/controller'
import { debug } from '../app/debug'
import { useStore } from '../app/store'
import { engine } from '../audio/engine'

const clock = () => new Date().toTimeString().slice(0, 8)
const mmss = (seconds: number) => {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
/** WKWebView draws at 60 Hz, even on ProMotion screens, unless a hidden setting is changed. */
const FRAME_MS = 1000 / 60

/**
 * A small readout of the audio engine's state, for testing on phones and
 * tablets where the console isn't handy. Turned on and off by tapping the
 * wordmark five times (see app/debug.ts).
 */
export function DebugBadge() {
  const on = useStore(debug, (s) => s.on)
  const [info, setInfo] = useState(() => engine.debugInfo())
  // The last few changes of audio state or visibility, newest first.
  const [log, setLog] = useState<string[]>([])
  // How the last stretch off screen went, kept until the next one.
  const [away, setAway] = useState<string | null>(null)
  // Frame rate and audio timing since the badge was turned on or last tapped.
  const [perf, setPerf] = useState<string[]>([])
  const reset = useRef(() => {})

  useEffect(() => {
    if (!on) return
    const note = (text: string) => setLog((l) => [`${clock()} ${text}`, ...l].slice(0, 6))
    let last = engine.debugInfo().state
    const onState = () => {
      const state = engine.debugInfo().state
      if (state !== last) note(`audio ${last} → ${state}`)
      last = state
    }
    // The engine swaps in its own context when it starts, so follow whichever is current.
    let ctx: BaseAudioContext | null = null
    // Frames: count each animation frame, and how many 60 Hz frames were missed between two.
    let run = { since: 0, frames: 0, dropped: 0, worst: 0, ticks: 0, late: 0 }
    const recent: number[] = []
    let lastFrame = 0
    let raf = 0
    reset.current = () => {
      run = { since: performance.now(), frames: 0, dropped: 0, worst: 0, ticks: app.ticks, late: app.lateTicks }
      app.maxTickGap = 0
      lastFrame = 0
    }
    reset.current()
    const onFrame = (ms: number) => {
      const dt = ms - lastFrame
      // A gap over a second means the page was hidden, not that frames dropped.
      if (lastFrame && dt < 1000) {
        run.frames++
        run.dropped += Math.max(0, Math.round(dt / FRAME_MS) - 1)
        run.worst = Math.max(run.worst, dt)
      }
      lastFrame = ms
      recent.push(ms)
      while (recent[0] < ms - 1000) recent.shift()
      raf = requestAnimationFrame(onFrame)
    }
    raf = requestAnimationFrame(onFrame)
    const showPerf = () => {
      const drawn = run.frames + run.dropped
      const pct = drawn ? ((run.dropped / drawn) * 100).toFixed(1) : '0.0'
      const ticks = app.ticks - run.ticks
      setPerf([
        `fps ${recent.length} · dropped ${run.dropped} of ${drawn} (${pct}%) · worst ${Math.round(run.worst)} ms`,
        `late ticks ${app.lateTicks - run.late} of ${ticks} · max gap ${(app.maxTickGap / 1000).toFixed(2)} s · ` +
          `${app.world.objects.length} objects · ${mmss((performance.now() - run.since) / 1000)}`,
      ])
    }
    const t = window.setInterval(() => {
      setInfo(engine.debugInfo())
      showPerf()
      const current = engine.context()
      if (current !== ctx) {
        ctx?.removeEventListener('statechange', onState)
        current.addEventListener('statechange', onState)
        ctx = current
      }
      onState()
    }, 250)
    // While the app is off screen, measure whether audio and the simulation kept going.
    let left: { wall: number; audio: number; ticks: number } | null = null
    const onVisibility = () => {
      note(`page ${document.visibilityState}`)
      const audio = engine.context().currentTime
      if (document.visibilityState === 'hidden') {
        left = { wall: Date.now(), audio, ticks: app.ticks }
        app.maxTickGap = 0
      } else if (left) {
        const away = (Date.now() - left.wall) / 1000
        const audioRan = audio - left.audio
        const ticks = app.ticks - left.ticks
        // The simulation steps every 25 ms of audio time while playing.
        const expected = Math.round(audioRan / 0.025)
        setAway(
          `away ${mmss(away)} · audio clock +${mmss(audioRan)} · ticks ${ticks} of ${expected} · ` +
            `longest gap ${(app.maxTickGap / 1000).toFixed(1)} s`,
        )
        left = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(t)
      cancelAnimationFrame(raf)
      ctx?.removeEventListener('statechange', onState)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [on])

  if (!on) return null
  return (
    <div className="debug-badge" aria-hidden onClick={() => reset.current()}>
      <div>
        audio <b className={info.state === 'running' ? 'ok' : 'bad'}>{info.state}</b> · level {info.level} ·{' '}
        {app.ui.get().playing ? 'playing' : 'paused'}
      </div>
      <div>
        clock {info.time} · session {info.session}
      </div>
      {perf.map((line, i) => (
        <div key={i} className="debug-perf">
          {line}
        </div>
      ))}
      {away && <div className="debug-away">{away}</div>}
      {log.map((line, i) => (
        <div key={i} className="debug-log">
          {line}
        </div>
      ))}
    </div>
  )
}
