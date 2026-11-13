/**
 * Records the canvas and the master output together as a video clip.
 *
 * The clip has its own canvas rather than capturing the one on screen, so it
 * can be drawn at a fixed resolution without the selection ring or pitch
 * guides, and with a small wordmark in the corner. The browser does the
 * encoding (MediaRecorder), so nothing extra ships in the bundle.
 */

const FPS = 30
/** The clip fits inside 1920 × 1080 (or 1080 × 1920 when the window is tall). */
const LONG = 1920
const SHORT = 1080

// MP4 first: it's what Instagram, TikTok and Photos accept. Firefox only offers WebM.
const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export function clipType(): string | null {
  if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export type Paint = (ctx: CanvasRenderingContext2D) => void

export class ClipRecorder {
  readonly type: string
  readonly extension: string
  private canvas = document.createElement('canvas')
  private ctx = this.canvas.getContext('2d')!
  private recorder: MediaRecorder
  private chunks: Blob[] = []
  private scale: number
  private lastFrame = -Infinity

  /** `width` and `height` are the stage size in CSS pixels; the clip keeps its shape. */
  constructor(audio: MediaStream, width: number, height: number, type: string) {
    this.type = type
    this.extension = type.startsWith('video/mp4') ? 'mp4' : 'webm'
    this.scale = Math.min(LONG / Math.max(width, height), SHORT / Math.min(width, height))
    // Video encoders want even dimensions.
    this.canvas.width = Math.round((width * this.scale) / 2) * 2
    this.canvas.height = Math.round((height * this.scale) / 2) * 2

    const stream = new MediaStream([
      ...this.canvas.captureStream(FPS).getVideoTracks(),
      ...audio.getAudioTracks(),
    ])
    this.recorder = new MediaRecorder(stream, {
      mimeType: type,
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 192_000,
    })
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
  }

  start() {
    // Collect data every second so a long clip doesn't sit in one huge buffer.
    this.recorder.start(1000)
  }

  /**
   * Called from the draw loop with the frame's timestamp. Draws at most FPS
   * times a second, since the screen usually refreshes faster than the clip needs.
   */
  frame(ms: number, paint: Paint) {
    if (ms - this.lastFrame < 1000 / FPS - 2) return
    this.lastFrame = ms
    const { ctx, canvas } = this
    ctx.save()
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    paint(ctx)
    ctx.restore()
    drawWatermark(ctx, canvas.width, canvas.height)
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.recorder.onstop = () => {
        this.release()
        resolve(new Blob(this.chunks, { type: this.type.split(';')[0] }))
      }
      this.recorder.onerror = () => {
        this.release()
        reject(new Error('Clip recording failed'))
      }
      this.recorder.stop()
    })
  }

  /** Stop the canvas track; the audio track belongs to the engine and keeps running. */
  private release() {
    for (const track of this.recorder.stream.getVideoTracks()) track.stop()
  }
}

/** "Drift" and the site's address, small in the bottom-right corner. */
function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const u = Math.min(w, h) / 1080
  const pad = 36 * u
  const site = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? '' : location.host
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(42, 45, 56, 0.55)'
  let y = h - pad
  if (site) {
    ctx.font = `500 ${Math.round(18 * u)}px "Inter Variable", system-ui, sans-serif`
    ctx.fillText(site, w - pad, y)
    y -= 26 * u
  }
  ctx.font = `${Math.round(40 * u)}px "Instrument Serif", Georgia, serif`
  ctx.fillText('Drift', w - pad, y)
  ctx.restore()
}
