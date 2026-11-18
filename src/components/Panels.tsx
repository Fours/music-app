import { Capacitor } from '@capacitor/core'
import type { ReactNode } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'
import { KEYS, SCALES, keyName, scaleById } from '../music/theory'
import { PRESETS } from '../world/presets'
import { Slider } from './controls'
import type { CaptureKind, ClipShape } from '../app/store'
import { AudioIcon, ClipIcon, CloseIcon, VerticalClipIcon } from './icons'

const close = () => app.ui.set({ panel: 'none' })

export function SettingsPanel() {
  const s = useStore(app.ui, (st) => st.settings)
  return (
    <aside className="sheet panel" aria-label="Sound settings">
      <header className="sheet-head">
        <div className="sheet-title">
          <h2>Sound</h2>
          <p>Everything stays in tune, whatever you pick.</p>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <div className="sheet-body">
        <div className="field">
          <div className="field-head">
            <span className="label">Mood</span>
          </div>
          <div className="mood-grid">
            {SCALES.map((sc) => (
              <button
                key={sc.id}
                className={`mood ${s.scale === sc.id ? 'on' : ''}`}
                onClick={() => app.setSettings({ scale: sc.id })}
                aria-pressed={s.scale === sc.id}
              >
                <span className="mood-name">{sc.mood}</span>
                <span className="mood-scale">{sc.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="field-head">
            <span className="label">Key</span>
          </div>
          <div className="key-grid">
            {/* Spelled for the current mood, so the picker matches the names everywhere else. */}
            {KEYS.map((k, i) => (
              <button
                key={k}
                className={`key ${s.root === i ? 'on' : ''}`}
                onClick={() => app.setSettings({ root: i })}
                aria-pressed={s.root === i}
              >
                {keyName({ root: i, scale: scaleById(s.scale) })}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Tempo"
          value={s.tempo}
          min={40}
          max={96}
          step={1}
          onChange={(tempo) => app.setSettings({ tempo })}
          format={(v) => `${v} bpm`}
          hint={['Slow', 'Lively']}
        />
        <Slider
          label="Space"
          value={s.space}
          onChange={(space) => app.setSettings({ space })}
          format={(v) => `${Math.round(v * 100)}%`}
          hint={['Close', 'Cavernous']}
        />
        <Slider
          label="Tape wow"
          value={s.wow ?? 0}
          onChange={(wow) => app.setSettings({ wow })}
          format={(v) => `${Math.round(v * 100)}%`}
          hint={['Steady', 'Seasick']}
        />
        <Slider
          label="Tape flutter"
          value={s.flutter ?? 0}
          onChange={(flutter) => app.setSettings({ flutter })}
          format={(v) => `${Math.round(v * 100)}%`}
          hint={['Clean', 'Warbly']}
        />
        <Slider
          label="Tape wear"
          value={s.wear ?? 0}
          onChange={(wear) => app.setSettings({ wear })}
          format={(v) => `${Math.round(v * 100)}%`}
          hint={['New', 'Worn']}
        />
        <Slider
          label="Volume"
          value={s.volume}
          onChange={(volume) => app.setSettings({ volume })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>
    </aside>
  )
}

export function ScenesPanel() {
  const presetId = useStore(app.ui, (s) => s.presetId)
  return (
    <aside className="sheet panel scenes" aria-label="Scenes">
      <header className="sheet-head">
        <div className="sheet-title">
          <h2>Scenes</h2>
          <p>Start from a mood, then make it yours.</p>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <div className="sheet-body">
        <div className="scene-list">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`scene-card ${presetId === p.id ? 'on' : ''}`}
              onClick={() => app.loadPreset(p.id)}
            >
              <span
                className="scene-swatch"
                style={{ background: `radial-gradient(circle at 30% 35%, ${p.colors[0]}, ${p.colors[1]} 75%)` }}
              />
              <span className="scene-text">
                <span className="scene-title">{p.name}</span>
                <span className="scene-desc">{p.description}</span>
              </span>
            </button>
          ))}
          <button className="scene-card blank" onClick={() => app.clear()}>
            <span className="scene-swatch" />
            <span className="scene-text">
              <span className="scene-title">Empty sky</span>
              <span className="scene-desc">Start from nothing and build your own</span>
            </span>
          </button>
        </div>
      </div>
    </aside>
  )
}

interface CaptureOption {
  kind: CaptureKind
  shape?: ClipShape
  title: string
  desc: string
  icon: ReactNode
  supported: () => boolean
}

const AUDIO: CaptureOption = {
  kind: 'audio',
  title: 'Audio',
  desc: 'Record what you hear as a WAV file',
  icon: <AudioIcon />,
  supported: () => app.canRecord,
}
const SCREEN_CLIP: CaptureOption = {
  kind: 'video',
  shape: 'screen',
  title: 'Video',
  desc: 'A clip of the sky and its music, up to 5 minutes',
  icon: <ClipIcon />,
  supported: () => app.canClip,
}
const VERTICAL_CLIP: CaptureOption = {
  kind: 'video',
  shape: 'vertical',
  title: 'Vertical video',
  desc: 'A 9:16 clip for TikTok, Reels and Shorts, up to 5 minutes',
  icon: <VerticalClipIcon />,
  supported: () => app.canClip,
}

/**
 * In the iOS app a clip is always vertical: on a phone the screen is nearly
 * 9:16 already, so a second, screen-shaped option would look the same.
 */
const CAPTURE_OPTIONS = Capacitor.isNativePlatform()
  ? [AUDIO, { ...VERTICAL_CLIP, title: 'Video' }]
  : [AUDIO, SCREEN_CLIP, VERTICAL_CLIP]

/** Picks what to record. Choosing one closes the panel and starts recording. */
export function RecordPanel() {
  const start = (o: CaptureOption) => {
    // Start inside the tap, so a paused context can resume.
    void app.toggleCapture(o.kind, o.shape)
    close()
  }
  return (
    <aside className="sheet panel record-panel" aria-label="Record">
      <header className="sheet-head">
        <div className="sheet-title">
          <h2>Record</h2>
          <p>Tap the red button again to stop.</p>
        </div>
        <button className="icon-button" onClick={close} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <div className="sheet-body">
        <div className="scene-list">
          {CAPTURE_OPTIONS.map((o) => {
            const ok = o.supported()
            return (
              <button key={o.shape ?? o.kind} className="scene-card" onClick={() => start(o)} disabled={!ok}>
                <span className="scene-swatch capture-swatch">{o.icon}</span>
                <span className="scene-text">
                  <span className="scene-title">{o.title}</span>
                  <span className="scene-desc">{ok ? o.desc : 'This browser can’t record this'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
