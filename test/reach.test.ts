/**
 * The crawl rule's geometry (`src/engine/reach.ts`): distance is a walk through `neighbours()`,
 * so it follows the topology and crosses a seam. How the rule plays on a board, walls and targeted
 * spells included, is in `game.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game.js';
import { type ReachView, computeSealed, withinReach } from '../src/engine/reach.js';
import type { BoardConfig } from '../src/engine/types.js';
import { testConfig } from './helpers.js';

/** An empty board with a crawl rule, every cell covered and empty until the test says otherwise. */
function crawl(over: Partial<BoardConfig>): Game {
  // One creature, so the deal fits any strip; the layout is drawn over it.
  const game = Game.create(testConfig({ reach: 2, quantity: [1, 0, 0], ...over }), 1);
  for (const cell of game.grid.flat()) {
    cell.tier = 0;
    cell.open = false;
  }
  return game;
}

const view = (game: Game, level = 1): ReachView => ({
  grid: game.grid,
  config: game.config,
  level,
  neighboursOf: (c) => game.neighboursOf(c),
});

const inReach = (game: Game, x: number, y: number): boolean =>
  withinReach(view(game), game.grid[y]![x]!);

describe('within reach', () => {
  it('is two steps and not three', () => {
    const game = crawl({ width: 8, height: 3 });
    game.grid[1]![0]!.open = true;
    expect(inReach(game, 2, 1)).toBe(true);
    expect(inReach(game, 3, 1)).toBe(false);
  });

  it('counts a diagonal as one step on a square grid, and six directions on hex', () => {
    // Two steps from one open cell: the 5x5 block less its centre on a square grid, and two hex
    // rings (6 + 12) on a hex one.
    for (const [topology, cells] of [
      ['square', 24],
      ['hex', 18],
    ] as const) {
      const game = crawl({ width: 9, height: 9, topology });
      game.grid[4]![4]!.open = true;
      const reached = game.grid.flat().filter((c) => !c.open && withinReach(view(game), c));
      expect(reached, topology).toHaveLength(cells);
    }
  });

  it('crosses a wrapped seam, and only a wrapped one', () => {
    for (const wrap of ['horizontal', 'none'] as const) {
      const game = crawl({ width: 8, height: 3, wrap });
      game.grid[1]![0]!.open = true;
      expect(inReach(game, 7, 1), wrap).toBe(wrap === 'horizontal');
      expect(inReach(game, 6, 1), wrap).toBe(wrap === 'horizontal');
      expect(inReach(game, 5, 1), wrap).toBe(false);
    }
  });

  it('is everywhere on a board with nothing open', () => {
    const game = crawl({ width: 8, height: 8 });
    expect(game.grid.flat().every((c) => withinReach(view(game), c))).toBe(true);
  });
});

describe('marks that extend reach', () => {
  /** A 9x1 strip with its left end open, a reach of 1, and marks that count where the test says. */
  const dish = (marksExtendReach: boolean): Game => {
    const game = crawl({ width: 9, height: 1, reach: 1, marksExtendReach });
    game.grid[0]![0]!.open = true;
    return game;
  };

  it('carries the reach one step past a mark touching uncovered ground', () => {
    const game = dish(true);
    expect(inReach(game, 2, 0)).toBe(false);
    game.grid[0]![1]!.mark = 3;
    expect(inReach(game, 2, 0)).toBe(true);
    expect(inReach(game, 3, 0)).toBe(false);
  });

  it('never chains: a mark only counts while it touches ground really uncovered', () => {
    const game = dish(true);
    game.grid[0]![1]!.mark = 3;
    game.grid[0]![2]!.mark = 1;
    game.grid[0]![3]!.mark = 2;
    expect(inReach(game, 3, 0)).toBe(false);
    expect(inReach(game, 4, 0)).toBe(false);
  });

  it('counts for nothing where the board does not say so', () => {
    const game = dish(false);
    game.grid[0]![1]!.mark = 3;
    expect(inReach(game, 2, 0)).toBe(false);
  });

  it('leaves sealing to open ground, so a mark can never probe what lies past it', () => {
    // Everything touching the open end is too strong; the cell past the mark is free.
    const game = dish(true);
    game.grid[0]![1]!.tier = 3;
    game.grid[0]![1]!.mark = 3;
    expect(computeSealed(view(game, 1))).toBe(true);
  });
});

describe('sealed in', () => {
  /** An 8x1 strip, open at the left end, with the rest as the test lays it. */
  const strip = (rest: string): Game => {
    const game = crawl({ width: 8, height: 1 });
    game.grid[0]![0]!.open = true;
    [...rest].forEach((ch, i) => (game.grid[0]![i + 1]!.tier = ch === '.' ? 0 : Number(ch)));
    return game;
  };

  it('is sealed when everything within reach is above your level', () => {
    expect(computeSealed(view(strip('33.....'), 1))).toBe(true);
  });

  it('is not sealed while one cell within reach is free', () => {
    expect(computeSealed(view(strip('3......'), 1))).toBe(false);
    expect(computeSealed(view(strip('33.....'), 3))).toBe(false);
  });

  it('ignores a free cell beyond reach: that is exactly what seals you in', () => {
    expect(computeSealed(view(strip('333....'), 1))).toBe(true);
  });
});
