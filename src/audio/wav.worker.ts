import { encodeWavData } from './wav'

/** Encodes a recording's samples as WAV off the main thread; see encodeWav(). */
self.onmessage = (e: MessageEvent<{ data: Float32Array[]; sampleRate: number }>) => {
  const wav = encodeWavData(e.data.data, e.data.sampleRate)
  self.postMessage(wav, { transfer: [wav] })
}
