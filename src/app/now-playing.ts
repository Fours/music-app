import { noteAudio } from './audio-log'
import type { Store, UIState } from './store'

/**
 * The lock screen's and Control Center's Now Playing card, through the Media
 * Session API. In the iOS app, WebKit already puts a card up for the page's
 * Web Audio, from the process that plays it, so iOS knows when Skyloom is
 * playing. The page only fills it in: the scene's name, Skyloom, the icon,
 * and what Play and Pause do (milestone 2, T7). Safari on an iPhone gets the
 * same card for the website.
 */

/** The scene's name without the top bar's "(edited)". */
function title(s: UIState) {
  return s.sceneName.replace(/ \(edited\)$/, '')
}

/**
 * Keeps the card in step with the app, and passes its buttons on (AirPods
 * too). Starts after Begin, so the card only appears once Skyloom has played.
 */
export function connectNowPlaying(ui: Store<UIState>, controls: { play(): void; pause(): void }) {
  const session = navigator.mediaSession
  if (!session || typeof MediaMetadata === 'undefined') return

  let shownTitle = ''
  const update = () => {
    const s = ui.get()
    if (title(s) !== shownTitle) {
      shownTitle = title(s)
      session.metadata = new MediaMetadata({
        title: shownTitle,
        artist: 'Skyloom',
        artwork: [{ src: '/now-playing.png', sizes: '512x512', type: 'image/png' }],
      })
    }
    session.playbackState = s.playing ? 'playing' : 'paused'
  }
  ui.subscribe(update)
  update()

  // The music never ends: no time or scrubber, where the browser understands that.
  try {
    session.setPositionState({ duration: Infinity })
  } catch {
    // Not every browser takes an endless duration.
  }

  const press = (command: 'play' | 'pause') => () => {
    const playing = ui.get().playing
    noteAudio(`lock screen: ${command}${playing === (command === 'play') ? ' (already)' : ''}`)
    if (command === 'play') controls.play()
    else controls.pause()
  }
  session.setActionHandler('play', press('play'))
  session.setActionHandler('pause', press('pause'))
  // Nothing to skip to or seek through.
  for (const action of ['previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'] as const) {
    try {
      session.setActionHandler(action, null)
    } catch {
      // An action this browser doesn't know.
    }
  }
}
