import * as Tone from 'tone'
import { engine } from '../audio/engine'
import { encodeWav } from '../audio/wav'
import { KIND_LABELS, cloneObject, makeObject } from '../world/objects'
import { harmonyOf } from '../world/pitch'
import { PRESETS } from '../world/presets'
import { World } from '../world/sim'
import { LIMITS, type Kind, type Scene, type Settings, type WorldObject } from '../world/types'
import { createStore, type UIState } from './store'

const TICK = 0.025

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
    sceneName: '',
    presetId: null,
    settings: PRESETS[0].build().settings,
    version: 0,
    recordingSince: null,
    saving: false,
    panel: 'none',
    toast: null,
    objectCount: 0,
  })
  private audioDriven = false
  private toastTimer = 0

  constructor() {
    this.loadPreset(PRESETS[0].id)
  }

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
    engine.applySettings(this.settings)
    engine.sync(this.world.objects, harmonyOf(this.settings))
    // Events stamped on the old clock would flash forever; reset them.
    for (const rt of this.world.rt.values()) {
      rt.flash = -10
      rt.lastHit = -10
      rt.lit = rt.lit.map(() => -10)
      rt.ripples = []
    }
    const transport = Tone.getTransport()
    transport.scheduleRepeat((time) => this.tick(time), TICK)
    transport.start('+0.05')
    this.audioDriven = true
    engine.setPaused(false, this.settings.volume)
    this.ui.set({ phase: 'running', playing: true })
  }

  private tick(time: number) {
    const s = this.settings
    const h = harmonyOf(s)
    const events = this.world.step(TICK, time, s)
    engine.sync(this.world.objects, h, time)
    for (const e of events) {
      const o = this.world.objects.find((x) => x.id === e.id)
      if (o) engine.play(e, o, h)
    }
    if (this.world.mutated) {
      this.world.mutated = false
      this.bump()
    }
  }

  togglePlay() {
    const { phase, playing } = this.ui.get()
    if (phase !== 'running') return
    const transport = Tone.getTransport()
    if (playing) {
      transport.pause()
      engine.setPaused(true, this.settings.volume)
    } else {
      transport.start('+0.05')
      engine.setPaused(false, this.settings.volume)
    }
    this.ui.set({ playing: !playing })
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
  }

  // --------------------------------------------------------- recording

  get canRecord(): boolean {
    return Tone.Recorder.supported
  }

  async toggleRecording() {
    const { recordingSince, phase, saving } = this.ui.get()
    if (phase !== 'running' || saving) return
    if (recordingSince === null) {
      await engine.recorder.start()
      this.ui.set({ recordingSince: Date.now() })
      return
    }
    this.ui.set({ recordingSince: null, saving: true })
    try {
      const blob = await engine.recorder.stop()
      const decoded = await Tone.getContext().rawContext.decodeAudioData(await blob.arrayBuffer())
      const wav = encodeWav(decoded as AudioBuffer)
      const name = `drift-${slug(this.ui.get().sceneName) || 'session'}-${stamp()}.wav`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(wav)
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      this.toast(`Saved ${name}`)
    } catch (err) {
      console.error(err)
      this.toast('Sorry, that recording could not be saved')
    } finally {
      this.ui.set({ saving: false })
    }
  }

  toast(text: string) {
    window.clearTimeout(this.toastTimer)
    this.ui.set({ toast: { id: Date.now(), text } })
    this.toastTimer = window.setTimeout(() => this.ui.set({ toast: null }), 3800)
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
