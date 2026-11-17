import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * The iOS app's audio session plugin (ios/App/App/AudioSessionPlugin.swift).
 * It reports interruptions, headphones going away and returns to the
 * foreground, which the web view never hears about, and whether another app
 * is playing. The sound itself plays in WebKit's own session, which the page
 * sets to 'playback' (see decision 0002). On the web none of this exists.
 */
export interface SessionState {
  category: string
  options: string[]
  mixing: boolean
  otherAudio: boolean
  output: string
}

export interface InterruptionEvent {
  phase: 'began' | 'ended'
  /** On `ended`: whether iOS says the app should start playing again. */
  shouldResume?: boolean
  /** On `began`. */
  reason?: string
}

interface AudioSessionPlugin {
  getState(): Promise<SessionState>
  /** Puts the session back to playback with mixing if something changed it. */
  apply(): Promise<{ reapplied: boolean; was: string }>
  addListener(event: 'interruption', fn: (e: InterruptionEvent) => void): Promise<PluginListenerHandle>
  addListener(event: 'sessionReset', fn: (e: { was: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'headphonesGone' | 'foreground' | 'mediaReset', fn: () => void): Promise<PluginListenerHandle>
}

export const hasNativeAudio = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

export const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession')

/** Whether another app is playing audio. Always false on the web. */
export async function otherAudioPlaying(): Promise<boolean> {
  if (!hasNativeAudio) return false
  try {
    return (await AudioSession.getState()).otherAudio
  } catch {
    return false
  }
}

/** The native session as the debug badge shows it, refreshed by refreshSession(). */
let label = hasNativeAudio ? 'native …' : ''
let lastRefresh = 0

export function nativeSessionLabel(): string {
  return label
}

/** Asks the plugin for the session again, at most every 2 seconds. */
export function refreshSession() {
  if (!hasNativeAudio || performance.now() - lastRefresh < 2000) return
  lastRefresh = performance.now()
  AudioSession.getState().then(
    (s) => {
      const opts = s.options.length ? ` + ${s.options.join(' + ')}` : ''
      label = `app ${s.category}${opts} · ${s.output || 'no output'}${s.otherAudio ? ' · other audio' : ''}`
    },
    (err) => {
      label = `native error: ${err instanceof Error ? err.message : String(err)}`
    },
  )
}
