// @vitest-environment happy-dom
/**
 * A smoke test of the screens: boots the app in a DOM, starts boards, drives the keyboard and
 * the mode toggles, and reads the HUD and hint back. It exists so the app.ts split (and anything
 * after it) can be checked against what the screens say, not only against the engine.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../../src/engine/game.js';
import type { GameEvent } from '../../src/engine/types.js';
import { autoplayTierOrder } from '../../src/sim/autoplay.js';
import { App } from '../../src/ui/app.js';
import type { Progress } from '../../src/ui/progress.js';

/** The app's surface as the test drives it, private members included, the way the dev console does. */
interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  runFull(typeId: string, seed?: number): void;
  readonly current: Game | null;
  readonly progress: Progress;
  finish(): void;
  apply(events: GameEvent[]): void;
  pickSpell(id: string): void;
  pickTier(tier: number): void;
  onCellPrimary(x: number, y: number): void;
  showSettings(back: () => void): void;
  buildGameScreen(): void;
  readonly mode: { pendingSpell: string | null; notesMode: boolean; markMode: number };
}

const key = (k: string, extra: KeyboardEventInit = {}): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
};

const text = (selector: string): string =>
  document.querySelector<HTMLElement>(selector)?.textContent ?? '';

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

describe('the app', () => {
  it('boots to the ladder list with every type on it', () => {
    expect(document.querySelectorAll('.type-card').length).toBe(24);
    expect(text('h1')).toContain('Creature Sweeper');
    expect(document.querySelector('.mute-toggle')).not.toBeNull();
  });

  it('starts a board and shows the HUD and the hint', () => {
    app.play('normal', 1, 7);
    expect(document.querySelector('.screen.game')).not.toBeNull();
    expect(text('.hud')).toContain('HP');
    expect(text('.hud')).toContain('Level');
    expect(text('.hint')).toMatch(/^Click to open/);
    expect(app.current?.status).toBe('playing');
  });

  it('opens a cell the engine proves safe', () => {
    app.play('normal', 1, 7);
    const game = app.current!;
    const before = game.grid.flat().filter((c) => c.open).length;
    const safe = game.safeCells({ useMarks: false })[0]!;
    app.onCellPrimary(safe.x, safe.y);
    expect(game.grid.flat().filter((c) => c.open).length).toBeGreaterThan(before);
    expect(game.hp).toBe(game.maxHp);
  });

  it('N switches the entry mode and arms a pencil tier', () => {
    app.play('normal', 1, 7);
    key('n');
    expect(app.mode.notesMode).toBe(true);
    expect(app.mode.markMode).toBe(1);
    expect(text('.hint')).toMatch(/^PENCIL/);
    key('n');
    expect(app.mode.notesMode).toBe(false);
    expect(app.mode.markMode).toBe(-1);
    expect(text('.hint')).toMatch(/^Click to open/);
  });

  it('Escape cancels an armed spell, and pencil mode clears one too', () => {
    app.play('arcane', 1, 7);
    app.pickSpell('reveal');
    expect(app.mode.pendingSpell).toBe('reveal');
    expect(text('.hint')).toContain('Reveal is armed');
    key('Escape');
    expect(app.mode.pendingSpell).toBeNull();
    expect(text('.hint')).toMatch(/^Click to open/);

    app.pickSpell('reveal');
    key('n');
    expect(app.mode.pendingSpell).toBeNull();
    expect(app.mode.notesMode).toBe(true);
  });

  it('a cleared board shows the clear overlay, records it, and offers the next board', () => {
    app.play('normal', 1, 7);
    const game = app.current!;
    const result = autoplayTierOrder(game);
    expect(result.cleared).toBe(true);
    expect(game.status).toBe('won');
    app.finish();
    expect(text('.overlay h2')).toMatch(/CLEAR/);
    expect(text('.overlay-stats')).toContain('NORMAL board 1');
    const buttons = [...document.querySelectorAll('.overlay button')].map((b) => b.textContent);
    expect(buttons).toContain('Next board');
    expect(app.progress.boardRecord('normal', 1).cleared).toBe(true);
    expect(app.progress.boardRecord('normal', 1).perfect).toBe(true);
  });

  it('a lost board shows GAME OVER and offers to try again', () => {
    app.play('easy', 1, 7);
    const game = app.current!;
    app.apply(game.forfeit());
    expect(game.status).toBe('lost');
    expect(text('.overlay h2')).toBe('GAME OVER');
    const buttons = [...document.querySelectorAll('.overlay button')].map((b) => b.textContent);
    expect(buttons).toContain('Try again');
    expect(app.progress.boardRecord('easy', 1).cleared).toBe(false);
  });

  it('a Full Run carries on to the next board after a clear', () => {
    app.runFull('easy', 7);
    expect(text('.board-label')).toContain('board 1 of 10');
    autoplayTierOrder(app.current!);
    app.finish();
    expect(text('.overlay h2')).toBe('BOARD 1 CLEAR');
    const next = [...document.querySelectorAll<HTMLButtonElement>('.overlay button')].find((b) =>
      b.textContent?.startsWith('Continue'),
    )!;
    next.click();
    expect(text('.board-label')).toContain('board 2 of 10');
    expect(app.current?.status).toBe('playing');
  });

  it('opens the settings screen from a board and comes back to the same board', () => {
    app.play('normal', 2, 7);
    const game = app.current;
    app.showSettings(() => app.buildGameScreen());
    expect(document.querySelector('.settings-screen')).not.toBeNull();
    expect(document.querySelectorAll('.settings-row').length).toBeGreaterThan(10);
    document.querySelector<HTMLButtonElement>('.settings-screen .title-bar button')!.click();
    expect(document.querySelector('.screen.game')).not.toBeNull();
    expect(app.current).toBe(game);
  });
});

describe('Escape and the entry modes', () => {
  const onGame = (): boolean => document.querySelector('.screen.game') !== null;

  it('backs out one thing at a time on a board: the spell, the tier, then the board', () => {
    app.play('arcane', 1, 7);
    app.pickTier(2);
    app.pickSpell('reveal');
    key('Escape');
    expect(app.mode.pendingSpell).toBeNull();
    app.pickTier(2);
    key('Escape');
    expect(app.mode.markMode).toBe(-1);
    expect(onGame()).toBe(true);
    key('Escape');
    expect(onGame()).toBe(false);
  });

  it('asks before Escape leaves a Full Run, and a second Escape answers no', () => {
    app.runFull('easy', 7);
    key('Escape');
    expect(text('.overlay h2')).toBe('ABANDON RUN?');
    key('Escape');
    expect(document.querySelector('.overlay')).toBeNull();
    expect(onGame()).toBe(true);
    expect(app.current?.status).toBe('playing');
  });

  /*
   * Known bug: the key handler does not know which screen is showing, and the board a player
   * left is still held, so keys reach a board that is not on screen. `it.fails` pins the bug:
   * these pass while it stands and fail, as a reminder to flip them, once it is fixed.
   */
  it.fails('leaves the board under the settings screen alone', () => {
    app.play('arcane', 1, 7);
    app.pickSpell('reveal');
    app.showSettings(() => app.buildGameScreen());
    key('n');
    key('Escape');
    expect(app.mode.pendingSpell).toBe('reveal');
    expect(app.mode.notesMode).toBe(false);
  });

  it.fails('never lets Escape on the settings screen discard the board under it', () => {
    app.play('normal', 1, 7);
    const game = app.current;
    app.showSettings(() => app.buildGameScreen());
    key('Escape');
    key('Escape');
    document.querySelector<HTMLButtonElement>('.settings-screen .title-bar button')?.click();
    expect(onGame()).toBe(true);
    expect(app.current).toBe(game);
  });

  it.fails('sends no key to a board the player has left', () => {
    app.play('normal', 1, 7);
    key('Escape');
    expect(onGame()).toBe(false);
    key('n');
    expect(app.mode.notesMode).toBe(false);
  });
});
