import { useEffect, useRef, useState } from 'react'
import { audioLog } from '../app/audio-log'
import { app } from '../app/controller'
import { debug } from '../app/debug'
import { drawStats, perfSwitches, togglePerf, type PerfSwitches } from '../app/perf'
import { refreshSession } from '../app/native-audio'
import { useStore } from '../app/store'
import { engine } from '../audio/engine'
import { INSTRUMENTS } from '../audio/instruments'

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`

/**
 * Begin listening's time to sound, each instrument's time to its first note,
 * and the decoded audio in memory (milestone 3, T6).
 */
function loadLines(): string[] {
  const begin = app.beginStats
  const lines = [
    begin
      ? `begin → sound ${seconds(begin.ms)} · ${begin.instruments} instrument${begin.instruments === 1 ? '' : 's'}, ${begin.files} files`
      : 'begin → sound –',
    `decoded audio ${(engine.decodedBytes() / 1e6).toFixed(1)} MB`,
  ]
  for (const n of engine.instruments.firstNotes.slice(-4))
    lines.push(`${n.id}: first note ${Math.round(n.ms)} ms${n.atBegin ? ' (at Begin)' : ''}`)
  return lines
}

const clock = () => new Date().toTimeString().slice(0, 8)
const mmss = (seconds: number) => {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const SWITCHES: { key: keyof PerfSwitches; label: string }[] = [
  { key: 'fps30', label: '30 fps' },
  { key: 'noBlur', label: 'no blur' },
  { key: 'noGrain', label: 'no grain' },
]

/** WKWebView draws at 60 Hz, even on ProMotion screens, unless a hidden setting is changed. */
const FRAME_MS = 1000 / 60

/**
 * A small readout of the audio engine's state, for testing on phones and
 * tablets where the console isn't handy. Turned on and off by tapping the
 * wordmark five times (see app/debug.ts).
 */
export function DebugBadge() {
  const on = useStore(debug, (s) => s.on)
  const switches = useStore(perfSwitches, (s) => s)
  const recovery = useStore(audioLog, (s) => s)
  const [info, setInfo] = useState(() => engine.debugInfo())
  // The last few changes of audio state or visibility, newest first.
  const [log, setLog] = useState<string[]>([])
  // How the last stretch off screen went, kept until the next one.
  const [away, setAway] = useState<string | null>(null)
  // Frame rate and audio timing since the badge was turned on or last tapped.
  const [perf, setPerf] = useState<string[]>([])
  const [loads, setLoads] = useState<string[]>([])
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
    // Frames: count animation frames against the time they span. Counting misses per frame
    // undercounts on devices whose frames arrive every 18–26 ms rather than in whole 16.7 ms steps.
    let run = { since: 0, frames: 0, span: 0, worst: 0, ticks: 0, late: 0, drawn: 0, drawMs: 0 }
    const recent: number[] = []
    let lastFrame = 0
    let raf = 0
    // While the app is off screen, measure whether audio and the simulation kept going.
    // Frames stop whenever the page isn't on screen, so a long gap between two frames
    // means it was away. This doesn't rely on visibilitychange, which a locked iPhone
    // didn't always deliver (milestone 2, T2).
    let seen: { wall: number; audio: number; ticks: number } | null = null
    let hiddenEvent = false
    const reportAway = (from: { wall: number; audio: number; ticks: number }, wall: number) => {
      const away = (wall - from.wall) / 1000
      const audioRan = engine.context().currentTime - from.audio
      const ticks = app.ticks - from.ticks
      // The simulation steps every 25 ms of audio time while playing.
      const expected = Math.round(audioRan / 0.025)
      setAway(
        `away ${mmss(away)} · audio clock +${mmss(audioRan)} · ticks ${ticks} of ${expected} · ` +
          `longest gap ${(app.maxTickGap / 1000).toFixed(1)} s${hiddenEvent ? '' : ' · no hidden event'}`,
      )
      hiddenEvent = false
    }
    reset.current = () => {
      run = {
        since: performance.now(),
        frames: 0,
        span: 0,
        worst: 0,
        ticks: app.ticks,
        late: app.lateTicks,
        drawn: drawStats.frames,
        drawMs: drawStats.ms,
      }
      app.maxTickGap = 0
      lastFrame = 0
    }
    reset.current()
    const onFrame = (ms: number) => {
      const wall = Date.now()
      if (seen && wall - seen.wall > 5000) reportAway(seen, wall)
      seen = { wall, audio: engine.context().currentTime, ticks: app.ticks }
      const dt = ms - lastFrame
      // A gap over a second means the page was hidden, not that frames dropped.
      if (lastFrame && dt < 1000) {
        run.frames++
        run.span += dt
        run.worst = Math.max(run.worst, dt)
      }
      lastFrame = ms
      recent.push(ms)
      while (recent[0] < ms - 1000) recent.shift()
      raf = requestAnimationFrame(onFrame)
    }
    raf = requestAnimationFrame(onFrame)
    const showPerf = () => {
      const avg = run.span ? (run.frames * 1000) / run.span : 0
      const ofTarget = Math.round((avg * FRAME_MS * 100) / 1000)
      const ticks = app.ticks - run.ticks
      const seconds = (performance.now() - run.since) / 1000
      const drawn = drawStats.frames - run.drawn
      const drawMs = drawn ? (drawStats.ms - run.drawMs) / drawn : 0
      setPerf([
        `fps ${recent.length} now · ${avg.toFixed(1)} avg (${ofTarget}% of 60) · worst ${Math.round(run.worst)} ms`,
        `late ticks ${app.lateTicks - run.late} of ${ticks} · max gap ${(app.maxTickGap / 1000).toFixed(2)} s · ` +
          `${app.world.objects.length} objects · ${mmss(seconds)}`,
        // Script time only: WebKit rasterizes the canvas later, in its own processes, so the
        // real cost of drawing shows in Instruments, not here.
        `drawn ${seconds ? (drawn / seconds).toFixed(1) : '0'} fps · script ${drawMs.toFixed(2)} ms a frame`,
      ])
    }
    const t = window.setInterval(() => {
      refreshSession()
      setInfo(engine.debugInfo())
      showPerf()
      setLoads(loadLines())
      const current = engine.context()
      if (current !== ctx) {
        ctx?.removeEventListener('statechange', onState)
        current.addEventListener('statechange', onState)
        ctx = current
      }
      onState()
    }, 250)
    const onVisibility = () => {
      note(`page ${document.visibilityState}`)
      if (document.visibilityState !== 'hidden') return
      hiddenEvent = true
      // So the away line's longest gap is the one while away.
      app.maxTickGap = 0
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
      <div className="debug-switches">
        {SWITCHES.map(({ key, label }) => (
          <button
            key={key}
            className={switches[key] ? 'on' : ''}
            onClick={(e) => {
              // A switch also restarts the counts, but shouldn't count as a tap on the badge.
              e.stopPropagation()
              togglePerf(key)
              reset.current()
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={(e) => {
            e.stopPropagation()
            // For the memory check: every instrument's notes, as if each were chosen.
            for (const inst of INSTRUMENTS) void engine.instruments.load(inst.id)
          }}
        >
          load all
        </button>
      </div>
      {loads.map((line, i) => (
        <div key={i} className="debug-load">
          {line}
        </div>
      ))}
      {perf.map((line, i) => (
        <div key={i} className="debug-perf">
          {line}
        </div>
      ))}
      {away && <div className="debug-away">{away}</div>}
      {/* What the clock watchdog did, kept across launches. */}
      <div className="debug-recovery">
        recovery this launch: {recovery.kicks} quick restarts · {recovery.rebuilds} rebuilds ·{' '}
        {recovery.interruptions} interruptions
      </div>
      {recovery.lines.slice(-4).map((l) => (
        <div key={l.id} className="debug-recovery">
          {l.at} {l.text}
        </div>
      ))}
      {log.map((line, i) => (
        <div key={i} className="debug-log">
          {line}
        </div>
      ))}
    </div>
  )
}
