/**
 * The sound check's keyboard: five octaves of the twelve-tone scale, equal temperament from A4 at
 * 440 Hz. A key names a pitch; the window decides what to play at it. The key nearest a sound's
 * own starting pitch is marked, so the player can see where it began.
 */

import { el } from '../dom.js';
import { hzNote } from '../sfx.js';

/** MIDI numbers: C2 to C7, which holds the starting pitch of every sound in every pack. */
const LOWEST_NOTE = 36;
const HIGHEST_NOTE = 96;

// A plain #: the sharp sign is outside Latin-1, and the interface font is a player setting.
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const noteName = (note: number): string => `${NAMES[note % 12]}${Math.floor(note / 12) - 1}`;

/** The nearest key to a frequency, kept on the keyboard. */
export function nearestNote(hz: number): number {
  const note = Math.round(hzNote(hz));
  return Math.min(HIGHEST_NOTE, Math.max(LOWEST_NOTE, note));
}

export interface PianoState {
  /** The key nearest the sound's own pitch, which wears a dot. */
  own: number;
  /** The key the sound is tuned to, which is lit. */
  chosen: number;
  /** While the keyboard is being played, the computer key that plays each note. */
  letters?: ReadonlyMap<number, string>;
}

export interface PianoRoll {
  readonly element: HTMLElement;
  /** Light the chosen key and mark the sound's own; null greys the keyboard out. */
  show(state: PianoState | null): void;
  /** Hold a key down, or let it go, as a note is played from the computer's keys. */
  press(note: number, down: boolean): void;
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
  const keys = new Map<number, { key: HTMLButtonElement; letter: HTMLElement }>();
  let whites = 0;
  for (let note = LOWEST_NOTE; note <= HIGHEST_NOTE; note++) {
    const black = BLACK.has(note % 12);
    const key = el('button', black ? 'piano-key black' : 'piano-key white');
    key.title = noteName(note);
    key.setAttribute('aria-label', noteName(note));
    const letter = el('span', 'piano-letter');
    key.append(letter);
    if (black) key.style.setProperty('--at', String(whites));
    else {
      whites++;
      if (note % 12 === 0) key.append(el('span', 'piano-label', noteName(note)));
    }
    key.addEventListener('click', () => onPick(note));
    keys.set(note, { key, letter });
    board.append(key);
  }
  board.style.setProperty('--whites', String(whites));

  /** Only sideways: scrolling a key into view would also drag the window down to it. */
  const centre = (note: number): void => {
    const key = keys.get(note)?.key;
    if (key) element.scrollLeft = key.offsetLeft - (element.clientWidth - key.offsetWidth) / 2;
  };

  return {
    element,
    show(state) {
      element.classList.toggle('idle', state === null);
      element.classList.toggle('playing', state?.letters !== undefined);
      for (const [note, { key, letter }] of keys) {
        key.disabled = state === null;
        key.classList.toggle('chosen', state?.chosen === note);
        key.classList.toggle('own', state?.own === note);
        key.setAttribute('aria-pressed', String(state?.chosen === note));
        letter.textContent = state?.letters?.get(note) ?? '';
      }
      if (!state) return;
      // While playing, the keys the computer reaches; otherwise the chosen one.
      const reach = state.letters ? [...state.letters.keys()] : [];
      centre(
        reach.length > 0 ? Math.round((Math.min(...reach) + Math.max(...reach)) / 2) : state.chosen,
      );
    },
    press(note, down) {
      keys.get(note)?.key.classList.toggle('pressed', down);
    },
  };
}
