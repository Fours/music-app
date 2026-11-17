import { useEffect, useState } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'
import { keyName, scaleById } from '../music/theory'
import { useDebugTaps } from '../app/debug'
import { PauseIcon, PlayIcon, ScenesIcon, SlidersIcon } from './icons'

export function TopBar() {
  const sceneName = useStore(app.ui, (s) => s.sceneName)
  const playing = useStore(app.ui, (s) => s.playing)
  const panel = useStore(app.ui, (s) => s.panel)
  const root = useStore(app.ui, (s) => s.settings.root)
  const scale = useStore(app.ui, (s) => s.settings.scale)
  const tempo = useStore(app.ui, (s) => s.settings.tempo)
  const debugTaps = useDebugTaps()

  const toggle = (p: 'settings' | 'scenes' | 'record') =>
    app.ui.set({ panel: panel === p ? 'none' : p, selectedId: null })

  return (
    <header className="topbar">
      <div className="brand">
        <span className="wordmark" onClick={debugTaps}>
          Skyloom
        </span>
        <button className="scene-name" onClick={() => toggle('scenes')}>
          {sceneName || 'Untitled'}
        </button>
      </div>

      <div className="topbar-actions">
        <button
          className={`chip-button ${panel === 'settings' ? 'on' : ''}`}
          onClick={() => toggle('settings')}
          aria-expanded={panel === 'settings'}
          aria-label="Sound settings"
          title="Mood, key, tempo and space"
        >
          <SlidersIcon />
          <span className="chip-text">
            {keyName({ root, scale: scaleById(scale) })} {scaleById(scale).mood.toLowerCase()} · {tempo}
          </span>
        </button>
        <button
          className={`chip-button ${panel === 'scenes' ? 'on' : ''}`}
          onClick={() => toggle('scenes')}
          aria-expanded={panel === 'scenes'}
          aria-label="Scenes"
        >
          <ScenesIcon />
          <span className="chip-text">Scenes</span>
        </button>
        <RecordButton open={panel === 'record'} onOpen={() => toggle('record')} />
        <button className="play-button" onClick={() => app.togglePlay()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </header>
  )
}

const LIVE = {
  audio: { label: 'Stop recording and download', title: 'Stop and download a WAV file' },
  video: { label: 'Stop the clip and download', title: 'Stop and download the video' },
}

/**
 * Opens the record panel, where you pick audio or video. While a recording
 * runs, it shows the time and stops it.
 */
function RecordButton({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  const capture = useStore(app.ui, (s) => s.capture)
  const since = capture?.since ?? null
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (since === null) return
    const update = () => setSecs(Math.floor((Date.now() - since) / 1000))
    update()
    const t = window.setInterval(update, 500)
    return () => window.clearInterval(t)
  }, [since])
  if (!app.canRecord && !app.canClip) return null
  if (!capture) {
    return (
      <button
        className={`chip-button record ${open ? 'on' : ''}`}
        onClick={onOpen}
        aria-expanded={open}
        aria-label="Record"
        title="Record audio or a video clip"
      >
        <span className="rec-dot" />
        <span className="chip-text">Record</span>
      </button>
    )
  }
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <button
      className="chip-button record live"
      onClick={() => void app.toggleCapture(capture.kind)}
      disabled={capture.saving}
      aria-label={LIVE[capture.kind].label}
      title={LIVE[capture.kind].title}
    >
      <span className="rec-dot" />
      <span className="chip-text">{capture.saving ? 'Saving…' : time}</span>
    </button>
  )
}
