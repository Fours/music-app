/** Encodes up to two channels of samples as a 16-bit PCM WAV file. */
export function encodeWavData(data: Float32Array[], sampleRate: number): ArrayBuffer {
  const channels = Math.min(2, data.length)
  const frames = data[0]?.length ?? 0
  const bytes = 44 + frames * channels * 2
  const view = new DataView(new ArrayBuffer(bytes))
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, bytes - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * channels * 2, true)
  let at = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      at += 2
    }
  }
  return view.buffer
}

/**
 * Encodes an AudioBuffer as a WAV file in a worker, so a long recording
 * doesn't stall the music while it converts. The samples are copied out of
 * the buffer once and handed to the worker without another copy. If no
 * worker can start, it encodes here instead.
 */
export async function encodeWav(buffer: AudioBuffer): Promise<Blob> {
  const data = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => {
    const samples = new Float32Array(buffer.length)
    buffer.copyFromChannel(samples, c)
    return samples
  })
  let worker: Worker
  try {
    worker = new Worker(new URL('./wav.worker.ts', import.meta.url), { type: 'module' })
  } catch (err) {
    console.warn(`No WAV worker, encoding on the main thread: ${String(err)}`)
    return new Blob([encodeWavData(data, buffer.sampleRate)], { type: 'audio/wav' })
  }
  const wav = await new Promise<ArrayBuffer>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ArrayBuffer>) => resolve(e.data)
    worker.onerror = (e) => reject(new Error(`WAV encoding failed: ${e.message || 'worker error'}`))
    worker.postMessage(
      { data, sampleRate: buffer.sampleRate },
      data.map((d) => d.buffer),
    )
  }).finally(() => worker.terminate())
  return new Blob([wav], { type: 'audio/wav' })
}
