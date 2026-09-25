/**
 * The sound check: every sound in the game, one button per pack and event, in a window over the
 * settings screen. Keys can be assigned to sounds, and play them only while the window is open;
 * nowhere else in the game listens for them. A keyboard at the bottom retunes the last sound
 * clicked, and its keys and button then play it at that pitch. Clicking the keyboard also hands
 * the computer's keys to it, to play that sound as a piano; Shift on its own swaps back and forth
 * between playing the keyboard and the sound buttons' keys.
 *
 * It lives inside the screen's element, like the picker, so a rebuild or leaving the screen takes
 * it away. Its keys are caught at the window before they reach the app, where a key on the
 * settings screen can mean leaving it.
 */

import { el } from '../dom.js';
import type { SfxPackId } from '../looks.js';
import { type SfxEvent, sfxPitch } from '../sfx.js';
import { SFX_EVENT_NAMES, SFX_NAMES } from '../theme.js';
import type { ScreenContext } from './context.js';
import { type PianoRoll, nearestNote, noteHz, noteName, pianoRoll } from './pianoroll.js';

interface Sound {
  pack: SfxPackId;
  event: SfxEvent;
}

/**
 * Key to sound, and sound to the note it is tuned to. Module-level so both outlive a rebuild of
 * the screen and a closed window for the rest of the session; they are a testing aid, not a
 * setting, so they are never saved and never reach the game's own sounds.
 */
const keys = new Map<string, Sound>();
const pitches = new Map<string, number>();

/**
 * Keys that keep their own job in the window: Escape closes it, Tab moves the focus, Shift swaps
 * between the sounds and the keyboard.
 */
const RESERVED = new Set(['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * The computer's keys as a piano, in semitones above the octave's C: the home row is the white
 * keys and the row above it the black, the layout music software uses. Z and X move the octave.
 */
const PIANO_KEYS = new Map<string, number>([
  ['a', 0],
  ['w', 1],
  ['s', 2],
  ['e', 3],
  ['d', 4],
  ['f', 5],
  ['t', 6],
  ['g', 7],
  ['y', 8],
  ['h', 9],
  ['u', 10],
  ['j', 11],
  ['k', 12],
  ['o', 13],
  ['l', 14],
  ['p', 15],
  [';', 16],
]);
const OCTAVE_DOWN = 'z';
const OCTAVE_UP = 'x';
/** Where the home row can start: C2 to C6, so a whole octave above it is still on the keyboard. */
const LOWEST_C = 36;
const HIGHEST_C = 84;

/** A letter is the same key with or without Shift. */
const keyId = (e: KeyboardEvent): string => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

const keyName = (id: string): string =>
  id === ' ' ? 'Space' : id.length === 1 ? id.toUpperCase() : id;

const same = (a: Sound, b: Sound): boolean => a.pack === b.pack && a.event === b.event;

const soundId = (s: Sound): string => `${s.pack}:${s.event}`;

const soundName = (s: Sound): string =>
  `${SFX_NAMES[s.pack].split(' — ')[0]} · ${SFX_EVENT_NAMES[s.event]}`;

/** The key nearest where a sound starts as the game plays it. */
const ownNote = (s: Sound): number => nearestNote(sfxPitch(s.pack, s.event));

/**
 * The factor that moves a sound's first voice onto a note, by default the one it is tuned to.
 * Every voice is moved by the same factor, so a two-note sting stays the same interval and a
 * slide keeps its shape.
 */
function ratioFor(s: Sound, note = pitches.get(soundId(s))): number {
  return note === undefined ? 1 : noteHz(note) / sfxPitch(s.pack, s.event);
}

/**
 * Assigning is two steps, a sound and then a key, and the state says which one the window is
 * waiting for. Escape backs out of either without closing the window.
 */
type Assign = { step: 'idle' } | { step: 'sound' } | { step: 'key'; sound: Sound };

/** The line beside the buttons: what the window is waiting for, or why it is silent. */
function statusText(assign: Assign, muted: boolean, playing: boolean): string {
  if (muted) return 'Sound is muted: the speaker in the corner turns it back on.';
  if (playing) return 'Playing the keyboard. Shift goes back to the sounds.';
  if (assign.step === 'sound') return 'Click the sound to assign.';
  if (assign.step === 'key') return `Press a key for ${soundName(assign.sound)}.`;
  return keys.size > 0 ? 'Press an assigned key to play its sound.' : '';
}

/** The window and its title bar, in the picker's clothes. */
function shell(): { overlay: HTMLElement; card: HTMLElement; close: HTMLElement } {
  const overlay = el('div', 'overlay picker');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Sound check');
  const card = el('div', 'overlay-card picker-card');
  const head = el('div', 'picker-head');
  const close = el('button', 'ghost small', 'Close (Esc)');
  head.append(el('h2', undefined, 'Sound check'), close);
  card.append(head);
  return { overlay, card, close };
}

interface SoundButton {
  sound: Sound;
  btn: HTMLButtonElement;
  badge: HTMLElement;
}

/** Every pack under its name, a button per event. */
function soundGrid(onClick: (s: Sound) => void): { grid: HTMLElement; buttons: SoundButton[] } {
  const grid = el('div', 'soundcheck');
  const buttons: SoundButton[] = [];
  for (const pack of Object.keys(SFX_NAMES) as SfxPackId[]) {
    grid.append(el('h3', 'soundcheck-pack', SFX_NAMES[pack]));
    const packGrid = el('div', 'soundcheck-grid');
    for (const event of Object.keys(SFX_EVENT_NAMES) as SfxEvent[]) {
      const sound = { pack, event };
      const btn = el('button', 'soundcheck-sound');
      const badge = el('span', 'soundcheck-key');
      btn.append(el('span', undefined, SFX_EVENT_NAMES[event]), badge);
      btn.addEventListener('click', () => onClick(sound));
      buttons.push({ sound, btn, badge });
      packGrid.append(btn);
    }
    grid.append(packGrid);
  }
  return { grid, buttons };
}

interface PianoInput {
  /** Start the home row on the C at or below `note`. */
  moveTo(note: number): void;
  /** Which computer key plays each note from where the home row now starts. */
  letters(): Map<number, string>;
  /** Play a key, or move the octave; null for a key the piano does not use. */
  down(id: string, repeat: boolean): 'note' | 'octave' | null;
  up(id: string): void;
  /** Let every held note go, when the keys stop belonging to the piano. */
  release(): void;
}

/** The computer's keys as a piano. A note stays lit on the keyboard until its key comes up. */
function pianoInput(roll: PianoRoll, play: (note: number) => void): PianoInput {
  const held = new Map<string, number>();
  let octave = 60;
  const moveTo = (note: number): void => {
    octave = Math.min(HIGHEST_C, Math.max(LOWEST_C, note - (note % 12)));
  };
  const release = (): void => {
    for (const note of held.values()) roll.press(note, false);
    held.clear();
  };
  return {
    moveTo,
    letters: () => new Map([...PIANO_KEYS].map(([k, semis]) => [octave + semis, keyName(k)])),
    down(id, repeat) {
      if (id === OCTAVE_DOWN || id === OCTAVE_UP) {
        release();
        moveTo(octave + (id === OCTAVE_UP ? 12 : -12));
        return 'octave';
      }
      const semis = PIANO_KEYS.get(id);
      if (semis === undefined) return null;
      // A held key repeats, and a note is one sound per press.
      if (!repeat) {
        const note = octave + semis;
        play(note);
        roll.press(note, true);
        held.set(id, note);
      }
      return 'note';
    },
    up(id) {
      const note = held.get(id);
      if (note === undefined) return;
      roll.press(note, false);
      held.delete(id);
    },
    release,
  };
}

interface PitchPanel {
  element: HTMLElement;
  roll: PianoRoll;
  /** `letters`, while the keyboard is being played, says which key plays which note. */
  show(s: Sound | null, letters?: Map<number, string>): void;
}

/** The keyboard under a line naming the sound it tunes, with a way back to its own pitch. */
function pitchPanel(onPick: (note: number) => void, onReset: () => void): PitchPanel {
  const element = el('div', 'soundcheck-pitch');
  const head = el('div', 'soundcheck-tools');
  const label = el('span', 'soundcheck-status');
  const reset = el('button', 'ghost small', 'Own pitch');
  reset.addEventListener('click', onReset);
  head.append(el('h3', 'soundcheck-pack', 'Pitch'), label, reset);
  const roll = pianoRoll(onPick);
  element.append(head, roll.element);

  const show = (s: Sound | null, letters?: Map<number, string>): void => {
    element.classList.toggle('playing', letters !== undefined);
    if (!s) {
      label.textContent = 'Click a sound to tune it.';
      reset.disabled = true;
      roll.show(null);
      return;
    }
    const own = ownNote(s);
    const chosen = pitches.get(soundId(s));
    label.textContent = letters
      ? `${soundName(s)} on your keys: A to K from ${noteName(Math.min(...letters.keys()))}, ` +
        'Z and X change octave, Shift goes back to the sounds.'
      : `${soundName(s)}: ${noteName(chosen ?? own)}` +
        (chosen === undefined ? ', its own pitch.' : `, from ${noteName(own)}.`) +
        ' Click a key, or press Shift, to play it on your keys.';
    reset.disabled = chosen === undefined;
    roll.show({ own, chosen: chosen ?? own, ...(letters ? { letters } : {}) });
  };
  return { element, roll, show };
}

/** Take a key from everything else: the app, and a focused button that Space would click. */
function take(e: KeyboardEvent): void {
  e.preventDefault();
  // Immediate as well, or the app's own listener on the window still sees it.
  e.stopImmediatePropagation();
}

export function openSoundCheck(ctx: ScreenContext): void {
  new SoundCheck(ctx);
}

/**
 * The window's state and wiring. It removes itself, and its listeners on the window, when closed;
 * a rebuild of the screen that takes it away unhooks it on the next key.
 */
class SoundCheck {
  private readonly overlay: HTMLElement;
  private readonly assignBtn = el('button', 'primary small', 'Assign key');
  private readonly clearBtn = el('button', 'ghost small', 'Clear keys');
  private readonly status = el('span', 'soundcheck-status');
  private readonly grid: HTMLElement;
  private readonly buttons: SoundButton[];
  private readonly pitch: PitchPanel;
  private readonly piano: PianoInput;

  private assign: Assign = { step: 'idle' };
  /** The sound the keyboard is tuning and playing: the last one clicked. */
  private tuning: Sound | null = null;
  /** Whether the computer's keys play the keyboard rather than the sounds they are assigned to. */
  private playing = false;
  /** Shift is down and nothing else has been pressed with it, so letting it go swaps modes. */
  private shiftAlone = false;

  private readonly onKey = (e: KeyboardEvent): void => this.keyDown(e);
  private readonly onKeyUp = (e: KeyboardEvent): void => this.keyUp(e);

  constructor(private readonly ctx: ScreenContext) {
    const { overlay, card, close } = shell();
    this.overlay = overlay;
    const tools = el('div', 'soundcheck-tools');
    this.status.setAttribute('aria-live', 'polite');
    tools.append(this.assignBtn, this.clearBtn, this.status);

    ({ grid: this.grid, buttons: this.buttons } = soundGrid((s) => this.clickSound(s)));
    this.pitch = pitchPanel(
      (note) => this.clickKey(note),
      () => this.retune(null),
    );
    this.piano = pianoInput(this.pitch.roll, (note) => {
      if (this.tuning) this.play(this.tuning, note);
    });

    this.assignBtn.addEventListener('click', () => {
      if (this.playing) this.setPlaying(false);
      this.assign = this.assign.step === 'idle' ? { step: 'sound' } : { step: 'idle' };
      this.sync();
    });
    this.clearBtn.addEventListener('click', () => {
      keys.clear();
      this.sync();
    });
    close.addEventListener('click', () => this.dismiss());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.dismiss();
    });
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);

    card.append(tools, this.grid, this.pitch.element);
    overlay.append(card);
    ctx.host.append(overlay);
    // After it is in the page, so the keyboard has a width to scroll within.
    this.sync();
    close.focus();
  }

  private play(s: Sound, note = pitches.get(soundId(s))): void {
    this.ctx.onAudition(s.pack, s.event, ratioFor(s, note));
  }

  private clickSound(sound: Sound): void {
    this.play(sound);
    this.tuning = sound;
    if (this.assign.step === 'sound') this.assign = { step: 'key', sound };
    this.sync();
  }

  /** A click on the keyboard tunes the sound to that key and hands the computer's keys to it. */
  private clickKey(note: number): void {
    this.retune(note);
    this.piano.moveTo(note);
    this.setPlaying(true);
  }

  private retune(note: number | null): void {
    if (!this.tuning) return;
    if (note === null) pitches.delete(soundId(this.tuning));
    else pitches.set(soundId(this.tuning), note);
    this.play(this.tuning);
    this.sync();
  }

  /** Hand the computer's keys to the keyboard, or back. Only a chosen sound can be played. */
  private setPlaying(on: boolean): void {
    if (on && !this.tuning) return;
    if (on && !this.playing && this.tuning) {
      this.piano.moveTo(pitches.get(soundId(this.tuning)) ?? ownNote(this.tuning));
    }
    this.playing = on;
    this.piano.release();
    if (on) this.assign = { step: 'idle' };
    this.sync();
  }

  private sync(): void {
    const { assign, tuning, playing } = this;
    for (const { sound, btn, badge } of this.buttons) {
      const bound = [...keys].filter(([, s]) => same(s, sound)).map(([k]) => keyName(k));
      const note = pitches.get(soundId(sound));
      badge.textContent = [...bound, ...(note === undefined ? [] : [noteName(note)])].join(' · ');
      btn.classList.toggle('picking', assign.step === 'key' && same(assign.sound, sound));
      btn.classList.toggle('tuning', tuning !== null && same(tuning, sound));
    }
    this.grid.classList.toggle('choosing', assign.step === 'sound');
    this.grid.classList.toggle('resting', playing);
    this.assignBtn.textContent = assign.step === 'idle' ? 'Assign key' : 'Cancel';
    this.clearBtn.disabled = keys.size === 0;
    this.status.textContent = statusText(assign, this.ctx.p.muted, playing);
    this.pitch.show(tuning, playing ? this.piano.letters() : undefined);
  }

  private dismiss(): void {
    this.overlay.remove();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
  }

  private keyDown(e: KeyboardEvent): void {
    if (!this.overlay.isConnected) return this.dismiss();
    this.shiftAlone = e.key === 'Shift' ? this.shiftAlone || !e.repeat : false;
    if (e.key === 'Escape') {
      take(e);
      this.back();
      return;
    }
    // Browser and system shortcuts are left alone, and so is anything reserved.
    if (e.ctrlKey || e.metaKey || e.altKey || RESERVED.has(e.key)) return;
    const id = keyId(e);
    if (this.playing) {
      const took = this.piano.down(id, e.repeat);
      if (took) take(e);
      if (took === 'octave') this.sync();
      return;
    }
    if (this.assign.step === 'key') {
      take(e);
      keys.set(id, this.assign.sound);
      this.assign = { step: 'idle' };
      this.sync();
      return;
    }
    const sound = keys.get(id);
    if (!sound) return;
    take(e);
    // A held key repeats, and a sound check is one sound per press.
    if (!e.repeat) this.play(sound);
  }

  private keyUp(e: KeyboardEvent): void {
    if (!this.overlay.isConnected) return this.dismiss();
    if (e.key === 'Shift') {
      if (this.shiftAlone) this.setPlaying(!this.playing);
      this.shiftAlone = false;
      return;
    }
    this.piano.up(keyId(e));
  }

  /** Escape: one step back at a time, off the keyboard, out of an assignment, then away. */
  private back(): void {
    if (this.playing) this.setPlaying(false);
    else if (this.assign.step !== 'idle') {
      this.assign = { step: 'idle' };
      this.sync();
    } else this.dismiss();
  }
}
