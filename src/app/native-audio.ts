import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { createStore } from './store'

/**
 * The iOS app's audio session plugin (ios/App/App/AudioSessionPlugin.swift).
 * It sets the session to playback that mixes with other apps' audio, and
 * reports interruptions, headphones going away and returns to the foreground,
 * which the web view never hears about. On the web none of this exists.
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

/**
 * Whether the iOS app also asks WebKit for 'playback', as the website does.
 * Off by default: then WebKit picks 'ambient' for its own media process while
 * the app's session is playback with mixing, and it's not yet known which of
 * the two decides the silent switch and background playback on a device.
 * A debug-badge switch, remembered on the device, so one build can test both.
 */
const WEB_PLAYBACK_KEY = 'skyloom:web-playback'
export const webPlayback = createStore({
  on: (() => {
    try {
      return localStorage.getItem(WEB_PLAYBACK_KEY) === '1'
    } catch {
      return false
    }
  })(),
})

/** Sets the web view's own audio session type to match the switch. */
export function applyWebSession() {
  const nav = navigator as Navigator & { audioSession?: { type: string } }
  if (!nav.audioSession) return
  // The website always asks for 'playback' so the mute switch doesn't silence it.
  nav.audioSession.type = !hasNativeAudio || webPlayback.get().on ? 'playback' : 'auto'
}

export function toggleWebPlayback() {
  webPlayback.set((s) => ({ on: !s.on }))
  try {
    localStorage.setItem(WEB_PLAYBACK_KEY, webPlayback.get().on ? '1' : '0')
  } catch {
    // Private mode: the switch still applies for this session.
  }
  applyWebSession()
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
      label = `${s.category}${opts} · ${s.output || 'no output'}${s.otherAudio ? ' · other audio' : ''}`
    },
    (err) => {
      label = `native error: ${err instanceof Error ? err.message : String(err)}`
    },
  )
}
