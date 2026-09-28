/**
 * The honest player's local deduction in `src/sim/deduce.ts`, held to the one
 * thing adjacency can break silently: two numbers whose covered cells nest are
 * subtracted wherever they stand, a wrapped seam included (issue #9).
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { type Constraint, allConstraints } from '../src/sim/deduce.js';
import { ladders, SEEDS } from './helpers.js';

/** Every pair the subtraction should find, by brute force over all numbers. */
function nestedPairs(numbers: Constraint[]): [Constraint, Constraint][] {
  const pairs: [Constraint, Constraint][] = [];
  for (const a of numbers) {
    if (a.unknown.length > 6) continue;
    for (const b of numbers) {
      if (a === b || a.unknown.length >= b.unknown.length) continue;
      if (a.unknown.every((c) => b.unknown.includes(c))) pairs.push([a, b]);
    }
  }
  return pairs;
}

describe('subtraction', () => {
  it('pairs every nested number, across a wrapped seam too', () => {
    let across = 0;
    for (const seed of SEEDS) {
      for (let board = 1; board <= 10; board++) {
        const game = Game.create(boardConfig(ladders, 'wraparound', board), seed);
        // Open what the rules prove, a few times over, so the frontier reaches the seams.
        for (let pass = 0; pass < 4; pass++) {
          for (const cell of game.safeCells()) game.open(cell.x, cell.y);
        }
        const all = allConstraints(game);
        // A number read directly sees every covered, unmarked neighbour; a difference sees fewer.
        const numbers = all.filter(
          (c) =>
            c.unknown.length ===
            game.neighboursOf(c.cell).filter((n) => !n.open && n.mark === 0).length,
        );
        const want = nestedPairs(numbers);
        expect(all.length - numbers.length).toBe(want.length);
        const half = game.config.width / 2;
        across += want.filter(([a, b]) => Math.abs(a.cell.x - b.cell.x) > half).length;
      }
    }
    expect(across).toBeGreaterThan(0);
  });
});
