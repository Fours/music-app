import { app } from '../app/controller'
import { useStore } from '../app/store'

export function Welcome() {
  const phase = useStore(app.ui, (s) => s.phase)
  const progress = useStore(app.ui, (s) => s.loadProgress)
  if (phase === 'running') return null
  const loading = phase === 'loading'
  return (
    <div className={`welcome ${loading ? 'loading' : ''}`}>
      <div className="welcome-card">
        <h1 className="welcome-mark">Drift</h1>
        <p className="welcome-tag">Ambient music you shape by hand.</p>
        <p className="welcome-body">
          Place drones, chimes, pulses, orbits and weather on an open sky. They play off each other, always in
          tune, and the piece keeps changing on its own.
        </p>
        <button className="begin" onClick={() => app.begin()} disabled={loading} autoFocus>
          {loading ? 'Tuning the room…' : 'Begin listening'}
          {loading && <span className="begin-progress" style={{ width: `${progress * 100}%` }} />}
        </button>
        <p className="welcome-fine">Sound on · headphones recommended</p>
      </div>
    </div>
  )
}
