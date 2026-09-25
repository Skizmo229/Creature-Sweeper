/**
 * The pairing rule, as executable specifications.
 *
 * Three of these are alarms rather than tests: the rule, the even total and
 * the exact quota all fail SILENTLY if they are ever broken. A board with a
 * stray lone creature still plays; a board two creatures light still plays,
 * and simply cannot be finished, on that seed only.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType, type LadderType } from '../src/engine/config.js';
import { choosePairs, pairingFault, ringIsFree } from '../src/engine/placement/pairs.js';
import { mulberry32 } from '../src/engine/rng.js';
import { Game } from '../src/engine/game.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';
import type { Cell } from '../src/engine/types.js';
import { ladders, PLACEMENT_SEEDS as SEEDS, UNGATED_SWEEP } from './helpers.js';

const pairs = findType(ladders, 'pairs');

/** Every board of the ladder and its continuation. */
function allRows(type: LadderType) {
  return [...type.boards, ...type.extended];
}

function gameFor(board: number, seed: number): Game {
  return Game.create(boardConfig(ladders, 'pairs', board), seed, UNGATED_SWEEP);
}

function creatureCells(game: Game): Cell[] {
  return game.grid.flat().filter((c) => c.present && c.tier > 0);
}

describe('the ladder data pairing needs', () => {
  it('asks for an even number of creatures on every board', () => {
    for (const row of allRows(pairs)) {
      const total = row.quantity.reduce((a, b) => a + b, 0);
      expect(total % 2, `PAIRS#${row.n} has ${total} creatures`).toBe(0);
      expect(total).toBe(row.monsters);
    }
  });

  it('stays inside the density a non-touching packing can be laid down at', () => {
    // The structural ceiling, not the "a board stops being a puzzle" one. A
    // schedule past this does not make a hard board, it makes a board that
    // fails to generate on some seeds.
    for (const row of allRows(pairs)) {
      expect(row.monsters / row.cells, `PAIRS#${row.n}`).toBeLessThanOrEqual(0.26);
    }
  });
});

describe('the rule itself', () => {
  it('leaves the tiers unpaired — a partner is as likely to be any tier', () => {
    // The mode constrains WHERE creatures stand, never what they are worth.
    // If pairing ever became tier-aware it would reach `quantity` and
    // therefore C_k, which is the one thing a placement may not do.
    const cfg = boardConfig(ladders, 'pairs', 10);
    let mixed = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const game = Game.create(cfg, seed);
      for (const cell of creatureCells(game)) {
        const partner = game.neighboursOf(cell).find((n) => n.tier > 0)!;
        total++;
        if (partner.tier !== cell.tier) mixed++;
      }
    }
    expect(mixed / total).toBeGreaterThan(0.5);
  });
});

describe("a creature's number is its partner's tier", () => {
  it('holds for every creature on every board — the whole mode rests on it', () => {
    // Nothing but the partner borders a creature, and a number is the SUM of
    // neighbouring tiers, so the two are the same quantity. This is what makes
    // killing anything worth doing: it names what it was standing next to.
    for (const row of pairs.boards) {
      const cfg = boardConfig(ladders, 'pairs', row.n);
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        for (const cell of creatureCells(game)) {
          const partner = game.neighboursOf(cell).find((n) => n.tier > 0)!;
          expect(cell.num, `PAIRS#${row.n} seed ${seed} at ${cell.x},${cell.y}`).toBe(partner.tier);
        }
      }
    }
  });
});

describe('what Sweep may conclude from the pairing', () => {
  it('frees the ring around a defeated creature whose partner is in reach', () => {
    // Proof A: the number is the partner's tier, so at or below your level
    // every covered neighbour is either that partner or empty ground.
    const cell = { tier: 3, num: 2, open: true } as Cell;
    expect(ringIsFree(cell, [], 2)).toBe(true);
    expect(ringIsFree(cell, [], 1)).toBe(false);
  });

  it('frees it at any level once the partner is already open', () => {
    // Proof B: a creature beside a creature has met its partner, so
    // everything else around it is empty ground — no level required.
    const cell = { tier: 3, num: 9, open: true } as Cell;
    const partner = { tier: 9, open: true } as Cell;
    expect(ringIsFree(cell, [partner], 1)).toBe(true);
    expect(ringIsFree(cell, [{ tier: 9, open: false } as Cell], 1)).toBe(false);
  });

  it('concludes nothing from empty ground', () => {
    // Blank cells have no partner; their numbers are ordinary sums of up to
    // four tiers and are read the ordinary way.
    expect(ringIsFree({ tier: 0, num: 0, open: true } as Cell, [], 9)).toBe(false);
  });

  it('never costs HP, however many times it is swept', () => {
    // The proofs stand with `proven` rather than with the marks, so the
    // strict button must be exactly that — strict.
    for (const row of pairs.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        for (let i = 0; i < 20; i++) game.sweep({ useMarks: false });
        expect(game.hp, `PAIRS#${row.n} seed ${seed}`).toBe(game.maxHp);
      }
    }
  });

  it('does not carry a board on its own', () => {
    // The runaway guard, and the reason is the PACKING rather than anything
    // about levels: a freed ring holds the partner and otherwise blank
    // ground, because no second pair may touch the first. So a trigger clears
    // one domino and stops, and the cascade it sets off kills nothing.
    for (const row of pairs.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        for (let i = 0; i < 30; i++) game.sweep({ useMarks: false });
        expect(game.status, `PAIRS#${row.n} seed ${seed}`).toBe('playing');
        expect(game.creaturesLeft()).toBeGreaterThan(0);
      }
    }
  });
});

describe('the four load-bearing facts survive it', () => {
  it('clears every board without taking a single point of damage', () => {
    // The zero-damage guarantee, which pairing cannot reach: it decides where
    // creatures stand, never how many there are or what they are worth.
    for (const row of pairs.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        const result = autoplayTierOrder(game);
        expect(result.cleared, `PAIRS#${row.n} seed ${seed}`).toBe(true);
        expect(game.hp).toBe(game.maxHp);
      }
    }
  });
});

describe('the boundary refuses what it cannot build', () => {
  const base = findType(ladders, 'pairs');
  const bend = (over: Partial<(typeof base.boards)[0]>): LadderType => ({
    ...base,
    id: 'bent',
    boards: [{ ...base.boards[0]!, ...over }],
    extended: [],
  });

  it('refuses an odd total, because one creature would have nobody', () => {
    const q = [...base.boards[0]!.quantity];
    q[0] = q[0]! + 1;
    expect(() => boardConfig([bend({ quantity: q })], 'bent', 1)).toThrow(/cannot pair up/);
  });

  it('refuses a density the packing cannot reach', () => {
    expect(() => boardConfig([bend({ quantity: [80, 60, 40, 20, 10] })], 'bent', 1)).toThrow(
      /non-touching domino packing/,
    );
  });
});

describe('choosePairs on its own', () => {
  /** A plain w x h grid of flat indices, with eight-way adjacency. */
  function square(w: number, h: number) {
    const cells = [...Array(w * h).keys()];
    const near = (flat: number): number[] => {
      const x = flat % w;
      const y = Math.floor(flat / w);
      const out: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
        }
      return out;
    };
    return { cells, near };
  }

  it('refuses an odd request rather than leaving someone unpartnered', () => {
    const { cells, near } = square(10, 10);
    expect(() => choosePairs(cells, near, 7, mulberry32(1))).toThrow(/even number/);
  });

  it('lands the exact count asked for', () => {
    const { cells, near } = square(30, 16);
    for (const seed of SEEDS) {
      const out = choosePairs(cells, near, 82, mulberry32(seed));
      expect(out).toHaveLength(82);
      expect(pairingFault(out, near)).toBeNull();
    }
  });

  it('throws rather than returning a short board it cannot vouch for', () => {
    // A quota past the packing's reach is refused outright. Silently
    // returning fewer is the failure this whole file exists to prevent.
    const { cells, near } = square(12, 12);
    expect(() => choosePairs(cells, near, 100, mulberry32(3))).toThrow(/could not place/);
  });
});
