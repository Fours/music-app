import { useEffect, useState } from 'react'
import { app } from '../app/controller'
import { debug } from '../app/debug'
import { useStore } from '../app/store'
import { engine } from '../audio/engine'

const clock = () => new Date().toTimeString().slice(0, 8)

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
    const onVisibility = () => note(`page ${document.visibilityState}`)
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
      {log.map((line, i) => (
        <div key={i} className="debug-log">
          {line}
        </div>
      ))}
    </div>
  )
}
