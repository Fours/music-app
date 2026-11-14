import { useEffect, useState } from 'react'
import { app } from '../app/controller'
import { useStore, type CaptureKind } from '../app/store'
import { keyName, scaleById } from '../music/theory'
import { ClipIcon, PauseIcon, PlayIcon, ScenesIcon, SlidersIcon } from './icons'

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
        <span className="wordmark">Skyloom</span>
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
        <CaptureButton kind="video" />
        <CaptureButton kind="audio" />
        <button className="play-button" onClick={() => app.togglePlay()} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
    </header>
  )
}

const CAPTURE = {
  audio: {
    supported: () => app.canRecord,
    label: 'Record',
    idleTitle: 'Record what you hear',
    liveLabel: 'Stop recording and download',
    liveTitle: 'Stop and download a WAV file',
  },
  video: {
    supported: () => app.canClip,
    label: 'Clip',
    idleTitle: 'Record a video clip to share',
    liveLabel: 'Stop the clip and download',
    liveTitle: 'Stop and download the video',
  },
}

/** Record (audio) or Clip (video). While one runs, the other steps aside. */
function CaptureButton({ kind }: { kind: CaptureKind }) {
  const capture = useStore(app.ui, (s) => s.capture)
  const since = capture?.kind === kind ? capture.since : null
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (since === null) return
    const update = () => setSecs(Math.floor((Date.now() - since) / 1000))
    update()
    const t = window.setInterval(update, 500)
    return () => window.clearInterval(t)
  }, [since])
  const c = CAPTURE[kind]
  if (!c.supported() || (capture && capture.kind !== kind)) return null
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const live = since !== null
  const saving = live && capture!.saving
  return (
    <button
      className={`chip-button record ${live ? 'live' : ''}`}
      onClick={() => app.toggleCapture(kind)}
      disabled={saving}
      aria-label={live ? c.liveLabel : c.label}
      title={live ? c.liveTitle : c.idleTitle}
    >
      {kind === 'audio' || live ? <span className="rec-dot" /> : <ClipIcon />}
      <span className="chip-text">{saving ? 'Saving…' : live ? time : c.label}</span>
    </button>
  )
}
