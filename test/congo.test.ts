/**
 * The congo rule, as executable specifications.
 *
 * PACKS's alarms, because they fail the same way — a line of five still
 * plays, a line holding two tier 3s still plays, a board a line light still
 * plays and cannot be finished — plus the two things only this mode promises:
 * every group is a true line with no 2x2 in it, and the tier 6 is at the
 * front. And the one alarm that matters most for Sweep: `congoClear` claims a
 * cell is empty at ANY level, so a single wrong answer would be a free sweep
 * into a creature.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { boardConfig, findType, type LadderType } from '../src/engine/config.js';
import { neighbours } from '../src/engine/board.js';
import {
  CONGO_MAX_DENSITY,
  chooseLines,
  congoClear,
  congoFault,
  dealLines,
} from '../src/engine/congo.js';
import { packsIn } from '../src/engine/packs.js';
import { mulberry32 } from '../src/engine/rng.js';
import { Game } from '../src/engine/game.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';
import type { Cell } from '../src/engine/types.js';

const UNGATED_SWEEP = { settings: { ...DEFAULT_GAMEPLAY, sweep: 'on' as const } };

const ladders = loadLadders();
const congo = findType(ladders, 'congo');
const SEEDS = [0xc0ffee, 0x5eed, 0xbeef, 0x1d10, 0xfeed];

function allRows(type: LadderType) {
  return [...type.boards, ...type.extended];
}

function gameFor(board: number, seed: number): Game {
  return Game.create(boardConfig(ladders, 'congo', board), seed, UNGATED_SWEEP);
}

function creatureCells(game: Game): Cell[] {
  return game.grid.flat().filter((c) => c.present && c.tier > 0);
}

function faultOf(game: Game): string | null {
  const cfg = game.config;
  const tierAt = new Map(creatureCells(game).map((c) => [c.y * cfg.width + c.x, c.tier]));
  return congoFault(
    tierAt,
    (flat) =>
      neighbours(
        game.grid,
        flat % cfg.width,
        Math.floor(flat / cfg.width),
        cfg.topology,
        cfg.wrap,
      ).map((n) => n.y * cfg.width + n.x),
    cfg.width,
    cfg.height,
    cfg.tiers,
  );
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

/**
 * A hand-drawn board. `.` is empty ground, a digit is a creature of that
 * tier; an upper-case letter A-F is an OPEN creature of tier 1-6, and `_` is
 * open empty ground.
 */
function drawn(rows: string[]): Cell[][] {
  return rows.map((row, y) =>
    [...row].map((ch, x) => {
      const upper = ch >= 'A' && ch <= 'F';
      const tier = upper ? ch.charCodeAt(0) - 64 : ch >= '1' && ch <= '9' ? Number(ch) : 0;
      return { x, y, tier, open: upper || ch === '_', present: true } as Cell;
    }),
  );
}

describe('the ladder data congo lines need', () => {
  it('deals six tiers on every board, a line being one of each', () => {
    for (const row of allRows(congo)) {
      expect(row.tiers, `CONGO#${row.n}`).toBe(6);
      expect(packsIn(row.tiers, row.quantity), `CONGO#${row.n}`).not.toBeNull();
    }
  });

  it('stays inside the density lines can be laid down at', () => {
    for (const row of allRows(congo)) {
      expect(row.monsters / row.cells, `CONGO#${row.n}`).toBeLessThanOrEqual(CONGO_MAX_DENSITY);
    }
  });
});

describe('the rule itself', () => {
  it('strings every creature into a line of one of each tier, led by the 6, lines never touching', () => {
    for (const row of allRows(congo)) {
      for (const seed of SEEDS) {
        expect(faultOf(gameFor(row.n, seed)), `CONGO#${row.n} seed ${seed}`).toBeNull();
      }
    }
  });

  it('places exactly the quota the thresholds were tuned against', () => {
    for (const row of allRows(congo)) {
      const cfg = boardConfig(ladders, 'congo', row.n);
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        for (let t = 1; t <= cfg.tiers; t++) {
          expect(creatureCells(game).filter((c) => c.tier === t)).toHaveLength(
            cfg.quantity[t - 1]!,
          );
        }
      }
    }
  });

  it('snakes: some lines turn, some run long', () => {
    // The shape asked for. A line that never turned would be a rod, and a
    // line that only ever turned would be a coil.
    const game = gameFor(5, SEEDS[0]!);
    const seen = new Set<Cell>();
    let turned = 0;
    let long = 0;
    for (const start of creatureCells(game)) {
      if (seen.has(start)) continue;
      const line = [start];
      seen.add(start);
      for (let i = 0; i < line.length; i++) {
        for (const n of game.neighboursOf(line[i]!)) {
          if (n.tier > 0 && !seen.has(n)) {
            seen.add(n);
            line.push(n);
          }
        }
      }
      const xs = new Set(line.map((c) => c.x));
      const ys = new Set(line.map((c) => c.y));
      if (xs.size > 1 && ys.size > 1) turned++;
      if (Math.max(xs.size, ys.size) >= 4) long++;
    }
    expect(turned).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(0);
  });

  it('is caught by the fault check when it breaks', () => {
    // The checker has to be able to fail, or the test above proves nothing.
    const { near } = square(6, 3);
    const line = (cells: number[], tiers: number[]) => new Map(cells.map((c, i) => [c, tiers[i]!]));
    // A 2x2 inside the line.
    expect(congoFault(line([0, 1, 7, 6, 12, 13], [6, 1, 2, 3, 4, 5]), near, 6, 3, 6)).toMatch(
      /not a line|2x2/,
    );
    // Leader in the middle.
    expect(congoFault(line([0, 1, 2, 3, 4, 5], [1, 2, 6, 3, 4, 5]), near, 6, 3, 6)).toMatch(
      /front/,
    );
    // A straight line, leader first: fine.
    expect(congoFault(line([0, 1, 2, 3, 4, 5], [6, 1, 2, 3, 4, 5]), near, 6, 3, 6)).toBeNull();
  });
});

describe('what Sweep may conclude from the lines', () => {
  const opened = (grid: Cell[][]) => [...congoClear(grid, 6)].map((c) => `${c.x},${c.y}`).sort();

  it('empties the rest of the leader once a follower is found', () => {
    const grid = drawn(['.....', '.FA..', '.....']);
    // The 6 at (1,1) leads the 1 at (2,1): its other three sides are empty.
    expect(opened(grid)).toEqual(expect.arrayContaining(['0,1', '1,0', '1,2']));
  });

  it('empties the fourth cell of a 2x2 three members already fill', () => {
    const grid = drawn(['......', '..AB..', '...C..', '......']);
    expect(opened(grid)).toContain('2,2');
  });

  it('empties everything the rest of a line cannot reach from its ends', () => {
    // Five found, led by the 6 — so the missing member is orthogonally off
    // the tail end, and every other cell around the line is empty ground.
    const grid = drawn(['.......', '.FABCD.', '.......']);
    const out = opened(grid);
    expect(out).not.toContain('6,1'); // straight on from the tail
    expect(out).not.toContain('5,0'); // turning up off the tail
    expect(out).not.toContain('5,2'); // turning down off the tail
    expect(out).toEqual(expect.arrayContaining(['2,0', '3,2', '0,1', '6,0', '6,2']));
  });

  it('never calls a creature empty, whatever is open', () => {
    // The alarm. Every proof here holds at ANY level, so one wrong cell would
    // be a free sweep into a creature. Random reveals of every density, on
    // real boards, reaching well past anything play produces.
    let named = 0;
    for (const n of [1, 5, 10]) {
      for (let s = 0; s < 60; s++) {
        const game = gameFor(n, 977 * s + 3);
        const rng = mulberry32(s + 1000 * n);
        const share = rng();
        for (const c of game.grid.flat()) if (rng() < share) c.open = true;
        for (const c of congoClear(game.grid, 6)) {
          named++;
          expect(c.tier, `CONGO#${n} seed ${s} at ${c.x},${c.y}`).toBe(0);
        }
      }
    }
    expect(named).toBeGreaterThan(0);
  });

  it('never costs HP, however many times it is swept', () => {
    for (const row of congo.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        for (let i = 0; i < 20; i++) game.sweep({ useMarks: false });
        expect(game.hp, `CONGO#${row.n} seed ${seed}`).toBe(game.maxHp);
      }
    }
  });

  it('does not carry a board on its own', () => {
    for (const row of congo.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        for (let i = 0; i < 30; i++) game.sweep({ useMarks: false });
        expect(game.status, `CONGO#${row.n} seed ${seed}`).toBe('playing');
        expect(game.creaturesLeft()).toBeGreaterThan(0);
      }
    }
  });
});

describe('the four load-bearing facts survive it', () => {
  it('clears every board without taking a single point of damage', () => {
    for (const row of congo.boards) {
      for (const seed of SEEDS) {
        const game = gameFor(row.n, seed);
        const result = autoplayTierOrder(game);
        expect(result.cleared, `CONGO#${row.n} seed ${seed}`).toBe(true);
        expect(game.hp).toBe(game.maxHp);
      }
    }
  });
});

describe('the boundary refuses what it cannot build', () => {
  const bend = (
    over: Partial<(typeof congo.boards)[0]>,
    type: Partial<LadderType> = {},
  ): LadderType => ({
    ...congo,
    ...type,
    id: 'bent',
    boards: [{ ...congo.boards[0]!, ...over }],
    extended: [],
  });

  it('refuses a quantity that is not whole lines', () => {
    const q = [...congo.boards[0]!.quantity];
    q[5] = q[5]! - 1;
    expect(() =>
      boardConfig([bend({ quantity: q, monsters: q.reduce((a, b) => a + b) })], 'bent', 1),
    ).toThrow(/whole number of lines/);
  });

  it('refuses a density the lines cannot reach', () => {
    const q = Array(6).fill(28);
    expect(() => boardConfig([bend({ quantity: q, monsters: 168 })], 'bent', 1)).toThrow(
      /non-touching lines/,
    );
  });

  it('refuses a hex or wrapped board, where a line has no orthogonal steps to take', () => {
    expect(() => boardConfig([bend({}, { topology: 'hex' })], 'bent', 1)).toThrow(
      /unwrapped square/,
    );
    expect(() => boardConfig([bend({}, { wrap: 'both' })], 'bent', 1)).toThrow(/unwrapped square/);
  });
});

describe('chooseLines on its own', () => {
  it('lands the exact count asked for, every line leader first', () => {
    const { cells, near } = square(30, 16);
    for (const seed of SEEDS) {
      const out = chooseLines(cells, near, 30, 16, 24, 6, mulberry32(seed));
      expect(out).toHaveLength(24);
      const tierAt = dealLines(out, 6, mulberry32(seed));
      for (const line of out) expect(tierAt.get(line[0]!)).toBe(6);
      expect(congoFault(tierAt, near, 30, 16, 6)).toBeNull();
    }
  });

  it('throws rather than returning a short board it cannot vouch for', () => {
    const { cells, near } = square(12, 12);
    expect(() => chooseLines(cells, near, 12, 12, 20, 6, mulberry32(3))).toThrow(/could not place/);
  });
});
