import * as Tone from 'tone'

/** Seconds of delay sweep that bends pitch by `cents` at its peak, for a sine LFO at `hz`. */
const sweep = (cents: number, hz: number) => (2 ** (cents / 1200) - 1) / (2 * Math.PI * hz)

/**
 * Pitch wobble from a short delay whose length is swept by an LFO, the way a
 * tape machine's speed wanders. The LFO's range is fixed at full depth and its
 * `amplitude` sets how much of it is used, so depth changes ramp without clicks.
 */
function wobbler(hz: number, cents: number) {
  const depth = sweep(cents, hz)
  const centre = depth + 0.001
  const delay = new Tone.Delay({ delayTime: centre, maxDelay: centre * 2 + 0.002 })
  const lfo = new Tone.LFO({
    frequency: hz,
    min: centre - depth,
    max: centre + depth,
    amplitude: 0,
    phase: Math.random() * 360,
  })
  lfo.connect(delay.delayTime).start()
  return { delay, lfo }
}

/** Slider (0–1) to effect amount. Curved so the low end stays subtle. */
const curve = (v = 0) => Math.max(0, Math.min(1, v)) ** 1.5

/**
 * An analog tape stage for the whole mix:
 * - Wow: slow drift in pitch, two incommensurate LFOs so it wanders rather than cycles.
 * - Flutter: a fast, shallow warble.
 * - Wear: soft saturation, a duller top end, a small low bump and hiss.
 * At zero everything is neutral and the hiss source is stopped.
 */
export class Tape {
  readonly input = new Tone.Gain(1)
  readonly output = new Tone.Gain(1)
  private wow = [wobbler(0.31, 12), wobbler(0.73, 8)]
  private flutter = [wobbler(6.4, 7)]
  private drive = new Tone.Gain(0.0625)
  private makeup = new Tone.Gain(4)
  private highCut = new Tone.Filter({ type: 'lowpass', frequency: 20000, rolloff: -12, Q: 0.5 })
  private headBump = new Tone.Filter({ type: 'lowshelf', frequency: 110, gain: 0 })
  private hiss = new Tone.Noise('pink')
  private hissLevel = new Tone.Gain(0)
  private wearing = false

  constructor() {
    // tanh over ±4, so the shaper's ±1 input range covers four times the driven signal.
    const shaper = new Tone.WaveShaper((x) => Math.tanh(x * 4), 4096)
    shaper.oversample = '2x'
    const stages = [...this.wow, ...this.flutter].map((w) => w.delay)
    this.input.chain(...stages, this.drive, shaper, this.makeup, this.headBump, this.highCut, this.output)
    const hissBand = new Tone.Filter({ type: 'bandpass', frequency: 3500, Q: 0.4 })
    this.hiss.chain(hissBand, this.hissLevel, this.output)
  }

  set({ wow = 0, flutter = 0, wear = 0 }: { wow?: number; flutter?: number; wear?: number }) {
    const now = Tone.now()
    for (const w of this.wow) w.lfo.amplitude.rampTo(curve(wow), 0.4, now)
    for (const w of this.flutter) w.lfo.amplitude.rampTo(curve(flutter), 0.4, now)

    const w = curve(wear)
    // Output is tanh(k·x)/k: unity for quiet signals, peaks rounded off harder as k rises.
    // At k = 0.25 it's straight to within 2% up to full scale. The mix reaches the tape
    // around −15 dBFS at its peaks, so full wear needs a high k to be heard.
    const k = 0.25 + w * 7.75
    this.drive.gain.rampTo(k / 4, 0.3, now)
    this.makeup.gain.rampTo(1 / k, 0.3, now)
    this.highCut.frequency.rampTo(20000 * (5500 / 20000) ** w, 0.3, now)
    this.headBump.gain.rampTo(w * 3, 0.3, now)
    this.hissLevel.gain.rampTo(w * 0.02, 0.3, now)

    if (wear > 0 && !this.wearing) {
      this.hiss.start(now)
      this.wearing = true
    } else if (wear <= 0 && this.wearing) {
      this.hiss.stop(now + 0.4)
      this.wearing = false
    }
  }
}
