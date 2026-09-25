/**
 * Sound effects, synthesised rather than loaded.
 *
 * No audio files anywhere in the repo, and that is a deliberate choice rather
 * than a placeholder: a pack is a dozen numbers, it costs nothing to ship, it
 * cannot 404, and a new pack is a new row in a table rather than a round of
 * asset work. The art is still temporary — see the pip creatures — so the
 * sound matches it.
 *
 * TWO THINGS THAT WILL BITE ANYONE WHO CHANGES THIS.
 *
 * **An AudioContext cannot be created before a gesture.** Browsers start one
 * suspended and refuse to run it until the player has clicked something, so
 * the context is built lazily on the first sound and resumed on every call.
 * Building it in the constructor worked in dev and shipped silent.
 *
 * **Sound must never be able to break the game.** Every entry point is
 * wrapped: a blocked context, a missing WebAudio implementation or a browser
 * that throttles oscillators all end in a silent no-op, never an exception
 * that takes a click handler down with it.
 */

import type { SfxPackId } from './looks.js';

/** Everything the game can make a noise about. */
export type SfxEvent =
  | 'open'
  | 'cascade'
  | 'mark'
  | 'note'
  | 'battle'
  | 'kill'
  | 'levelup'
  | 'spell'
  | 'sweep'
  | 'blocked'
  | 'win'
  | 'lose';

interface Voice {
  wave: OscillatorType;
  /** Starting frequency in Hz. */
  from: number;
  /** Frequency at the end of the sound; equal to `from` for a flat tone. */
  to: number;
  /** Seconds. */
  dur: number;
  /** Peak gain, 0..1, before the master volume. */
  gain: number;
  /** Seconds to wait before this voice starts, for two-note stings. */
  delay?: number;
}

type Pack = Record<SfxEvent, Voice[]>;

/**
 * A pack is a table of voices per event.
 *
 * The events are the same everywhere and the recipes differ, so a pack is a
 * voice rather than a vocabulary: switching packs never changes *what* makes a
 * sound, only how it sounds. That is what keeps them interchangeable.
 */
const PACKS: Record<SfxPackId, Pack> = {
  blip: {
    open: [{ wave: 'square', from: 620, to: 620, dur: 0.035, gain: 0.16 }],
    cascade: [{ wave: 'square', from: 520, to: 880, dur: 0.12, gain: 0.14 }],
    mark: [{ wave: 'square', from: 900, to: 900, dur: 0.03, gain: 0.13 }],
    note: [{ wave: 'square', from: 1150, to: 1150, dur: 0.022, gain: 0.09 }],
    battle: [{ wave: 'sawtooth', from: 220, to: 90, dur: 0.16, gain: 0.26 }],
    kill: [{ wave: 'square', from: 440, to: 660, dur: 0.09, gain: 0.2 }],
    levelup: [
      { wave: 'square', from: 523, to: 523, dur: 0.09, gain: 0.2 },
      { wave: 'square', from: 784, to: 784, dur: 0.09, gain: 0.2, delay: 0.09 },
      { wave: 'square', from: 1046, to: 1046, dur: 0.16, gain: 0.2, delay: 0.18 },
    ],
    spell: [{ wave: 'triangle', from: 700, to: 1400, dur: 0.2, gain: 0.2 }],
    sweep: [{ wave: 'square', from: 400, to: 1200, dur: 0.18, gain: 0.16 }],
    blocked: [{ wave: 'square', from: 160, to: 120, dur: 0.08, gain: 0.16 }],
    win: [
      { wave: 'square', from: 659, to: 659, dur: 0.11, gain: 0.22 },
      { wave: 'square', from: 880, to: 880, dur: 0.11, gain: 0.22, delay: 0.11 },
      { wave: 'square', from: 1318, to: 1318, dur: 0.3, gain: 0.22, delay: 0.22 },
    ],
    lose: [{ wave: 'sawtooth', from: 330, to: 70, dur: 0.7, gain: 0.26 }],
  },
  chime: {
    open: [{ wave: 'sine', from: 880, to: 880, dur: 0.07, gain: 0.14 }],
    cascade: [{ wave: 'sine', from: 660, to: 1320, dur: 0.24, gain: 0.13 }],
    mark: [{ wave: 'sine', from: 1174, to: 1174, dur: 0.06, gain: 0.12 }],
    note: [{ wave: 'sine', from: 1568, to: 1568, dur: 0.05, gain: 0.08 }],
    battle: [{ wave: 'triangle', from: 300, to: 140, dur: 0.22, gain: 0.24 }],
    kill: [{ wave: 'sine', from: 587, to: 880, dur: 0.16, gain: 0.18 }],
    levelup: [
      { wave: 'sine', from: 523, to: 523, dur: 0.14, gain: 0.18 },
      { wave: 'sine', from: 659, to: 659, dur: 0.14, gain: 0.18, delay: 0.1 },
      { wave: 'sine', from: 988, to: 988, dur: 0.34, gain: 0.18, delay: 0.2 },
    ],
    spell: [{ wave: 'sine', from: 523, to: 1568, dur: 0.34, gain: 0.17 }],
    sweep: [{ wave: 'sine', from: 440, to: 1320, dur: 0.26, gain: 0.14 }],
    blocked: [{ wave: 'sine', from: 220, to: 196, dur: 0.12, gain: 0.14 }],
    win: [
      { wave: 'sine', from: 523, to: 523, dur: 0.16, gain: 0.2 },
      { wave: 'sine', from: 784, to: 784, dur: 0.16, gain: 0.2, delay: 0.14 },
      { wave: 'sine', from: 1046, to: 1046, dur: 0.5, gain: 0.2, delay: 0.28 },
    ],
    lose: [{ wave: 'triangle', from: 392, to: 98, dur: 0.85, gain: 0.22 }],
  },
  thud: {
    open: [{ wave: 'triangle', from: 180, to: 140, dur: 0.06, gain: 0.2 }],
    cascade: [{ wave: 'triangle', from: 150, to: 260, dur: 0.18, gain: 0.18 }],
    mark: [{ wave: 'triangle', from: 300, to: 240, dur: 0.05, gain: 0.16 }],
    note: [{ wave: 'triangle', from: 380, to: 340, dur: 0.04, gain: 0.1 }],
    battle: [{ wave: 'sawtooth', from: 150, to: 50, dur: 0.24, gain: 0.3 }],
    kill: [{ wave: 'triangle', from: 220, to: 110, dur: 0.18, gain: 0.24 }],
    levelup: [
      { wave: 'triangle', from: 196, to: 196, dur: 0.14, gain: 0.24 },
      { wave: 'triangle', from: 294, to: 294, dur: 0.26, gain: 0.24, delay: 0.12 },
    ],
    spell: [{ wave: 'sawtooth', from: 120, to: 480, dur: 0.28, gain: 0.2 }],
    sweep: [{ wave: 'triangle', from: 130, to: 420, dur: 0.22, gain: 0.18 }],
    blocked: [{ wave: 'sawtooth', from: 90, to: 70, dur: 0.1, gain: 0.2 }],
    win: [
      { wave: 'triangle', from: 262, to: 262, dur: 0.18, gain: 0.26 },
      { wave: 'triangle', from: 392, to: 392, dur: 0.44, gain: 0.26, delay: 0.16 },
    ],
    lose: [{ wave: 'sawtooth', from: 180, to: 40, dur: 0.9, gain: 0.3 }],
  },
  glass: {
    open: [{ wave: 'sine', from: 1320, to: 1320, dur: 0.045, gain: 0.12 }],
    cascade: [{ wave: 'sine', from: 990, to: 1980, dur: 0.2, gain: 0.11 }],
    mark: [{ wave: 'sine', from: 1760, to: 1760, dur: 0.04, gain: 0.11 }],
    note: [{ wave: 'sine', from: 2093, to: 2093, dur: 0.03, gain: 0.07 }],
    battle: [{ wave: 'square', from: 520, to: 180, dur: 0.14, gain: 0.2 }],
    kill: [{ wave: 'sine', from: 1046, to: 1568, dur: 0.12, gain: 0.16 }],
    levelup: [
      { wave: 'sine', from: 1046, to: 1046, dur: 0.1, gain: 0.16 },
      { wave: 'sine', from: 1318, to: 1318, dur: 0.1, gain: 0.16, delay: 0.08 },
      { wave: 'sine', from: 1976, to: 1976, dur: 0.28, gain: 0.16, delay: 0.16 },
    ],
    spell: [{ wave: 'sine', from: 880, to: 2637, dur: 0.3, gain: 0.15 }],
    sweep: [{ wave: 'sine', from: 880, to: 2200, dur: 0.2, gain: 0.13 }],
    blocked: [{ wave: 'square', from: 300, to: 260, dur: 0.07, gain: 0.12 }],
    win: [
      { wave: 'sine', from: 1046, to: 1046, dur: 0.12, gain: 0.18 },
      { wave: 'sine', from: 1568, to: 1568, dur: 0.12, gain: 0.18, delay: 0.1 },
      { wave: 'sine', from: 2093, to: 2093, dur: 0.42, gain: 0.18, delay: 0.2 },
    ],
    lose: [{ wave: 'square', from: 660, to: 110, dur: 0.75, gain: 0.2 }],
  },
};

/**
 * Shortest gap between two sounds of the same event, in milliseconds.
 *
 * Sweep opens dozens of cells in one go and a cascade reveals hundreds. One
 * click of a click sound per cell is a burst of white noise and, on a big
 * board, enough scheduled oscillators to stall the tab. The throttle is per
 * event so a kill during a sweep is still heard.
 */
const THROTTLE_MS = 45;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pack: SfxPackId | null = null;
  private readonly lastAt = new Map<SfxEvent, number>();
  /** Set once anything throws, so a broken audio stack is not retried on
   *  every click for the rest of the session. */
  private dead = false;

  /** Choose the pack, or pass null for silence. */
  setPack(pack: SfxPackId | null): void {
    this.pack = pack;
  }

  get enabled(): boolean {
    return this.pack !== null && !this.dead;
  }

  /**
   * Play one event.
   *
   * Never throws and never returns a promise worth awaiting — a sound is a
   * garnish, and a caller should not have to think about it.
   */
  play(event: SfxEvent): void {
    if (!this.enabled) return;
    const now = Date.now();
    const last = this.lastAt.get(event) ?? 0;
    if (now - last < THROTTLE_MS) return;
    this.lastAt.set(event, now);

    try {
      const ctx = this.context();
      if (!ctx || !this.master) return;
      // Started suspended until the page has seen a gesture, and a tab that
      // was backgrounded can suspend it again later.
      if (ctx.state === 'suspended') void ctx.resume();

      const voices = PACKS[this.pack!][event];
      for (const v of voices) this.voice(ctx, this.master, v);
    } catch {
      this.dead = true;
    }
  }

  /** A single oscillator with an attack/decay envelope. */
  private voice(ctx: AudioContext, out: GainNode, v: Voice): void {
    const at = ctx.currentTime + (v.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.from, at);
    if (v.to !== v.from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.to), at + v.dur);

    // A short attack rather than a hard start: an instant jump to peak gain
    // clicks audibly, and with a click per opened cell that is the loudest
    // thing in the mix.
    const attack = Math.min(0.012, v.dur / 3);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(v.gain, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + v.dur);

    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + v.dur + 0.02);
    // Let the node go as soon as it has finished; without this a long session
    // keeps every oscillator it ever made alive on the graph.
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.dead = true;
      return null;
    }
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    // Headroom: several voices can overlap during a sweep, and clipping the
    // sum is far worse than any of them being slightly quiet.
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }
}
