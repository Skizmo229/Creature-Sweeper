/**
 * How the tests under test/ui reach the app: its surface as a type, the page it is mounted on, and
 * the lookups on its screens most of them make. Each test file still begins with its environment
 * line and `import './setup.js'`, so a reader sees where it runs.
 */

import './setup.js';
import type { Game } from '../../src/engine/game.js';
import type { FullRun } from '../../src/engine/run.js';
import type { GameEvent } from '../../src/engine/types.js';
import { App } from '../../src/ui/app.js';
import type { BoardDisplay } from '../../src/ui/board/view.js';
import type { BoardActions } from '../../src/ui/game/actions.js';
import type { BoardClock } from '../../src/ui/game/clock.js';
import type { EntryMode } from '../../src/ui/game/mode.js';
import type { Modal } from '../../src/ui/overlays/modal.js';
import type { Progress } from '../../src/ui/progress.js';
import type { Settings } from '../../src/ui/settings.js';
import type { Sfx } from '../../src/ui/sfx.js';
import type { Teaching } from '../../src/ui/teaching.js';

/** The app's surface as a test drives it, private members included, the way the dev console does. */
export interface AppDriver {
  /** Start a board of a ladder, dealt from the seed, or a random one. */
  play(typeId: string, board: number, seed?: number): void;
  /** Start a Full Run of a ladder, dealt from the seed, or a random one. */
  runFull(typeId: string, seed?: number): void;
  /** The board being played, or null. */
  readonly current: Game | null;
  /** The Full Run being played, or null. */
  readonly currentRun: FullRun | null;
  /** The board on screen, or null; its display is private to it, and read here all the same. */
  readonly view: { readonly display: BoardDisplay; pinHover(x: number, y: number): void } | null;
  /** The save: the records, the unlocks and the lessons taken. */
  readonly progress: Progress;
  /** The presentation and gameplay settings, for every ladder and each ladder's own. */
  readonly settings: Settings;
  /** The board's clock, and its time limit. */
  readonly clock: BoardClock;
  /** What a click on the board does right now. */
  readonly mode: EntryMode;
  /** What the player's input does on a board. */
  readonly actions: BoardActions;
  /** The tutor, the rules card, the field guide and the school. */
  readonly teaching: Teaching;
  /** The overlay over the screen: a question, a card. */
  readonly modal: Modal;
  /** The mixer every sound in the game is played through. */
  readonly sfx: Sfx;
  /** Show what the engine's events did, as a move does, and end the board if they ended it. */
  apply(events: GameEvent[]): void;
  /** End the board on screen, won or lost: its record, its card and its clear effect. */
  finish(): void;
  /** Pause the board or run on screen, and go to its ladder's boards. */
  pause(): void;
  /** Write the clock into the HUD, and end the board if its time has run out. */
  updateClock(): void;
  /** Show the list of ladders. */
  showTypes(): void;
  /** Show a ladder's boards. */
  showBoards(typeId: string): void;
  /** Show the settings screen, whose Back and Escape call `back`. */
  showSettings(back: () => void): void;
  /** Build the screen of the board being played again, as Back from the settings screen does. */
  buildGameScreen(): void;
}

/** Start the app on the page's #app root over whatever the save holds, as a page load does. */
export function startApp(): AppDriver {
  return new App(document.getElementById('app')!) as unknown as AppDriver;
}

/** A fresh page: the save cleared, an empty #app root, and the app started on it. */
export function mountApp(): AppDriver {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  return startApp();
}

/** The row of the settings screen with this name; the screen must be up. */
export function settingsRow(name: string): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
    (r) => r.querySelector('.settings-name')?.textContent === name,
  )!;
}

/** The tiles a settings row offers, in order. */
export function tiles(row: Element): HTMLButtonElement[] {
  return [...row.querySelectorAll<HTMLButtonElement>('.preview-chip')];
}

/** The caption under a tile. */
export function tileLabel(tile: Element): string {
  return tile.querySelector('.chip-label')!.textContent!;
}

/** Press a key on the window, as the keyboard does, with any modifier held in `init`. */
export function key(k: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
}
