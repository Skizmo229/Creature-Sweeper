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
import type { Settings } from '../../src/ui/settings.js';

/** The app's surface as the test drives it, private members included, the way the dev console does. */
interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  runFull(typeId: string, seed?: number): void;
  readonly current: Game | null;
  readonly progress: Progress;
  readonly settings: Settings;
  finish(): void;
  apply(events: GameEvent[]): void;
  readonly actions: {
    pickSpell(id: string): void;
    pickTier(tier: number): void;
    onCellPrimary(x: number, y: number): void;
  };
  showSettings(back: () => void): void;
  showTypes(): void;
  ask(opts: {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm(): void;
  }): void;
  buildGameScreen(): void;
  readonly mode: { pendingSpell: string | null; notesMode: boolean; markMode: number };
}

const key = (k: string, extra: KeyboardEventInit = {}): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
};

const text = (selector: string): string =>
  document.querySelector<HTMLElement>(selector)?.textContent ?? '';

/** A fight as the engine reports it, costing `damage` HP. */
const fought = (damage: number): GameEvent => {
  return { type: 'battle', x: 0, y: 0, tier: 1, damage, defeated: true };
};
const levelUp: GameEvent = { type: 'levelUp', level: 2 };

/** The rim classes on an element: which colour it last flashed, if any. */
const rimOf = (host: Element): string[] =>
  [...host.classList].filter((c) => c.startsWith('fight-'));

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
    app.actions.onCellPrimary(safe.x, safe.y);
    expect(game.grid.flat().filter((c) => c.open).length).toBeGreaterThan(before);
    expect(game.hp).toBe(game.maxHp);
  });

  it('lights the stage rim after a fight: green when clean, blue on a level-up, red on a hit', () => {
    app.play('normal', 1, 7);
    const game = app.current!;
    const stage = document.querySelector('.stage')!;
    const covered = (fits: (tier: number) => boolean) =>
      game.grid.flat().find((c) => !c.open && c.alive && c.tier > 0 && fits(c.tier))!;

    const free = covered((tier) => tier <= game.level);
    app.actions.onCellPrimary(free.x, free.y);
    expect(game.hp).toBe(game.maxHp);
    expect(rimOf(stage)).toEqual(['fight-clean']);

    const costly = covered((tier) => tier === game.level + 1);
    app.actions.onCellPrimary(costly.x, costly.y);
    expect(game.hp).toBeLessThan(game.maxHp);
    expect(rimOf(stage)).toEqual(['fight-hurt']);

    // A sweep can fight several creatures in one action; any one that hurt makes the rim red.
    app.apply([fought(0)]);
    expect(rimOf(stage)).toEqual(['fight-clean']);
    app.apply([fought(0), fought(2), fought(0)]);
    expect(rimOf(stage)).toEqual(['fight-hurt']);

    // A level-up turns a clean fight's green blue; a hit that levels up stays red.
    app.apply([fought(0), levelUp]);
    expect(rimOf(stage)).toEqual(['fight-levelup']);
    app.apply([fought(2), levelUp]);
    expect(rimOf(stage)).toEqual(['fight-hurt']);
  });

  it('lights the rim for level-ups and damage only, or not at all, as the setting says', () => {
    app.settings.setPresentation({ fightRim: 'levelups' });
    app.play('normal', 1, 7);
    const stage = document.querySelector('.stage')!;
    app.apply([fought(0)]);
    expect(rimOf(stage)).toEqual([]);
    app.apply([fought(0), levelUp]);
    expect(rimOf(stage)).toEqual(['fight-levelup']);
    app.apply([fought(2)]);
    expect(rimOf(stage)).toEqual(['fight-hurt']);

    app.settings.setPresentation({ fightRim: 'off' });
    app.play('normal', 1, 7);
    const quiet = document.querySelector('.stage')!;
    app.apply([fought(2), levelUp]);
    expect(rimOf(quiet)).toEqual([]);
    // The setting is the rim's alone: the shake and the level-up glow still play.
    expect(quiet.classList.contains('shake')).toBe(true);
    expect(quiet.classList.contains('levelup')).toBe(true);
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
    app.actions.pickSpell('reveal');
    expect(app.mode.pendingSpell).toBe('reveal');
    expect(text('.hint')).toContain('Reveal is armed');
    key('Escape');
    expect(app.mode.pendingSpell).toBeNull();
    expect(text('.hint')).toMatch(/^Click to open/);

    app.actions.pickSpell('reveal');
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

  it('plays the glow after a fight on the settings screen, under the option picked', () => {
    // Pinned to this test's app: the screen stays up, and its Escape handler outlives the test.
    const here = app;
    here.showSettings(() => here.showTypes());
    const demo = document.querySelector('.rim-demo')!;
    const row = demo.closest('.settings-row')!;
    const button = (selector: string, label: string): HTMLButtonElement =>
      [...row.querySelectorAll<HTMLButtonElement>(selector)].find((b) =>
        b.textContent?.startsWith(label),
      )!;
    const play = (label: string): void => button('.rim-demo-acts button', label).click();
    const pick = (label: string): void => button('.preview-chip', label).click();

    play('Clean fight');
    expect(rimOf(demo)).toEqual(['fight-clean']);
    play('Level-up');
    expect(rimOf(demo)).toEqual(['fight-levelup']);
    play('Hit');
    expect(rimOf(demo)).toEqual(['fight-hurt']);

    // A flash that does not play leaves the last colour's class where it was.
    pick('Level-ups and damage');
    play('Clean fight');
    expect(rimOf(demo)).toEqual(['fight-hurt']);
    play('Level-up');
    expect(rimOf(demo)).toEqual(['fight-levelup']);

    pick('Off');
    play('Hit');
    expect(rimOf(demo)).toEqual(['fight-levelup']);
    expect(app.settings.presentation.fightRim).toBe('off');
  });
});

describe('Escape and the entry modes', () => {
  const onGame = (): boolean => document.querySelector('.screen.game') !== null;

  it('backs out one thing at a time on a board: the spell, the tier, then the board', () => {
    app.play('arcane', 1, 7);
    app.actions.pickTier(2);
    app.actions.pickSpell('reveal');
    key('Escape');
    expect(app.mode.pendingSpell).toBeNull();
    app.actions.pickTier(2);
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

  // Keys reach a board only while it is on screen (issue #6).
  it('leaves the board under the settings screen alone', () => {
    app.play('arcane', 1, 7);
    app.actions.pickSpell('reveal');
    app.showSettings(() => app.buildGameScreen());
    key('n');
    key('Escape');
    expect(app.mode.pendingSpell).toBe('reveal');
    expect(app.mode.notesMode).toBe(false);
  });

  it('treats Escape on the settings screen as Back, to the same board', () => {
    app.play('normal', 1, 7);
    const game = app.current;
    app.showSettings(() => app.buildGameScreen());
    key('Escape');
    expect(onGame()).toBe(true);
    expect(app.current).toBe(game);
    expect(game?.status).toBe('playing');
  });

  it('goes back to the run, without asking to abandon it, from settings over a Full Run', () => {
    app.runFull('easy', 7);
    app.showSettings(() => app.buildGameScreen());
    key('Escape');
    expect(document.querySelector('.overlay')).toBeNull();
    expect(onGame()).toBe(true);
    expect(text('.board-label')).toContain('board 1 of 10');
  });

  it('goes back to the ladder list from settings opened there', () => {
    app.showSettings(() => app.showTypes());
    key('Escape');
    expect(document.querySelector('.settings-screen')).toBeNull();
    expect(document.querySelectorAll('.type-card').length).toBe(24);
  });

  it('sends no key to a board the player has left', () => {
    app.play('normal', 1, 7);
    key('Escape');
    expect(onGame()).toBe(false);
    key('n');
    expect(app.mode.notesMode).toBe(false);
  });

  it('still lets Escape answer a question off the board', () => {
    app.ask({
      title: 'SURE?',
      body: 'A question on the ladder list.',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
      onConfirm: () => {},
    });
    expect(text('.overlay h2')).toBe('SURE?');
    key('Escape');
    expect(document.querySelector('.overlay')).toBeNull();
  });
});
