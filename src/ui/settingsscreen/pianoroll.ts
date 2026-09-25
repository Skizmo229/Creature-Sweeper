/**
 * The sound check's keyboard: five octaves of the twelve-tone scale, equal temperament from A4 at
 * 440 Hz. A key names a pitch; the window decides what to play at it. The key nearest a sound's
 * own starting pitch is marked, so the player can see where it began.
 */

import { el } from '../dom.js';

/** MIDI numbers: C2 to C7, which holds the starting pitch of every sound in every pack. */
const LOWEST_NOTE = 36;
const HIGHEST_NOTE = 96;

const A4 = 69;
const A4_HZ = 440;
// A plain #: the sharp sign is outside Latin-1, and the interface font is a player setting.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const noteHz = (note: number): number => A4_HZ * 2 ** ((note - A4) / 12);

export const noteName = (note: number): string => `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

/** The nearest key to a frequency, kept on the keyboard. */
export function nearestNote(hz: number): number {
  const note = Math.round(A4 + 12 * Math.log2(hz / A4_HZ));
  return Math.min(HIGHEST_NOTE, Math.max(LOWEST_NOTE, note));
}

export interface PianoRoll {
  readonly element: HTMLElement;
  /** Light the chosen key and mark the sound's own; null greys the keyboard out. */
  show(state: { own: number; chosen: number } | null): void;
}

/**
 * White keys sit in a row and each black key is laid over the seam after the white key below it,
 * placed by the count of white keys before it: the stylesheet turns that count into an offset.
 */
export function pianoRoll(onPick: (note: number) => void): PianoRoll {
  // The keyboard is wider than a phone, so it scrolls sideways inside a box of its own.
  const element = el('div', 'piano-scroll');
  const board = el('div', 'piano');
  element.append(board);
  const keys = new Map<number, HTMLButtonElement>();
  let whites = 0;
  for (let note = LOWEST_NOTE; note <= HIGHEST_NOTE; note++) {
    const black = BLACK.has(note % 12);
    const key = el('button', black ? 'piano-key black' : 'piano-key white');
    key.title = noteName(note);
    key.setAttribute('aria-label', noteName(note));
    if (black) key.style.setProperty('--at', String(whites));
    else {
      whites++;
      if (note % 12 === 0) key.append(el('span', 'piano-label', noteName(note)));
    }
    key.addEventListener('click', () => onPick(note));
    keys.set(note, key);
    board.append(key);
  }
  board.style.setProperty('--whites', String(whites));

  return {
    element,
    show(state) {
      element.classList.toggle('idle', state === null);
      for (const [note, key] of keys) {
        key.disabled = state === null;
        key.classList.toggle('chosen', state?.chosen === note);
        key.classList.toggle('own', state?.own === note);
        key.setAttribute('aria-pressed', String(state?.chosen === note));
      }
      // Only sideways: scrolling the key into view would also drag the window down to it.
      const key = state && keys.get(state.chosen);
      if (key) element.scrollLeft = key.offsetLeft - (element.clientWidth - key.offsetWidth) / 2;
    },
  };
}
