import { Capacitor } from '@capacitor/core'
import * as Tone from 'tone'
import { engine } from '../audio/engine'
import { encodeWav } from '../audio/wav'
import { KIND_LABELS, cloneObject, makeObject } from '../world/objects'
import { harmonyOf } from '../world/pitch'
import { PRESETS } from '../world/presets'
import { World } from '../world/sim'
import { LIMITS, type Kind, type Scene, type Settings, type WorldObject } from '../world/types'
import { noteAudio } from './audio-log'
import { ClipRecorder, clipType } from './clip'
import { AudioSession, hasNativeAudio, otherAudioPlaying } from './native-audio'
import { clearShareFiles, openShareSheet, writeShareFile } from './share'
import { readSaved, writeSaved } from './storage'
import { createStore, type CaptureKind, type Preview, type UIState } from './store'

const TICK = 0.025
const MAX_CLIP_SECONDS = 300
/** How long the audio clock may stand still while playing before the watchdog acts (ms). */
const STALL_MS = 3000
/** How long the watchdog rests after any recovery attempt (ms). */
const REST_MS = 15000
const MAX_REBUILDS = 3

/**
 * The app's single source of truth outside React. The simulation runs on the
 * audio clock (Tone's worker-driven transport), so the music keeps playing in
 * a background tab; the canvas just draws whatever state it finds.
 */
export class Controller {
  world = new World()
  ui = createStore<UIState>({
    phase: 'welcome',
    loadProgress: 0,
    playing: false,
    selectedId: null,
    dragging: false,
    sceneName: '',
    presetId: null,
    settings: PRESETS[0].build().settings,
    version: 0,
    capture: null,
    preview: null,
    panel: 'none',
    toast: null,
    objectCount: 0,
  })
  private audioDriven = false
  private toastTimer = 0
  /** Simulation steps run so far, and the longest wall-clock gap between two (ms). For the debug badge. */
  ticks = 0
  maxTickGap = 0
  /** Steps that ran after their own start time, so their notes played late. A sign of audio glitches. */
  lateTicks = 0
  private lastTickAt = 0

  constructor() {
    this.loadPreset(PRESETS[0].id)
  }

  private restored: Promise<void> | null = null

  /**
   * Loads the autosaved scene, then starts autosaving. Reading the save is
   * async in the iOS app, so main.tsx waits for this before the first render.
   * Autosave starts only afterwards, so the default scene can't overwrite the
   * save while it loads.
   */
  restore(): Promise<void> {
    return (this.restored ??= readSaved(SAVE_KEY)
      .then((raw) => {
        const saved = parseSaved(raw)
        if (saved) this.loadScene(saved.scene, saved.presetId)
      })
      .catch((err) => console.warn(`Could not load the saved scene: ${String(err)}`))
      .finally(() => this.autosave()))
  }

  /** Saves whenever the scene changes, so a reload picks up where you left off. */
  private autosave() {
    let last = this.saveKey()
    let timer = 0
    const flush = () => {
      if (!timer) return
      window.clearTimeout(timer)
      timer = 0
      this.save()
    }
    this.ui.subscribe(() => {
      const key = this.saveKey()
      if (key === last) return
      last = key
      window.clearTimeout(timer)
      timer = window.setTimeout(flush, 600)
    })
    // Leaving the app comes before any force-quit, so a change made just before can't be lost.
    // `pause` is Capacitor's event for the app going to the background.
    document.addEventListener('pause', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => document.hidden && flush())
  }

  private saveKey() {
    const { version, settings } = this.ui.get()
    return version * 1000 + Math.round(settings.volume * 100)
  }

  private save() {
    const { sceneName, settings, presetId } = this.ui.get()
    const scene: Scene = { name: sceneName, settings, objects: this.world.objects }
    void writeSaved(SAVE_KEY, JSON.stringify({ v: 2, presetId, scene }))
  }

  /** Each object's slider values this tick, for the audio. */
  private live = (o: WorldObject) => ({ volume: this.world.live(o, 'volume'), cutoff: this.world.live(o, 'cutoff') })

  get settings(): Settings {
    return this.ui.get().settings
  }

  /** The clock that simulation events are stamped with. */
  now(): number {
    return this.audioDriven ? Tone.getContext().currentTime : performance.now() / 1000
  }

  /** Before audio starts, the canvas animates silently on animation frames. */
  frame(dt: number) {
    if (this.audioDriven) return
    this.world.step(Math.min(dt, 0.05), performance.now() / 1000, this.settings)
  }

  async begin() {
    if (this.ui.get().phase !== 'welcome') return
    this.ui.set({ phase: 'loading', loadProgress: 0 })
    try {
      await engine.init((p) => this.ui.set({ loadProgress: p }))
    } catch (err) {
      console.error(err)
      this.ui.set({ phase: 'welcome' })
      this.toast('Your browser blocked audio. Try again?')
      return
    }
    this.connectAudio(true)
    this.ui.set({ phase: 'running', playing: true })
    this.keepAudioAwake()
    this.listenToNativeAudio()
    void this.checkSession('after starting audio')
  }

  /**
   * Hooks the simulation up to the current audio context: at the start, and
   * again after the engine is rebuilt with a new context.
   */
  private connectAudio(playing: boolean) {
    engine.applySettings(this.settings)
    engine.sync(this.world.objects, harmonyOf(this.settings), Tone.now(), this.live)
    // Events stamped on the old clock would flash forever; reset them.
    for (const rt of this.world.rt.values()) {
      rt.flash = -10
      rt.lastHit = -10
      rt.lit = rt.lit.map(() => -10)
      rt.ripples = []
    }
    const transport = Tone.getTransport()
    transport.scheduleRepeat((time) => this.tick(time), TICK)
    if (playing) transport.start('+0.05')
    this.audioDriven = true
    engine.setPaused(!playing, this.settings.volume)
    Tone.getContext().rawContext.addEventListener('statechange', this.wake)
  }

  private waitingForTap = false

  /**
   * iOS stops the audio when the app leaves the screen and may not restart it
   * on return, which leaves the app silent while it looks like it's playing.
   * Restart it whenever the page is shown again or the context stops. If the
   * system only allows that from a touch, do it on the next tap.
   *
   * Skyloom doesn't mix with other apps' audio (decision 0002): if another app
   * took over while we were away, show Skyloom as paused instead of taking the
   * audio back, as other iOS players do.
   */
  private wake = async () => {
    if (document.visibilityState !== 'visible' || !this.ui.get().playing) return
    if (engine.context().state !== 'running' && (await otherAudioPlaying())) {
      noteAudio('another app is playing: paused')
      this.pause()
      return
    }
    if ((await engine.wake()) || this.waitingForTap) return
    this.waitingForTap = true
    const onTap = () => {
      this.waitingForTap = false
      void engine.wake()
    }
    window.addEventListener('pointerdown', onTap, { once: true, capture: true })
  }

  /**
   * The iOS app's plugin hears what the web view doesn't: calls and Siri,
   * headphones going away, and the session being changed under us.
   */
  private listenToNativeAudio() {
    if (!hasNativeAudio) return
    // A call or Siri: show it as paused, and play again afterwards only if iOS says to.
    void AudioSession.addListener('interruption', (e) => {
      if (e.phase === 'began') {
        const playing = this.ui.get().playing
        noteAudio(`interrupted (${e.reason ?? 'default'})${playing ? ': paused' : ''}`, 'interruptions')
        if (!playing) return
        this.pause()
        this.resumeAfterInterruption = true
      } else if (e.shouldResume && this.resumeAfterInterruption) {
        noteAudio('interruption ended: playing again')
        this.play()
        // Outside a tap the context may not restart; wake() falls back to the next tap.
        void this.wake()
      } else {
        noteAudio(`interruption ended${this.resumeAfterInterruption ? ', iOS says not to resume' : ''}`)
        this.resumeAfterInterruption = false
      }
    })
    void AudioSession.addListener('headphonesGone', () => {
      noteAudio(`headphones disconnected${this.ui.get().playing ? ': paused' : ''}`)
      if (!this.ui.get().playing) return
      this.pause()
      this.toast('Paused because your headphones disconnected')
    })
    void AudioSession.addListener('foreground', () => void this.wake())
    void AudioSession.addListener('sessionReset', (e) => noteAudio(`session changed to ${e.was}; set it back`))
    void AudioSession.addListener('mediaReset', () => noteAudio('iOS audio services restarted'))
  }

  /** Set when an interruption paused the music, so its end can start it again. Play or Pause clears it. */
  private resumeAfterInterruption = false

  /** Whether WebKit changed the native session when audio started; if it did, set it back. */
  private async checkSession(when: string) {
    if (!hasNativeAudio) return
    try {
      const { reapplied, was } = await AudioSession.apply()
      noteAudio(reapplied ? `session was ${was} ${when}; set it back` : `session ${was} ${when}`)
    } catch (err) {
      noteAudio(`session check failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private keepAudioAwake() {
    document.addEventListener('visibilitychange', this.wake)
    window.addEventListener('pageshow', this.wake)
    this.watchAudioClock()
  }

  /**
   * After some interruptions iOS reports the context as running while its
   * clock stands still: no sound, and no animation, since the simulation runs
   * on that clock. resume() can't help, because as far as WebKit knows it is
   * running. Watch the clock while music plays, and if it stops, restart it.
   *
   * Rebuilding is expensive (the reverb is regenerated), so the watchdog is
   * deliberately slow to act, rests after every attempt, and gives up after a
   * few rebuilds until Play is pressed again.
   */
  private watchAudioClock() {
    let clock = -1
    let since = 0
    let restUntil = 0
    let busy = false
    window.setInterval(async () => {
      const ctx = engine.context()
      const now = performance.now()
      const watching =
        engine.ready &&
        this.ui.get().playing &&
        document.visibilityState === 'visible' &&
        ctx.state === 'running' &&
        this.rebuildsLeft > 0
      if (busy || !watching || now < restUntil) {
        clock = -1
        return
      }
      if (ctx.currentTime !== clock) {
        clock = ctx.currentTime
        since = now
        return
      }
      if (now - since < STALL_MS) return
      busy = true
      clock = -1
      try {
        await this.recoverFrozenAudio()
      } finally {
        busy = false
        restUntil = performance.now() + REST_MS
      }
    }, 500)
  }

  /** Full rebuilds allowed before the watchdog waits for Play. Play resets it. */
  private rebuildsLeft = MAX_REBUILDS

  private async recoverFrozenAudio() {
    noteAudio(`clock stopped for ${STALL_MS / 1000} s while playing`)
    try {
      if (await engine.kick()) {
        noteAudio('clock restarted by suspend and resume', 'kicks')
        return
      }
      this.rebuildsLeft--
      noteAudio('rebuilding the audio engine', 'rebuilds')
      this.abortCapture()
      await engine.rebuild()
      this.connectAudio(this.ui.get().playing)
      noteAudio(`new audio context is ${engine.context().state}`)
      void this.checkSession('after the rebuild')
      if (this.rebuildsLeft === 0) noteAudio('no more rebuilds until Play is pressed')
      // Outside a tap the new context may start suspended; wake() falls back to the next tap.
      void this.wake()
    } catch (err) {
      console.error(err)
      noteAudio(`recovery failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** A recording or clip can't survive the engine being replaced. */
  private abortCapture() {
    if (!this.ui.get().capture) return
    window.clearTimeout(this.clipTimer)
    this.clip = null
    this.ui.set({ capture: null })
    this.toast('Recording stopped because the audio restarted')
  }

  private tick(time: number) {
    const now = performance.now()
    if (this.lastTickAt) this.maxTickGap = Math.max(this.maxTickGap, now - this.lastTickAt)
    this.lastTickAt = now
    this.ticks++
    // Tone runs each step up to 120 ms ahead of time; if the main thread stalled
    // longer than that, the step's notes were already due when it ran.
    if (time < Tone.getContext().rawContext.currentTime) this.lateTicks++
    const s = this.settings
    const h = harmonyOf(s)
    const events = this.world.step(TICK, time, s)
    engine.sync(this.world.objects, h, time, this.live)
    for (const e of events) {
      const o = this.world.objects.find((x) => x.id === e.id)
      if (o) engine.play(e, o, h)
    }
    if (this.world.mutated) {
      this.world.mutated = false
      this.bump()
    }
  }

  /** Play one orbit step right away, so editing a note lets you hear it. */
  previewStep(id: string, bead: number) {
    const { phase, playing } = this.ui.get()
    const o = this.find(id)
    if (phase !== 'running' || !playing || o?.kind !== 'orbit') return
    const time = Tone.now() + 0.02
    this.world.runtime(o).lit[bead] = time
    engine.play({ type: 'orbit', id, time, bead }, o, harmonyOf(this.settings))
  }

  togglePlay() {
    this.resumeAfterInterruption = false
    if (this.ui.get().playing) this.pause()
    else this.play()
  }

  play() {
    const { phase, playing } = this.ui.get()
    if (phase !== 'running' || playing) return
    // Play is a tap, so it can also restart audio the system stopped,
    // and it lets the watchdog try rebuilding again.
    void engine.wake()
    this.rebuildsLeft = MAX_REBUILDS
    Tone.getTransport().start('+0.05')
    engine.setPaused(false, this.settings.volume)
    this.ui.set({ playing: true })
  }

  pause() {
    const { phase, playing } = this.ui.get()
    if (phase !== 'running' || !playing) return
    Tone.getTransport().pause()
    // A recording or clip keeps capturing while paused, so only suspend the audio once it ends.
    engine.setPaused(true, this.settings.volume, !this.ui.get().capture)
    this.ui.set({ playing: false })
  }

  // ------------------------------------------------------------ scenes

  loadScene(scene: Scene, presetId: string | null) {
    this.world.objects = structuredClone(scene.objects)
    this.world.rt.clear()
    this.world.held.clear()
    this.ui.set((s) => ({
      sceneName: scene.name,
      presetId,
      selectedId: null,
      settings: { ...scene.settings, volume: s.phase === 'welcome' ? scene.settings.volume : s.settings.volume },
      version: s.version + 1,
      objectCount: scene.objects.length,
      panel: 'none',
    }))
    engine.applySettings(this.settings)
  }

  loadPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id)
    if (p) this.loadScene(p.build(), p.id)
  }

  clear() {
    this.loadScene({ name: 'Untitled', settings: this.settings, objects: [] }, null)
  }

  // ----------------------------------------------------------- objects

  find(id: string | null): WorldObject | undefined {
    return id ? this.world.objects.find((o) => o.id === id) : undefined
  }

  add(kind: Kind, x?: number, y?: number): WorldObject | null {
    const count = this.world.objects.filter((o) => o.kind === kind).length
    if (count >= LIMITS[kind]) {
      this.toast(`${LIMITS[kind]} ${KIND_LABELS[kind].name.toLowerCase()}s is plenty — try changing one instead`)
      return null
    }
    const o = makeObject(kind, x ?? 0.2 + Math.random() * 0.6, y ?? 0.25 + Math.random() * 0.5)
    this.world.objects.push(o)
    this.select(o.id)
    this.edited()
    return o
  }

  duplicate(id: string) {
    const o = this.find(id)
    if (!o) return
    if (this.world.objects.filter((x) => x.kind === o.kind).length >= LIMITS[o.kind]) {
      this.toast(`${LIMITS[o.kind]} ${KIND_LABELS[o.kind].name.toLowerCase()}s is plenty`)
      return
    }
    const copy = cloneObject(o)
    this.world.objects.push(copy)
    this.select(copy.id)
    this.edited()
  }

  remove(id: string) {
    this.world.objects = this.world.objects.filter((o) => o.id !== id)
    this.world.held.delete(id)
    if (this.ui.get().selectedId === id) this.select(null)
    this.edited()
  }

  update(id: string, patch: Partial<WorldObject>) {
    const o = this.find(id)
    if (!o) return
    Object.assign(o, patch)
    this.edited()
  }

  /** Mark the scene as the user's own once they change it. */
  edited() {
    this.ui.set((s) => ({
      version: s.version + 1,
      objectCount: this.world.objects.length,
      presetId: null,
      sceneName: s.presetId ? `${s.sceneName} (edited)` : s.sceneName,
    }))
  }

  bump() {
    this.ui.set((s) => ({ version: s.version + 1 }))
  }

  select(id: string | null) {
    if (this.ui.get().selectedId === id) return
    this.ui.set({ selectedId: id, panel: id ? 'none' : this.ui.get().panel })
  }

  setSettings(patch: Partial<Settings>) {
    this.ui.set((s) => ({ settings: { ...s.settings, ...patch } }))
    engine.applySettings(this.settings)
    if (Object.keys(patch).some((k) => k !== 'volume')) this.edited()
  }

  // --------------------------------------------------------- recording

  get canRecord(): boolean {
    return Tone.Recorder.supported
  }

  get canClip(): boolean {
    return clipType() !== null
  }

  /** The video clip being recorded, which the draw loop paints into. */
  clip: ClipRecorder | null = null
  private clipTimer = 0

  async toggleCapture(kind: CaptureKind) {
    const { capture, phase } = this.ui.get()
    if (phase !== 'running') return
    if (!capture) return this.startCapture(kind)
    if (capture.kind === kind && !capture.saving) return this.stopCapture()
  }

  private async startCapture(kind: CaptureKind) {
    try {
      // Paused audio is suspended, and a capture needs it running. This is a tap, so it can resume it.
      await engine.wake()
      if (kind === 'audio') {
        await engine.recorder.start()
      } else {
        const type = clipType()
        if (!type) return
        const { width, height } = this.world
        this.clip = new ClipRecorder(engine.stream.stream, width, height, type)
        this.clip.start()
        this.clipTimer = window.setTimeout(() => {
          this.toast('Clips stop at 5 minutes')
          void this.stopCapture()
        }, MAX_CLIP_SECONDS * 1000)
      }
      this.ui.set({ capture: { kind, since: Date.now(), saving: false } })
    } catch (err) {
      console.error(err)
      this.clip = null
      this.toast(kind === 'audio' ? 'Sorry, recording could not start' : 'Sorry, this browser could not record a clip')
    }
  }

  private async stopCapture() {
    const capture = this.ui.get().capture
    if (!capture || capture.saving) return
    this.ui.set({ capture: { ...capture, saving: true } })
    const base = `skyloom-${slug(this.ui.get().sceneName) || 'session'}-${stamp()}`
    try {
      if (capture.kind === 'audio') {
        const blob = await engine.recorder.stop()
        const decoded = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer())
        const wav = await encodeWav(decoded as AudioBuffer)
        this.deliver(wav, `${base}.wav`, { kind: 'audio', seconds: decoded.duration })
      } else {
        window.clearTimeout(this.clipTimer)
        const clip = this.clip!
        this.clip = null
        const frames = { drawn: clip.frames, expected: clip.expectedFrames, width: clip.width, height: clip.height }
        const blob = await clip.stop()
        this.deliver(blob, `${base}.${clip.extension}`, {
          kind: 'video',
          seconds: (Date.now() - capture.since) / 1000,
          frames,
          problem: clip.problem,
          type: clip.type,
          poster: clip.poster,
        })
      }
    } catch (err) {
      console.error(err)
      // While the app is being tested on devices, say why, so a failure can be reported.
      const why = err instanceof Error ? `: ${err.message}` : ''
      this.toast(`Sorry, that ${capture.kind === 'audio' ? 'recording' : 'clip'} could not be saved${why}`, why ? 10000 : 3800)
    } finally {
      this.ui.set({ capture: null })
      if (!this.ui.get().playing) engine.setPaused(true, this.settings.volume)
    }
  }

  /** The finished file behind the preview, and where it was written for sharing. */
  private previewBlob: Blob | null = null
  private shareUri: Promise<string> | null = null
  /** The scene was playing when the preview started playing, so it plays again when the preview closes. */
  private resumeAfterPreview = false

  /**
   * Download links do nothing inside the iOS app, so there the recording opens
   * in a preview with a Share button instead. The web build downloads it.
   */
  private deliver(
    blob: Blob,
    name: string,
    { poster, ...info }: Pick<Preview, 'kind' | 'seconds' | 'frames' | 'problem'> & { type?: string; poster?: Blob | null },
  ) {
    if (!Capacitor.isNativePlatform()) return this.download(blob, name)
    this.clearPreview()
    this.previewBlob = blob
    this.ui.set({
      preview: {
        ...info,
        url: URL.createObjectURL(blob),
        poster: poster ? URL.createObjectURL(poster) : undefined,
        name,
        type: info.type ?? blob.type,
        bytes: blob.size,
        sharing: false,
      },
    })
  }

  /** Opens the share sheet for the previewed file, writing it to disk the first time. */
  async share() {
    const preview = this.ui.get().preview
    const blob = this.previewBlob
    if (!preview || !blob || preview.sharing) return
    const setSharing = (sharing: boolean) =>
      this.ui.set((s) => (s.preview?.url === preview.url ? { preview: { ...s.preview, sharing } } : {}))
    setSharing(true)
    try {
      let uri: string
      try {
        // Clearing first also removes anything left by a share that was cut short.
        this.shareUri ??= clearShareFiles().then(() => writeShareFile(blob, preview.name))
        uri = await this.shareUri
      } catch (err) {
        console.error(err)
        this.shareUri = null
        const why = err instanceof Error ? `: ${err.message}` : ''
        this.toast(`Sorry, the file could not be written${why}`, 10000)
        return
      }
      try {
        await openShareSheet(uri)
      } catch (err) {
        console.error(err)
        // The share sheet reports every failure the same way, including Save
        // Video when Skyloom isn't allowed to add to Photos.
        this.toast(
          preview.kind === 'video'
            ? 'Sorry, that didn’t work. To save clips to Photos, allow Skyloom to add photos in Settings.'
            : 'Sorry, that recording could not be saved or shared',
          8000,
        )
      }
    } finally {
      setSharing(false)
    }
  }

  /** The preview's player started: pause the scene so it can be heard on its own. */
  previewPlaying() {
    if (!this.ui.get().playing) return
    this.resumeAfterPreview = true
    this.pause()
  }

  /** Closes the preview from a tap, and plays the scene again if the preview paused it. */
  closePreview() {
    if (!this.ui.get().preview) return
    this.clearPreview()
    if (this.resumeAfterPreview) this.play()
    this.resumeAfterPreview = false
  }

  private clearPreview() {
    const preview = this.ui.get().preview
    if (!preview) return
    URL.revokeObjectURL(preview.url)
    if (preview.poster) URL.revokeObjectURL(preview.poster)
    this.previewBlob = null
    if (this.shareUri) void clearShareFiles()
    this.shareUri = null
    this.ui.set({ preview: null })
  }

  private download(blob: Blob, name: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    this.toast(`Saved ${name}`)
  }

  toast(text: string, ms = 3800) {
    window.clearTimeout(this.toastTimer)
    this.ui.set({ toast: { id: Date.now(), text } })
    this.toastTimer = window.setTimeout(() => this.ui.set({ toast: null }), ms)
  }
}

/** From when the app was called Drift. Users never see it, and renaming it would only add a migration. */
const SAVE_KEY = 'drift:scene'

function parseSaved(raw: string | null): { scene: Scene; presetId: string | null } | null {
  try {
    if (!raw) return null
    const data = JSON.parse(raw)
    if ((data?.v !== 1 && data?.v !== 2) || !Array.isArray(data.scene?.objects)) return null
    // v1 stored volumes for a linear slider; move them to the same loudness on the decibel slider.
    if (data.v === 1) {
      const toDb = (v: unknown, ref: number) =>
        typeof v === 'number' && v > 0
          ? Math.round(Math.max(0.1, Math.min(1, ref + (20 * Math.log10(v / ref)) / 36)) * 100) / 100
          : v
      for (const o of data.scene.objects) o.volume = toDb(o.volume, 0.75)
      if (data.scene.settings) data.scene.settings.volume = toDb(data.scene.settings.volume, 0.8)
    }
    // Repair positions from older saves that could store null (from NaN).
    const pos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0.5)
    for (const o of data.scene.objects) {
      o.x = pos(o.x)
      o.y = pos(o.y)
    }
    return { scene: data.scene, presetId: data.presetId ?? null }
  } catch {
    return null
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(edited\)/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export const app = new Controller()
