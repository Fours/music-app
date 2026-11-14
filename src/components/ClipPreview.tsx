import { useState } from 'react'
import { app } from '../app/controller'
import { useStore } from '../app/store'

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`
const seconds = (s: number) => (Number.isFinite(s) ? `${s.toFixed(1)} s` : 'unknown')

/**
 * Shows a finished recording or clip in the iOS app, where downloading doesn't
 * work. It plays the file and lists what came out, which is also how milestone 1
 * checks clip quality on a device. The share sheet replaces it in milestone 2.
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
            // Starting just past zero makes iOS show the first frame instead of a black box.
            src={`${preview.url}#t=0.001`}
            controls
            playsInline
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              setLoaded({ url: preview.url, seconds: v.duration, size: `${v.videoWidth}×${v.videoHeight}` })
            }}
          />
        ) : (
          <audio
            src={preview.url}
            controls
            onLoadedMetadata={(e) => setLoaded({ url: preview.url, seconds: e.currentTarget.duration })}
          />
        )}
        <p className="preview-note">
          Saving to Photos and Files is coming. For now you can play it here. Pause the scene to hear it on its own.
        </p>
        <p className="preview-details">{details.join(' · ')}</p>
      </div>
    </div>
  )
}
