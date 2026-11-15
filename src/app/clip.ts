/**
 * Records the canvas and the master output together as a video clip.
 *
 * The clip has its own canvas rather than capturing the one on screen, so it
 * can be drawn at a fixed resolution without the selection ring or pitch
 * guides, and with a small wordmark in the corner. The browser does the
 * encoding (MediaRecorder), so nothing extra ships in the bundle.
 */

const FPS = 30
/** How long to wait for the recorder to hand over the last data before giving up (ms). */
const STOP_TIMEOUT = 8000
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
  /** Frames painted into the clip, and when recording started (ms), to check against FPS. */
  frames = 0
  private startedAt = 0
  /** What went wrong, if the recorder failed or stopped by itself. Shown in the preview or the error. */
  problem: string | null = null
  private stopping = false
  /** The recorder's `stop` event has fired, so all its data has arrived. */
  private ended = false

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
    // Listen from the start: if the encoder fails mid-clip, stop() must not wait for an event that never comes.
    this.recorder.addEventListener('error', (e) => {
      const err = (e as Event & { error?: DOMException }).error
      this.problem = `recorder error: ${err ? `${err.name} ${err.message}` : 'unknown'}`
      console.error(this.problem)
    })
    this.recorder.addEventListener('stop', () => {
      this.ended = true
      if (!this.stopping) this.problem ??= `recorder stopped by itself after ${this.elapsed().toFixed(1)} s`
    })
  }

  private elapsed() {
    return (performance.now() - this.startedAt) / 1000
  }

  start() {
    // Collect data every second so a long clip doesn't sit in one huge buffer.
    this.recorder.start(1000)
    this.startedAt = performance.now()
  }

  get width() {
    return this.canvas.width
  }

  get height() {
    return this.canvas.height
  }

  /** How many frames a clip of this length should have. */
  get expectedFrames() {
    return Math.round(((performance.now() - this.startedAt) / 1000) * FPS)
  }

  /**
   * Called from the draw loop with the frame's timestamp. Draws at most FPS
   * times a second, since the screen usually refreshes faster than the clip needs.
   */
  frame(ms: number, paint: Paint) {
    if (ms - this.lastFrame < 1000 / FPS - 2) return
    this.lastFrame = ms
    this.frames++
    const { ctx, canvas } = this
    ctx.save()
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    paint(ctx)
    ctx.restore()
    drawWatermark(ctx, canvas.width, canvas.height)
  }

  /**
   * Resolves with whatever the recorder produced. Gives up after STOP_TIMEOUT,
   * since WebKit doesn't always fire `stop`, and a hung promise left the
   * Clip button stuck on "Saving…".
   */
  stop(): Promise<Blob> {
    this.stopping = true
    return new Promise((resolve, reject) => {
      let done = false
      const finish = (why?: string) => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        this.release()
        if (why) this.problem ??= why
        const bytes = this.chunks.reduce((n, c) => n + c.size, 0)
        if (bytes > 0) resolve(new Blob(this.chunks, { type: this.type.split(';')[0] }))
        else reject(new Error(`${this.problem ?? 'no video data'} (${this.frames} frames drawn, state ${this.recorder.state})`))
      }
      const timer = window.setTimeout(() => finish(`no stop event after ${STOP_TIMEOUT / 1000} s`), STOP_TIMEOUT)
      if (this.ended) return finish()
      this.recorder.addEventListener('stop', () => finish(), { once: true })
      // Already stopped but its last data and `stop` event are still on the way.
      if (this.recorder.state === 'inactive') return
      try {
        this.recorder.stop()
      } catch (err) {
        finish(`stop failed: ${String(err)}`)
      }
    })
  }

  /** Stop the canvas track; the audio track belongs to the engine and keeps running. */
  private release() {
    for (const track of this.recorder.stream.getVideoTracks()) track.stop()
  }
}

/** "Skyloom" and the site's address, small in the bottom-right corner. */
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
  ctx.fillText('Skyloom', w - pad, y)
  ctx.restore()
}
