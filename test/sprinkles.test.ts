/**
 * The sprinkle rule, as executable specifications: pairs free to touch, every creature's place
 * shown, and the proofs that showing them hands Sweep, each held to never calling a creature free
 * that is not.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType, type LadderType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { noteTiers } from '../src/engine/notes.js';
import { placementRule } from '../src/engine/placement/registry.js';
import { layTouchingPairs, shownCap } from '../src/engine/placement/sprinkles.js';
import { mulberry32 } from '../src/engine/rng.js';
import type { Cell, Placement } from '../src/engine/types.js';
import { ladders, PLACEMENT_SEEDS as SEEDS, UNGATED_SWEEP } from './helpers.js';

const sprinkled = findType(ladders, 'sprinkle_donut');
const rule = placementRule('sprinkles');

function gameFor(board: number, seed: number): Game {
  return Game.create(boardConfig(ladders, 'sprinkle_donut', board), seed, UNGATED_SWEEP);
}

const creatures = (game: Game): Cell[] => game.grid.flat().filter((c) => c.present && c.tier > 0);
const covered = (game: Game): Cell[] => game.grid.flat().filter((c) => c.present && !c.open);

/**
 * Open free cells beside open ground in a seeded order, yielding after each, until none is left:
 * omniscient, because the point is to reach many mid-game states, not to play well.
 */
function* walk(game: Game, seed: number): Generator<void> {
  const rng = mulberry32(seed);
  while (game.status === 'playing') {
    const free = covered(game).filter((c) => c.tier <= game.level && game.inReach(c));
    if (free.length === 0) return;
    const pick = free[Math.floor(rng() * free.length)]!;
    game.open(pick.x, pick.y);
    yield;
  }
}

describe('the ladder data the sprinkles need', () => {
  it('asks for an even number of creatures on every board', () => {
    for (const row of [...sprinkled.boards, ...sprinkled.extended]) {
      const total = row.quantity.reduce((a, b) => a + b, 0);
      expect(total % 2, `SPRINKLE DONUT#${row.n} has ${total} creatures`).toBe(0);
    }
  });
});

describe('the pairs', () => {
  it('touch other pairs, which is what sets the rule apart from PAIRS', () => {
    let touching = 0;
    for (const seed of SEEDS) {
      const game = gameFor(10, seed);
      for (const cell of creatures(game)) {
        const others = game.neighboursOf(cell).filter((n) => n.tier > 0);
        if (others.length > 1) touching++;
      }
    }
    expect(touching).toBeGreaterThan(0);
  });

  it('leave the tiers unpaired: a partner is as likely to be any tier', () => {
    // The rule decides where creatures stand, never what they are worth, or it would reach
    // `quantity` and C_k.
    let mixed = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const game = gameFor(10, seed);
      for (const cell of creatures(game)) {
        const mate = game.grid[cell.partner!.y]![cell.partner!.x]!;
        total++;
        if (mate.tier !== cell.tier) mixed++;
      }
    }
    expect(mixed / total).toBeGreaterThan(0.5);
  });

  it('are laid in every direction, diagonals included, so a sprinkle lies at any of four angles', () => {
    const directions = new Set<string>();
    const game = gameFor(10, SEEDS[0]!);
    for (const cell of creatures(game)) {
      directions.add(`${cell.partner!.x - cell.x},${cell.partner!.y - cell.y}`);
    }
    expect(directions.size).toBe(8);
  });

  it('refuse an odd request rather than leaving a creature alone', () => {
    expect(() => layTouchingPairs([0, 1, 2], () => [], 3, mulberry32(1))).toThrow(/even/);
  });
});

describe('what the shown places prove', () => {
  it('offer the pencil empty ground on plain glaze and anything else on a sprinkle', () => {
    const game = gameFor(1, SEEDS[0]!);
    for (const cell of covered(game)) {
      const offered = noteTiers(game.noteCandidates(cell));
      expect(offered).toEqual(cell.tier === 0 ? [0] : [1, 2, 3, 4, 5]);
    }
  });

  it('never cap a covered creature below its tier, and never call one empty, however far the board is played', () => {
    // The test that matters: every cap and every cell `emptied` names is a free Sweep into a
    // creature if it is ever wrong.
    const wrong: string[] = [];
    let checked = 0;
    for (const board of [1, 5, 10]) {
      for (const seed of SEEDS.slice(0, 3)) {
        const game = gameFor(board, seed);
        let step = 0;
        const check = () => {
          for (const cell of rule.emptied(game)) {
            if (cell.tier > 0) wrong.push(`#${board} seed ${seed}: (${cell.x},${cell.y}) emptied`);
          }
          for (const open of game.grid.flat()) {
            if (!open.present || !open.open) continue;
            const ring = game.neighboursOf(open);
            const hidden = open.num - ring.filter((n) => n.open).reduce((a, n) => a + n.tier, 0);
            const among = ring.filter((n) => !n.open);
            for (const n of among) {
              checked++;
              if (shownCap(n, hidden, among) < n.tier) {
                wrong.push(`#${board} seed ${seed}: (${n.x},${n.y}) a ${n.tier} capped lower`);
              }
            }
          }
        };
        check();
        for (const _ of walk(game, seed)) if (++step % 5 === 0) check();
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(1000);
  });

  it('caps a sprinkle by the creatures sharing its number, each worth at least 1', () => {
    const creature = (tier: number) => ({ tier }) as Cell;
    const a = creature(1);
    const b = creature(3);
    const plain = creature(0);
    // 4 hidden over two creatures and a plain cell: neither can be more than 3.
    expect(shownCap(a, 4, [a, b, plain])).toBe(3);
    expect(shownCap(b, 4, [a, b, plain])).toBe(3);
    expect(shownCap(plain, 4, [a, b, plain])).toBe(0);
  });

  it('let a strict Sweep open plain glaze and proven creatures without ever costing HP', () => {
    let opened = 0;
    for (const board of [1, 10]) {
      for (const seed of SEEDS) {
        const game = gameFor(board, seed);
        const before = game.grid.flat().filter((c) => c.open).length;
        for (let i = 0; i < 20; i++) game.sweep({ useMarks: false });
        expect(game.hp, `#${board} seed ${seed}`).toBe(game.maxHp);
        opened += game.grid.flat().filter((c) => c.open).length - before;
      }
    }
    expect(opened).toBeGreaterThan(0);
  });

  it('are drawn on this ladder alone', () => {
    for (const type of ladders) {
      const placement = (type.placement ?? 'uniform') as Placement;
      expect(placementRule(placement).display.showsCreatures, type.id).toBe(
        placement === 'sprinkles',
      );
    }
  });
});

describe('the boundary refuses what it cannot build', () => {
  const bend = (over: Partial<LadderType>, q?: number[]): LadderType => ({
    ...sprinkled,
    ...over,
    id: 'bent',
    boards: [{ ...sprinkled.boards[0]!, ...(q ? { quantity: q } : {}) }],
    extended: [],
  });

  it('refuses an odd total, because one creature would have nobody', () => {
    const q = [...sprinkled.boards[0]!.quantity];
    q[0] = q[0]! + 1;
    expect(() => boardConfig([bend({}, q)], 'bent', 1)).toThrow(/cannot pair up/);
  });

  it('refuses a density the lay-down cannot land', () => {
    expect(() => boardConfig([bend({}, [200, 100, 50, 20, 10])], 'bent', 1)).toThrow(
      /laid down reliably/,
    );
  });

  it('refuses a wrapped board, where a pair could lie across the seam', () => {
    expect(() => boardConfig([bend({ wrap: 'both' })], 'bent', 1)).toThrow(/seam/);
  });
});
