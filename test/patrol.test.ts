/**
 * PATROL, as executable specifications: the routes, the walking, a creature covering uncovered
 * ground while it stands there, one move per action, marks that draw routes, and Sweep that reads
 * none of them. The deal's own promises (the quota lands, no two routes share a cell) are held on
 * every real board by `test/placement.test.ts`, and the zero-damage clear by the invariants.
 */

import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game.js';
import { neighbours } from '../src/engine/grid.js';
import { routeCells, routeStep } from '../src/engine/patrol.js';
import type { Cell } from '../src/engine/types.js';
import { UNGATED_SWEEP, testConfig } from './helpers.js';

/** A 12x12 patrol board: two tier 1s, a tier 2 and a tier 3, and the opening asked for. */
function patrolGame(seed: number, opening: 'auto' | 'none' = 'auto'): Game {
  return Game.create(
    testConfig({ width: 12, height: 12, placement: 'patrol', quantity: [2, 1, 1], opening }),
    seed,
    UNGATED_SWEEP,
  );
}

/** Every creature as dealt, which is on its route's corner. */
const corners = (game: Game): Cell[] => game.grid.flat().filter((c) => c.tier > 0);

/** The sum of the tiers round a cell, as its number should read. */
const sumAround = (game: Game, cell: Cell): number =>
  neighbours(game.grid, cell.x, cell.y).reduce((a, n) => a + n.tier, 0);

describe('a route', () => {
  it('walks a square t cells a side, clockwise from its top-left corner, home after 4t', () => {
    expect(routeCells(0, 0, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    const three = routeCells(2, 5, 3);
    expect(three).toHaveLength(12);
    expect(new Set(three.map((c) => `${c.x},${c.y}`)).size).toBe(12);
    expect(three.slice(0, 4)).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(routeStep(2, 5, 3, 12)).toEqual({ x: 2, y: 5 });
    expect(routeStep(2, 5, 3, 6)).toEqual({ x: 5, y: 8 });
  });
});

describe('walking', () => {
  it('moves every creature one step along its route per action, and re-sums the numbers', () => {
    for (const seed of [1, 2, 3]) {
      const game = patrolGame(seed);
      const start = corners(game).map((c) => ({ x: c.x, y: c.y, tier: c.tier }));
      for (let move = 1; move <= 13; move++) {
        game.wait();
        expect(game.moves).toBe(move);
        for (const w of start) {
          const at = routeStep(w.x, w.y, w.tier, move);
          expect(game.grid[at.y]![at.x]!).toMatchObject({ tier: w.tier, alive: true });
        }
        expect(game.grid.flat().filter((c) => c.alive)).toHaveLength(start.length);
        for (const cell of game.grid.flat()) expect(cell.num).toBe(sumAround(game, cell));
      }
    }
  });

  it('covers uncovered ground while a creature stands on it, and uncovers it when it leaves', () => {
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = patrolGame(seed);
      for (let move = 0; move < 24; move++) {
        const standing = game.grid.flat().filter((c) => c.occupied);
        for (const cell of standing) {
          expect(cell).toMatchObject({ open: false, alive: true });
          expect(cell.tier).toBeGreaterThan(0);
        }
        game.wait();
        for (const cell of standing) {
          if (cell.tier > 0) continue;
          // Walked on: uncovered ground again, with nothing written on it.
          expect(cell).toMatchObject({ open: true, occupied: false, mark: 0, notes: 0 });
          seen++;
        }
      }
    }
    expect(seen, 'no creature ever walked across uncovered ground').toBeGreaterThan(0);
  });

  it('fights a creature standing on uncovered ground where it stands', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const game = patrolGame(seed);
      for (let move = 0; move < 24 && game.status === 'playing'; move++) {
        const target = game.grid.flat().find((c) => c.occupied && c.tier <= game.level);
        if (!target) {
          game.wait();
          continue;
        }
        const events = game.open(target.x, target.y);
        expect(events.some((e) => e.type === 'battle' && e.defeated)).toBe(true);
        expect(target).toMatchObject({ open: true, occupied: false, alive: false });
        return;
      }
    }
    throw new Error('no creature ever stood on uncovered ground at a level it could be fought');
  });

  it('leaves a beaten creature where it fell, still counted in the numbers', () => {
    const game = patrolGame(2);
    const victim = corners(game).find((c) => c.tier === 1)!;
    game.open(victim.x, victim.y);
    expect(victim).toMatchObject({ tier: 1, alive: false, open: true });
    for (let move = 0; move < 8; move++) game.wait();
    expect(victim).toMatchObject({ tier: 1, alive: false, open: true });
    for (const n of neighbours(game.grid, victim.x, victim.y)) {
      expect(n.num).toBe(sumAround(game, n));
    }
  });
});

describe('what is a move', () => {
  it('moves once for an open, a sweep or a wait, and never for a note, a mark or a refusal', () => {
    const game = patrolGame(3);
    const open = game.grid.flat().find((c) => c.open)!;
    const [covered, noted] = game.grid.flat().filter((c) => !c.open && c.tier === 0);

    expect(game.open(open.x, open.y)[0]).toMatchObject({ reason: 'already-open' });
    game.toggleNote(noted!.x, noted!.y, 2);
    game.setMark(0, 0, 1);
    expect(game.moves).toBe(0);

    game.open(covered!.x, covered!.y);
    expect(game.moves).toBe(1);
    game.wait();
    expect(game.moves).toBe(2);
    if (game.safeCells().length) {
      game.sweep();
      expect(game.moves).toBe(3);
    }
  });

  it('is PATROL alone: Wait does nothing on a board whose creatures stand still', () => {
    const game = Game.create(testConfig({ opening: 'auto' }), 1);
    expect(game.patrols).toBe(false);
    expect(game.wait()[0]).toMatchObject({ type: 'blocked', reason: 'no-effect' });
    expect(game.moves).toBe(0);
  });
});

describe('marks on PATROL', () => {
  /** A corner whose tier-2 route lies wholly on covered cells, on a fresh board. */
  const coveredCorner = (game: Game): Cell =>
    game.grid
      .flat()
      .find(
        (c) =>
          c.x + 2 < 12 &&
          c.y + 2 < 12 &&
          routeCells(c.x, c.y, 2).every(({ x, y }) => !game.grid[y]![x]!.open),
      )!;

  it('draws a whole route from the marked corner, and takes it off the same way', () => {
    const game = patrolGame(4, 'none');
    const corner = coveredCorner(game);
    game.setMark(corner.x, corner.y, 2);
    const route = routeCells(corner.x, corner.y, 2).map(({ x, y }) => game.grid[y]![x]!);
    expect(route.map((c) => c.mark)).toEqual(new Array(8).fill(2));
    expect(game.grid.flat().filter((c) => c.mark > 0)).toHaveLength(8);
    game.setMark(corner.x, corner.y, 2);
    expect(game.grid.flat().filter((c) => c.mark > 0)).toHaveLength(0);
  });

  it('refuses a route that would leave the board', () => {
    const game = patrolGame(4, 'none');
    expect(game.setMark(11, 11, 1)[0]).toMatchObject({ type: 'blocked', reason: 'out-of-bounds' });
  });

  it('shows the higher route where two cross, and guards every covered cell of it', () => {
    const game = patrolGame(4, 'none');
    const corner = coveredCorner(game);
    game.setMark(corner.x, corner.y, 2);
    game.setMark(corner.x, corner.y + 2, 3);
    expect(game.grid[corner.y + 2]![corner.x]!.mark).toBe(3);
    const guarded = game.grid.flat().find((c) => c.mark > game.level && !c.open)!;
    expect(game.open(guarded.x, guarded.y)[0]).toMatchObject({ reason: 'mark-guard' });
  });

  it('are not claims, so Sweep reads none of them however it is asked', () => {
    const game = patrolGame(4, 'none');
    const corner = coveredCorner(game);
    game.setMark(corner.x, corner.y, 1);
    expect(game.marksAreClaims).toBe(false);
    expect(game.safeCells({ useMarks: true })).toEqual(game.safeCells({ useMarks: false }));
    expect(Game.create(testConfig(), 1).marksAreClaims).toBe(true);
  });
});
