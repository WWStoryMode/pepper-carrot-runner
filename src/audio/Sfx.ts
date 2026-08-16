/**
 * Sound effects, synthesised in the browser.
 *
 * The original ships **no audio at all** — not one sound file, despite its
 * `index.html` referencing soundmanager2. Rather than pull in recordings of
 * unclear provenance to sit beside carefully-licensed CC-BY art, these are
 * generated with WebAudio oscillators at runtime. Nothing to download, nothing
 * to attribute, and no bytes added to the payload.
 *
 * The intent is placeholder-quality but characterful: recorded audio would be
 * better and is a content task, not an engineering one.
 */

type Voice = 'jump' | 'land' | 'pickup' | 'heal' | 'hurt' | 'death' | 'cast' | 'kill';

interface Recipe {
  readonly type: OscillatorType;
  /** Start and end frequency, in Hz. */
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly gain: number;
  /** Optional second oscillator a fixed ratio above, for a fuller sound. */
  readonly harmonic?: number;
}

const RECIPES: Record<Voice, Recipe> = {
  // Rising blip — reads as effort.
  jump: { type: 'square', from: 320, to: 660, duration: 0.13, gain: 0.16 },
  land: { type: 'sine', from: 220, to: 120, duration: 0.09, gain: 0.12 },
  // Bright two-tone chime for collecting.
  pickup: { type: 'triangle', from: 880, to: 1320, duration: 0.12, gain: 0.16, harmonic: 1.5 },
  heal: { type: 'triangle', from: 660, to: 1180, duration: 0.26, gain: 0.18, harmonic: 1.5 },
  // Falling and rough — reads as damage.
  hurt: { type: 'sawtooth', from: 300, to: 90, duration: 0.22, gain: 0.2 },
  death: { type: 'sawtooth', from: 260, to: 55, duration: 0.75, gain: 0.24 },
  cast: { type: 'sine', from: 180, to: 900, duration: 0.3, gain: 0.18, harmonic: 2 },
  kill: { type: 'square', from: 520, to: 180, duration: 0.1, gain: 0.13 },
};

export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  constructor(muted: boolean) {
    this.muted = muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null) this.master.gain.value = muted ? 0 : 1;
    // Unmuting is itself a gesture-adjacent action, so build the graph now if
    // it was skipped while muted.
    if (!muted) this.unlock();
  }

  /**
   * Create the audio graph.
   *
   * Must be called from a user gesture: browsers refuse to start an
   * AudioContext otherwise, and one created too early sits suspended forever.
   */
  unlock(): void {
    // A muted player should not pay for an audio graph at all. Creating one can
    // take seconds on a machine with no audio device, which is a real stall for
    // no benefit.
    if (this.muted) return;

    if (this.context !== null) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }

    try {
      const Ctor = globalThis.AudioContext;
      if (Ctor === undefined) return;

      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.context.destination);
    } catch {
      // No audio available; the game is perfectly playable in silence.
      this.context = null;
      this.master = null;
    }
  }

  play(voice: Voice): void {
    const context = this.context;
    const master = this.master;
    if (context === null || master === null || this.muted) return;
    if (context.state === 'suspended') return;

    const recipe = RECIPES[voice];
    const now = context.currentTime;

    const envelope = context.createGain();
    // Fast attack, exponential decay. Linear ramps to zero click audibly.
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(recipe.gain, now + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + recipe.duration);
    envelope.connect(master);

    const voices = recipe.harmonic === undefined ? [1] : [1, recipe.harmonic];
    for (const ratio of voices) {
      const osc = context.createOscillator();
      osc.type = recipe.type;
      osc.frequency.setValueAtTime(recipe.from * ratio, now);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, recipe.to * ratio),
        now + recipe.duration,
      );
      osc.connect(envelope);
      osc.start(now);
      osc.stop(now + recipe.duration + 0.02);
    }
  }
}
