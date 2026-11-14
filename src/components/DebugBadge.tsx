import { useEffect, useState } from 'react'
import { app } from '../app/controller'
import { debug } from '../app/debug'
import { useStore } from '../app/store'
import { engine } from '../audio/engine'

const clock = () => new Date().toTimeString().slice(0, 8)
const mmss = (seconds: number) => {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

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
    const t = window.setInterval(() => {
      setInfo(engine.debugInfo())
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
      ctx?.removeEventListener('statechange', onState)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [on])

  if (!on) return null
  return (
    <div className="debug-badge" aria-hidden>
      <div>
        audio <b className={info.state === 'running' ? 'ok' : 'bad'}>{info.state}</b> · level {info.level} ·{' '}
        {app.ui.get().playing ? 'playing' : 'paused'}
      </div>
      <div>
        clock {info.time} · session {info.session}
      </div>
      {away && <div className="debug-away">{away}</div>}
      {log.map((line, i) => (
        <div key={i} className="debug-log">
          {line}
        </div>
      ))}
    </div>
  )
}
