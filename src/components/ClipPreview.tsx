import { useState } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'
import { ShareIcon } from './icons'

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`
const seconds = (s: number) => (Number.isFinite(s) ? `${s.toFixed(1)} s` : 'unknown')

/**
 * Shows a finished recording or clip in the iOS app, where downloading doesn't
 * work, with a Share button for the share sheet (Photos, Files, Messages…).
 * Playing it pauses the scene. The details line is how clip quality is checked
 * on a device.
 */
export function ClipPreview() {
  const preview = useStore(app.ui, (s) => s.preview)
  // What the player itself reports once the file loads.
  const [loaded, setLoaded] = useState<{ url: string; seconds: number; size?: string } | null>(null)
  if (!preview) return null

  const isClip = preview.kind === 'video'
  const meta = loaded?.url === preview.url ? loaded : null
  const f = preview.frames
  const details = [
    preview.type,
    megabytes(preview.bytes),
    `recorded ${seconds(preview.seconds)}`,
    meta && `plays ${seconds(meta.seconds)}`,
    meta?.size ?? (f && `${f.width}×${f.height}`),
    f && `${f.drawn} of ${f.expected} frames drawn`,
    preview.problem,
  ].filter(Boolean)

  return (
    <div className="preview-backdrop" onClick={() => app.closePreview()}>
      <div
        className="preview"
        role="dialog"
        aria-label={isClip ? 'Your clip' : 'Your recording'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preview-head">
          <h2>{isClip ? 'Your clip' : 'Your recording'}</h2>
          <button className="preview-close" onClick={() => app.closePreview()}>
            Done
          </button>
        </div>
        {isClip ? (
          <video
            src={preview.url}
            poster={preview.poster}
            preload="metadata"
            controls
            playsInline
            onPlay={() => app.previewPlaying()}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              setLoaded({ url: preview.url, seconds: v.duration, size: `${v.videoWidth}×${v.videoHeight}` })
            }}
          />
        ) : (
          <audio
            src={preview.url}
            controls
            onPlay={() => app.previewPlaying()}
            onLoadedMetadata={(e) => setLoaded({ url: preview.url, seconds: e.currentTarget.duration })}
          />
        )}
        <button className="preview-share" onClick={() => void app.share()} disabled={preview.sharing}>
          <ShareIcon />
          {preview.sharing ? 'Opening…' : isClip ? 'Save or share the clip' : 'Save or share the recording'}
        </button>
        <p className="preview-details">{details.join(' · ')}</p>
      </div>
    </div>
  )
}
