/**
 * Boards past 10 — the continuation, held to exactly the same rules.
 *
 * The whole argument for shipping these is that they are not a new kind of
 * board: the same generator, the same tuning identity, the same guarantees.
 * That claim is only worth anything if it is checked, and an invariant that
 * held for ten boards can fail on the thirtieth for reasons that never came
 * up — a shape at a size it never reached, a lock depth the ladder never
 * used, a density the schedule never got to.
 *
 * `npm run sim` sweeps all of them for clearability over many seeds. These are
 * the structural checks that a sim cannot make.
 */

import { describe, expect, it } from 'vitest';
import {
  boardConfig,
  cumulativeExp,
  findType,
  isExtendedBoard,
  maxBoard,
} from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { autoplaySearch, autoplayTierOrder } from '../src/sim/autoplay.js';
import { ladders } from './helpers.js';
import { shapeRule } from '../src/engine/shape/registry.js';

const SEEDS = [0xc0ffee, 0x5eed];

/** Every board past the tuned ladder, as configs. */
function scalingOf(typeId: string) {
  return findType(ladders, typeId).extended.map((row) => boardConfig(ladders, typeId, row.n));
}

describe('the shape of the continuation', () => {
  it('leaves the tuned ladder at exactly ten boards', () => {
    for (const type of ladders) {
      expect(type.boards, type.id).toHaveLength(10);
      expect(type.boards[9]!.n).toBe(10);
    }
  });

  it('numbers scaling boards consecutively from 11', () => {
    for (const type of ladders) {
      type.extended.forEach((row, i) => {
        expect(row.n, `${type.id} scaling[${i}]`).toBe(11 + i);
      });
      expect(maxBoard(ladders, type.id)).toBe(10 + type.extended.length);
    }
  });

  it('gives every type somewhere to go past board 10', () => {
    // A type with no continuation would leave the scaling tile permanently
    // empty, which is worse than not offering it.
    for (const type of ladders) {
      expect(type.extended.length, `${type.id} has no scaling boards`).toBeGreaterThan(0);
    }
  });

  it('never emits the same board twice in a row', () => {
    // The schedules move at very different rates, and a step too small to
    // change the board is skipped rather than shipped. A repeat here would be
    // a board that is the previous board with a fresh seed, which replaying
    // the previous board already gives you.
    for (const type of ladders) {
      const rows = [...type.boards, ...type.extended];
      for (let i = 1; i < rows.length; i++) {
        const a = { ...rows[i - 1]!, n: 0 };
        const b = { ...rows[i]!, n: 0 };
        expect(JSON.stringify(b), `${type.id} board ${rows[i]!.n} repeats`).not.toBe(
          JSON.stringify(a),
        );
      }
    }
  });

  it('knows which boards are past the ladder', () => {
    for (const type of ladders) {
      expect(isExtendedBoard(ladders, type.id, 10)).toBe(false);
      expect(isExtendedBoard(ladders, type.id, 11)).toBe(true);
    }
  });

  it('refuses a board past the end, and says where the end is', () => {
    const top = maxBoard(ladders, 'normal');
    expect(() => boardConfig(ladders, 'normal', top + 1)).toThrow(new RegExp(`scaling to ${top}`));
  });
});

describe('the ceilings hold', () => {
  it('never exceeds the largest board the tuned ladders reach', () => {
    // 64x32, as an area: a round outline keeps its own square box inside it (GEAR's is 45x45).
    // A ladder whose tuned boards are already bigger (CARD's) keeps its board 10's.
    for (const type of ladders) {
      const last = type.boards[9]!;
      const area = Math.max(64 * 32, last.w * last.h);
      for (const cfg of scalingOf(type.id)) {
        expect(cfg.width, `${cfg.typeId}#${cfg.board}`).toBeLessThanOrEqual(64);
        expect(cfg.width * cfg.height, `${cfg.typeId}#${cfg.board}`).toBeLessThanOrEqual(area);
      }
    }
  });

  it('caps density, lower for the search ladders that have no level economy', () => {
    for (const type of ladders) {
      if (type.placement === 'sudoku') continue; // fixed by its own rule
      // A cap is never allowed below where the tuned ladder already finished.
      // HIVE ends at 35% and ARCANE at 34.5%, both past the nominal ceiling,
      // and clamping them to it made board 11 sparser than board 10.
      const cap = Math.max(type.search ? 30 : 34, type.boards[9]!.density);
      for (const row of type.extended) {
        expect(row.density, `${type.id}#${row.n}`).toBeLessThanOrEqual(cap + 0.1);
      }
    }
  });

  it('never lets a scaling board hold less EXP than the one before it', () => {
    // Not a rounding guard: a wider CROSS can genuinely be a smaller one,
    // because its arm width depends on the parity of the bounding box. Such a
    // board cannot carry the thresholds of the board before it, so the
    // continuation has to walk past it rather than lift it.
    for (const type of ladders) {
      // Battle ladders only. A search type has no thresholds and no gates, so
      // C_k says nothing about its difficulty — and BLIND's own tuned ten step
      // C_1 backwards at board 6, where the tier count rises and the same
      // creatures spread across a wider distribution.
      if (type.search) continue;
      const rows = [...type.boards, ...type.extended];
      for (let i = 1; i < rows.length; i++) {
        const a = cumulativeExp(rows[i - 1]!.quantity);
        const b = cumulativeExp(rows[i]!.quantity);
        for (let k = 0; k < Math.min(a.length, b.length); k++) {
          expect(b[k], `${type.id}#${rows[i]!.n} C_${k + 1} went backwards`).toBeGreaterThanOrEqual(
            a[k]!,
          );
        }
      }
    }
  });

  it('never drops HP below the floor the tuned ladder chose', () => {
    // EXTREME bottoms out at 8 and ORACLE at 6 on purpose. Continuing the
    // erosion past that invents difficulty the ladder never claimed: unpinned,
    // it takes EXTREME to HP 2.
    for (const type of ladders) {
      const floor = Math.min(...type.boards.map((b) => b.hp));
      for (const row of type.extended) {
        expect(row.hp, `${type.id}#${row.n}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('never locks more thresholds than there are', () => {
    for (const type of ladders) {
      for (const row of type.extended) {
        expect(row.lock, `${type.id}#${row.n}`).toBeLessThanOrEqual(row.tiers - 1);
      }
    }
  });

  it('keeps a flat dial flat, so a type stays itself', () => {
    // EASY's lock depth is 2 by design. If the continuation let it drift up to
    // T-1 then board 30 of EASY would be a differently-named EXTREME, and the
    // axis the ladder advertises would stop being the axis it scales on.
    const easy = findType(ladders, 'easy');
    for (const row of easy.extended) expect(row.lock, `easy#${row.n}`).toBe(2);
  });

  it('holds SUDOKU above the givens count its generator can still serve', () => {
    // Measured: 14 givens costs 6ms a board, 13 costs 20ms, 12 costs ~100ms,
    // and at 11 the generator refuses six boards in eight rather than ship one
    // it cannot prove guess-free. The schedule has to stop above that.
    for (const row of findType(ladders, 'sudoku').extended) {
      expect(row.givens, `sudoku#${row.n}`).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('the tuning identity survives the continuation', () => {
  it('never sets a threshold above the EXP that exists to meet it', () => {
    // This is the zero-damage guarantee in its raw form: the gate to level
    // k+1 must be reachable by killing only tiers at or below k.
    for (const type of ladders) {
      for (const row of type.extended) {
        if (!row.exp.length) continue;
        const C = cumulativeExp(row.quantity);
        row.exp.forEach((threshold, k) => {
          expect(threshold, `${type.id}#${row.n} threshold ${k + 1}`).toBeLessThanOrEqual(C[k]!);
        });
      }
    }
  });

  it('makes the top `lock` thresholds exact full-tier-clear gates', () => {
    for (const type of ladders) {
      for (const row of type.extended) {
        if (!row.exp.length || !row.lock) continue;
        const C = cumulativeExp(row.quantity);
        for (let k = row.exp.length - row.lock; k < row.exp.length; k++) {
          expect(row.exp[k], `${type.id}#${row.n} gate ${k + 1}`).toBe(C[k]);
        }
      }
    }
  });

  it('keeps thresholds strictly increasing', () => {
    for (const type of ladders) {
      for (const row of type.extended) {
        for (let k = 1; k < row.exp.length; k++) {
          expect(row.exp[k], `${type.id}#${row.n}`).toBeGreaterThan(row.exp[k - 1]!);
        }
      }
    }
  });

  it('never makes a scaling board easier than the one before it', () => {
    for (const type of ladders) {
      const rows = [...type.boards, ...type.extended];
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]!,
          cur = rows[i]!;
        for (let k = 0; k < Math.min(prev.exp.length, cur.exp.length); k++) {
          expect(cur.exp[k], `${type.id}#${cur.n} threshold ${k + 1}`).toBeGreaterThanOrEqual(
            prev.exp[k]!,
          );
        }
      }
    }
  });
});

describe('scaling boards are real boards', () => {
  it('leaves exactly the cell count the row was apportioned against', () => {
    // The same alarm the tuned cave boards carry, at sizes they never reach.
    // A mask a few cells light does not throw — the board is just mistuned on
    // that seed, with the top gate one kill out of reach. Counted off a built
    // grid rather than off the mask predicate, because the cave's silhouette
    // is seeded and only the built board can answer for it.
    for (const type of ladders) {
      for (const row of type.extended) {
        const cfg = boardConfig(ladders, type.id, row.n);
        expect(
          shapeRule(cfg.shape).cellCount(cfg.shapeParam, cfg.width, cfg.height),
          `${type.id}#${row.n}: engine mask and ladders.py disagree`,
        ).toBe(row.cells);
        for (const seed of SEEDS) {
          const game = Game.create(cfg, seed);
          expect(
            game.grid.flat().filter((c) => c.present).length,
            `${type.id}#${row.n} seed ${seed}: wrong cell count`,
          ).toBe(row.cells);
        }
      }
    }
  });

  it('places every creature the row calls for', () => {
    for (const type of ladders) {
      for (const cfg of scalingOf(type.id)) {
        const game = Game.create(cfg, 0x5eed);
        const counted = new Array<number>(cfg.tiers).fill(0);
        for (const row of game.grid) {
          for (const cell of row) if (cell.tier > 0) counted[cell.tier - 1]!++;
        }
        expect(counted, `${type.id}#${cfg.board}`).toEqual([...cfg.quantity]);
      }
    }
  });

  it('hands over an opening on every one of them', () => {
    // A board that opens nothing is a board whose first move is a coin flip.
    for (const type of ladders) {
      for (const cfg of scalingOf(type.id)) {
        const game = Game.create(cfg, 0xbeef);
        const open = game.grid.flat().filter((c) => c.open).length;
        expect(open, `${type.id}#${cfg.board} opened nothing`).toBeGreaterThan(0);
      }
    }
  });

  it('can be cleared without losing a point of HP', () => {
    // The sim does this over many seeds; this is the regression gate.
    for (const type of ladders) {
      for (const cfg of scalingOf(type.id)) {
        const game = Game.create(cfg, 0xc0ffee);
        const result = type.search ? autoplaySearch(game) : autoplayTierOrder(game);
        expect(result.cleared, `${type.id}#${cfg.board} could not be cleared`).toBe(true);
        expect(result.hpLost, `${type.id}#${cfg.board} cost HP`).toBe(0);
      }
    }
  });
});
