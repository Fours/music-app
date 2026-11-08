import { useEffect, useState } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'
import { KEYS, scaleById } from '../music/theory'
import { PauseIcon, PlayIcon, ScenesIcon, SlidersIcon } from './icons'

export function TopBar() {
  const sceneName = useStore(app.ui, (s) => s.sceneName)
  const playing = useStore(app.ui, (s) => s.playing)
  const panel = useStore(app.ui, (s) => s.panel)
  const root = useStore(app.ui, (s) => s.settings.root)
  const scale = useStore(app.ui, (s) => s.settings.scale)
  const tempo = useStore(app.ui, (s) => s.settings.tempo)

  const toggle = (p: 'settings' | 'scenes') =>
    app.ui.set({ panel: panel === p ? 'none' : p, selectedId: null })

  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark">Drift</span>
        <button className="scene-name" onClick={() => toggle('scenes')}>
          {sceneName || 'Untitled'}
        </button>
      </div>

      <div className="topbar-actions">
        <button
          className={`chip-button ${panel === 'settings' ? 'on' : ''}`}
          onClick={() => toggle('settings')}
          aria-expanded={panel === 'settings'}
        >
          <SlidersIcon />
          <span className="chip-text">
            {KEYS[root]} {scaleById(scale).mood.toLowerCase()} · {tempo}
          </span>
        </button>
        <button
          className={`chip-button ${panel === 'scenes' ? 'on' : ''}`}
          onClick={() => toggle('scenes')}
          aria-expanded={panel === 'scenes'}
        >
          <ScenesIcon />
          <span className="chip-text">Scenes</span>
        </button>
        <RecordButton />
        <button className="play-button" onClick={() => app.togglePlay()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </header>
  )
}

function RecordButton() {
  const since = useStore(app.ui, (s) => s.recordingSince)
  const saving = useStore(app.ui, (s) => s.saving)
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (since === null) return
    const update = () => setSecs(Math.floor((Date.now() - since) / 1000))
    update()
    const t = window.setInterval(update, 500)
    return () => window.clearInterval(t)
  }, [since])
  if (!app.canRecord) return null
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const recording = since !== null
  return (
    <button
      className={`chip-button record ${recording ? 'live' : ''}`}
      onClick={() => app.toggleRecording()}
      disabled={saving}
      aria-label={recording ? 'Stop recording and download' : 'Record'}
      title={recording ? 'Stop and download a WAV file' : 'Record what you hear'}
    >
      <span className="rec-dot" />
      <span className="chip-text">{saving ? 'Saving…' : recording ? time : 'Record'}</span>
    </button>
  )
}
