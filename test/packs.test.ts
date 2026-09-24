/**
 * The pack rule, as executable specifications.
 *
 * The same three alarms PAIRS carries, because they fail the same way: a board
 * with a pack of five still plays, a board with a pack holding two tier 3s
 * still plays, and a board a pack light still plays and simply cannot be
 * finished, on that seed only.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType, type LadderType } from '../src/engine/config.js';
import { neighbours } from '../src/engine/board.js';
import {
  PACK_MAX_DENSITY,
  choosePacks,
  dealPacks,
  missingFrom,
  packFault,
  packsIn,
} from '../src/engine/packs.js';
import { mulberry32 } from '../src/engine/rng.js';
import { Game } from '../src/engine/game.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';
import type { Cell } from '../src/engine/types.js';
import { ladders, PLACEMENT_SEEDS as SEEDS, UNGATED_SWEEP } from './helpers.js';

const packs = findType(ladders, 'packs');

function allRows(type: LadderType) {
  return [...type.boards, ...type.extended];
}

function gameFor(board: number, seed: number): Game {
  return Game.create(boardConfig(ladders, 'packs', board), seed, UNGATED_SWEEP);
}

function creatureCells(game: Game): Cell[] {
  return game.grid.flat().filter((c) => c.present && c.tier > 0);
}

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

describe('the ladder data packs need', () => {
  it('deals six tiers on every board, a pack being one of each', () => {
    // Pinned rather than left to the schedule, for DOMINOES's reason: a
    // schedule edit that brought a tier ramp in would still generate and
    // still be tuned correctly, and would quietly be a different mode.
    for (const row of allRows(packs)) {
      expect(row.tiers, `PACKS#${row.n}`).toBe(6);
      expect(packsIn(row.tiers, row.quantity), `PACKS#${row.n}`).not.toBeNull();
    }
  });

  it('stays inside the density the packing can be laid down at', () => {
    for (const row of allRows(packs)) {
      expect(row.monsters / row.cells, `PACKS#${row.n}`).toBeLessThanOrEqual(PACK_MAX_DENSITY);
    }
  });
});

describe('the rule itself', () => {
  it('stands every creature in a connected pack of one of each tier, packs never touching', () => {
    for (const row of allRows(packs)) {
      const cfg = boardConfig(ladders, 'packs', row.n);
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        const tierAt = new Map(creatureCells(game).map((c) => [c.y * cfg.width + c.x, c.tier]));
        const fault = packFault(
          tierAt,
          (flat) =>
            neighbours(
              game.grid,
              flat % cfg.width,
              Math.floor(flat / cfg.width),
              cfg.topology,
              cfg.wrap,
            ).map((n) => n.y * cfg.width + n.x),
          cfg.tiers,
        );
        expect(fault, `PACKS#${row.n} seed ${seed}`).toBeNull();
      }
    }
  });

  it('places exactly the quota the thresholds were tuned against', () => {
    for (const row of allRows(packs)) {
      const cfg = boardConfig(ladders, 'packs', row.n);
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        expect(creatureCells(game)).toHaveLength(row.monsters);
        for (let t = 1; t <= cfg.tiers; t++) {
          expect(creatureCells(game).filter((c) => c.tier === t)).toHaveLength(
            cfg.quantity[t - 1]!,
          );
        }
      }
    }
  });

  it('grows loose shapes, not only compact blocks', () => {
    // The shape asked for. A pack whose bounding box is wider than 3 in
    // either direction cannot be a 2x3 block, so some of them should be.
    const cfg = boardConfig(ladders, 'packs', 5);
    const game = Game.create(cfg, SEEDS[0]!);
    const seen = new Set<Cell>();
    let stretched = 0;
    for (const start of creatureCells(game)) {
      if (seen.has(start)) continue;
      const pack = [start];
      seen.add(start);
      for (let i = 0; i < pack.length; i++) {
        for (const n of game.neighboursOf(pack[i]!)) {
          if (n.tier > 0 && !seen.has(n)) {
            seen.add(n);
            pack.push(n);
          }
        }
      }
      const xs = pack.map((c) => c.x);
      const ys = pack.map((c) => c.y);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (span >= 3) stretched++;
    }
    expect(stretched).toBeGreaterThan(0);
  });
});

describe('what Sweep may conclude from the packs', () => {
  const mk = (x: number, tier: number, open: boolean): Cell =>
    ({ x, y: 0, tier, open, present: true }) as Cell;

  it('caps a piece at the strongest tier it has not shown yet', () => {
    const row = [mk(0, 1, true), mk(1, 6, true), mk(2, 3, true), mk(3, 0, false)];
    const near = (c: Cell): Cell[] => row.filter((o) => Math.abs(o.x - c.x) === 1);
    const gaps = missingFrom(row, near, 6);
    expect(gaps.get(row[0]!)).toBe(5);
    expect(gaps.get(row[1]!)).toBe(5);
    expect(gaps.has(row[3]!)).toBe(false);
  });

  it('says a whole pack is missing nothing, which frees its ring at any level', () => {
    const row = [1, 2, 3, 4, 5, 6].map((t, i) => mk(i, t, true));
    const near = (c: Cell): Cell[] => row.filter((o) => Math.abs(o.x - c.x) === 1);
    for (const gap of missingFrom(row, near, 6).values()) expect(gap).toBe(0);
  });

  it('never costs HP, however many times it is swept', () => {
    for (const row of packs.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        for (let i = 0; i < 20; i++) game.sweep({ useMarks: false });
        expect(game.hp, `PACKS#${row.n} seed ${seed}`).toBe(game.maxHp);
      }
    }
  });

  it('does not carry a board on its own', () => {
    // A freed ring holds packmates and blank ground, because no other pack
    // may touch this one — so a trigger finishes one pack and stops.
    for (const row of packs.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        for (let i = 0; i < 30; i++) game.sweep({ useMarks: false });
        expect(game.status, `PACKS#${row.n} seed ${seed}`).toBe('playing');
        expect(game.creaturesLeft()).toBeGreaterThan(0);
      }
    }
  });
});

describe('the four load-bearing facts survive it', () => {
  it('clears every board without taking a single point of damage', () => {
    for (const row of packs.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        const result = autoplayTierOrder(game);
        expect(result.cleared, `PACKS#${row.n} seed ${seed}`).toBe(true);
        expect(game.hp).toBe(game.maxHp);
      }
    }
  });
});

describe('the boundary refuses what it cannot build', () => {
  const bend = (over: Partial<(typeof packs.boards)[0]>): LadderType => ({
    ...packs,
    id: 'bent',
    boards: [{ ...packs.boards[0]!, ...over }],
    extended: [],
  });

  it('refuses a quantity that is not whole packs', () => {
    const q = [...packs.boards[0]!.quantity];
    q[5] = q[5]! - 1;
    expect(() =>
      boardConfig([bend({ quantity: q, monsters: q.reduce((a, b) => a + b) })], 'bent', 1),
    ).toThrow(/whole number of packs/);
  });

  it('refuses a density the packing cannot reach', () => {
    const q = Array(6).fill(40);
    expect(() => boardConfig([bend({ quantity: q, monsters: 240 })], 'bent', 1)).toThrow(
      /non-touching packs/,
    );
  });
});

describe('choosePacks on its own', () => {
  it('lands the exact count asked for', () => {
    const { cells, near } = square(30, 16);
    for (const seed of SEEDS) {
      const out = choosePacks(cells, near, 24, 6, mulberry32(seed));
      expect(out).toHaveLength(24);
      const tierAt = dealPacks(out, 6, mulberry32(seed));
      expect(packFault(tierAt, near, 6)).toBeNull();
    }
  });

  it('throws rather than returning a short board it cannot vouch for', () => {
    const { cells, near } = square(12, 12);
    expect(() => choosePacks(cells, near, 20, 6, mulberry32(3))).toThrow(/could not place/);
  });
});
