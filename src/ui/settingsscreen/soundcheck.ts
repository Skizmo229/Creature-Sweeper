/**
 * The sound check: every sound in the game, one button per pack and event, in a window over the
 * settings screen. Keys can be assigned to sounds, and play them only while the window is open;
 * nowhere else in the game listens for them. A keyboard at the bottom retunes the last sound
 * clicked, and its keys and button then play it at that pitch.
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
import { nearestNote, noteHz, noteName, pianoRoll } from './pianoroll.js';

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

/** Keys that keep their own job in the window: Escape closes it, Tab moves the focus. */
const RESERVED = new Set(['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

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
 * The factor that moves a sound's first voice onto its chosen note. Every voice is moved by the
 * same factor, so a two-note sting stays the same interval and a slide keeps its shape.
 */
function ratioFor(s: Sound): number {
  const note = pitches.get(soundId(s));
  return note === undefined ? 1 : noteHz(note) / sfxPitch(s.pack, s.event);
}

/**
 * Assigning is two steps, a sound and then a key, and the state says which one the window is
 * waiting for. Escape backs out of either without closing the window.
 */
type Assign = { step: 'idle' } | { step: 'sound' } | { step: 'key'; sound: Sound };

/** The line beside the buttons: what the window is waiting for, or why it is silent. */
function statusText(assign: Assign, muted: boolean): string {
  if (assign.step === 'sound') return 'Click the sound to assign.';
  if (assign.step === 'key') return `Press a key for ${soundName(assign.sound)}.`;
  if (muted) return 'Sound is muted: the speaker in the corner turns it back on.';
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

/** The keyboard under a line naming the sound it tunes, with a way back to its own pitch. */
function pitchPanel(
  onPick: (note: number) => void,
  onReset: () => void,
): { element: HTMLElement; show: (s: Sound | null) => void } {
  const element = el('div', 'soundcheck-pitch');
  const head = el('div', 'soundcheck-tools');
  const label = el('span', 'soundcheck-status');
  const reset = el('button', 'ghost small', 'Own pitch');
  reset.addEventListener('click', onReset);
  head.append(el('h3', 'soundcheck-pack', 'Pitch'), label, reset);
  const roll = pianoRoll(onPick);
  element.append(head, roll.element);

  const show = (s: Sound | null): void => {
    if (!s) {
      label.textContent = 'Click a sound to tune it.';
      reset.disabled = true;
      roll.show(null);
      return;
    }
    const own = ownNote(s);
    const chosen = pitches.get(soundId(s));
    label.textContent =
      `${soundName(s)}: ${noteName(chosen ?? own)}` +
      (chosen === undefined ? ', its own pitch' : `, from ${noteName(own)}`);
    reset.disabled = chosen === undefined;
    roll.show({ own, chosen: chosen ?? own });
  };
  return { element, show };
}

export function openSoundCheck(ctx: ScreenContext): void {
  const { overlay, card, close } = shell();

  const tools = el('div', 'soundcheck-tools');
  const assignBtn = el('button', 'primary small', 'Assign key');
  const clearBtn = el('button', 'ghost small', 'Clear keys');
  const status = el('span', 'soundcheck-status');
  status.setAttribute('aria-live', 'polite');
  tools.append(assignBtn, clearBtn, status);

  let assign: Assign = { step: 'idle' };
  /** The sound the keyboard is tuning: the last one clicked. */
  let tuning: Sound | null = null;
  const play = (s: Sound): void => ctx.onAudition(s.pack, s.event, ratioFor(s));

  const { grid, buttons } = soundGrid((sound) => {
    play(sound);
    tuning = sound;
    if (assign.step === 'sound') assign = { step: 'key', sound };
    sync();
  });
  const retune = (note: number | null): void => {
    if (!tuning) return;
    if (note === null) pitches.delete(soundId(tuning));
    else pitches.set(soundId(tuning), note);
    play(tuning);
    sync();
  };
  const pitch = pitchPanel(retune, () => retune(null));

  const sync = (): void => {
    for (const { sound, btn, badge } of buttons) {
      const bound = [...keys].filter(([, s]) => same(s, sound)).map(([k]) => keyName(k));
      const note = pitches.get(soundId(sound));
      badge.textContent = [...bound, ...(note === undefined ? [] : [noteName(note)])].join(' · ');
      btn.classList.toggle('picking', assign.step === 'key' && same(assign.sound, sound));
      btn.classList.toggle('tuning', tuning !== null && same(tuning, sound));
    }
    grid.classList.toggle('choosing', assign.step === 'sound');
    assignBtn.textContent = assign.step === 'idle' ? 'Assign key' : 'Cancel';
    clearBtn.disabled = keys.size === 0;
    status.textContent = statusText(assign, ctx.p.muted);
    pitch.show(tuning);
  };

  const dismiss = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (!overlay.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // Immediate as well, or the app's own listener on the window still sees it.
      e.stopImmediatePropagation();
      if (assign.step === 'idle') dismiss();
      else {
        assign = { step: 'idle' };
        sync();
      }
      return;
    }
    // Browser and system shortcuts are left alone, and so is anything reserved.
    if (e.ctrlKey || e.metaKey || e.altKey || RESERVED.has(e.key)) return;
    const id = keyId(e);
    if (assign.step === 'key') {
      e.preventDefault();
      e.stopImmediatePropagation();
      keys.set(id, assign.sound);
      assign = { step: 'idle' };
      sync();
      return;
    }
    const sound = keys.get(id);
    if (!sound) return;
    // Taken from the focused button too: Space or Enter on a button would otherwise click it.
    e.preventDefault();
    e.stopImmediatePropagation();
    // A held key repeats, and a sound check is one sound per press.
    if (!e.repeat) play(sound);
  };

  assignBtn.addEventListener('click', () => {
    assign = assign.step === 'idle' ? { step: 'sound' } : { step: 'idle' };
    sync();
  });
  clearBtn.addEventListener('click', () => {
    keys.clear();
    sync();
  });
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  window.addEventListener('keydown', onKey, true);

  card.append(tools, grid, pitch.element);
  overlay.append(card);
  ctx.host.append(overlay);
  // After it is in the page, so the keyboard has a width to scroll within.
  sync();
  close.focus();
}
