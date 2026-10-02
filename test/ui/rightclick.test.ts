// @vitest-environment happy-dom
/**
 * What a right-click does to a covered cell, as a setting: the mark cycled up, as it always was,
 * cycled down, cycled through the tiers still on the counters, or cleared; on a board in play and
 * in the arithmetic on its own.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../../src/engine/game.js';
import { nextMark } from '../../src/ui/game/actions.js';
import type { RightClick } from '../../src/ui/presentation.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { type AppDriver, mountApp, settingsRow, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

/** A board of five tiers with creatures of tiers 1 and 2 only, so 3, 4 and 5 are off the counters. */
const sparse = (): Game =>
  Game.fromLayout(['1 2 . .', '. . . .'], ['? ? ? ?', '? ? ? ?'], { tiers: 5, startLevel: 1 });

/** The marks a rule leaves, clicking the same unmarked cell over and over. */
function cycle(game: Game, rule: RightClick, clicks: number): number[] {
  const out: number[] = [];
  let mark = 0;
  for (let i = 0; i < clicks; i++) {
    mark = nextMark(game, mark, rule);
    out.push(mark);
  }
  return out;
}

describe('the mark a right-click leaves', () => {
  it('cycles up, down, through the counters, or clears', () => {
    const game = sparse();
    expect(cycle(game, 'cycleUp', 7)).toEqual([1, 2, 3, 4, 5, 0, 1]);
    expect(cycle(game, 'cycleDown', 7)).toEqual([5, 4, 3, 2, 1, 0, 5]);
    expect(cycle(game, 'cycleCounters', 4)).toEqual([1, 2, 0, 1]);
    expect(cycle(game, 'clear', 2)).toEqual([0, 0]);
    expect(nextMark(game, 4, 'clear')).toBe(0);
  });
});

describe('on a board', () => {
  const covered = (): { x: number; y: number } =>
    app.current!.grid.flat().find((c) => c.present && !c.open)!;

  it('marks as the setting says, and takes a mark off where the cycle comes round', () => {
    app.play('normal', 1, 7);
    const cell = covered();
    app.actions.cycleMark(cell.x, cell.y);
    expect(app.current!.cellAt(cell.x, cell.y)!.mark).toBe(1);
    app.settings.setPresentation({ rightClick: 'cycleDown' });
    app.actions.cycleMark(cell.x, cell.y);
    expect(app.current!.cellAt(cell.x, cell.y)!.mark).toBe(0);
    app.actions.cycleMark(cell.x, cell.y);
    expect(app.current!.cellAt(cell.x, cell.y)!.mark).toBe(5);
    app.settings.setPresentation({ rightClick: 'clear' });
    app.actions.cycleMark(cell.x, cell.y);
    expect(app.current!.cellAt(cell.x, cell.y)!.mark).toBe(0);
    // Clearing a cell with no mark is nothing, not a move.
    const moves = app.current!.moves;
    app.actions.cycleMark(cell.x, cell.y);
    expect(app.current!.cellAt(cell.x, cell.y)!.mark).toBe(0);
    expect(app.current!.moves).toBe(moves);
  });

  it('is offered on the settings screen, and read from a save without it as cycling up', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Right-click');
    expect(tiles(row)).toHaveLength(4);
    tiles(row)[2]!.click();
    expect(Settings.load().presentation.rightClick).toBe('cycleCounters');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.rightClick).toBe('cycleUp');
  });
});
