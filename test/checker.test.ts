/**
 * CHECKERBOARD's placement (`src/engine/placement/checker.ts`) on the real ladder: the colour
 * balance, `hiddenCap` proved by enumeration, and Sweep under the parity bound.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { hiddenCap, shadeOf } from '../src/engine/placement/checker.js';
import { boardsOf, ladders, SEEDS } from './helpers.js';

describe('the checkerboard placement', () => {
  const checkerBoards = boardsOf('checker');

  it('leaves empty ground free to sit on either colour', () => {
    // The rule is about creatures, not about cells. If tier 0 were pinned to
    // one colour the board would solve itself: every square of the other
    // colour would be provably occupied before a single click.
    const game = Game.create(checkerBoards[0]!, SEEDS[0]!);
    const empties = game.grid.flat().filter((c) => c.tier === 0);
    expect(empties.some((c) => shadeOf(c) === 'light')).toBe(true);
    expect(empties.some((c) => shadeOf(c) === 'dark')).toBe(true);
  });

  it('deals the two colours within one creature of each other', () => {
    // The promise the mode makes, checked on the boards rather than on the
    // schedule that produced them.
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        let light = 0;
        let dark = 0;
        for (const cell of game.grid.flat()) {
          if (cell.tier === 0) continue;
          if (shadeOf(cell) === 'light') light++;
          else dark++;
        }
        expect(
          Math.abs(light - dark),
          `${cfg.typeId}#${cfg.board} seed ${seed}`,
        ).toBeLessThanOrEqual(1);
        expect(light + dark).toBe(cfg.quantity.reduce((a, b) => a + b, 0));
      }
    }
  });

  it('gives each colour exactly half the board to stand on', () => {
    for (const cfg of checkerBoards) {
      expect((cfg.width * cfg.height) % 2, `${cfg.typeId}#${cfg.board}`).toBe(0);
    }
  });

  it('proves `hiddenCap` against every layout it claims to bound', () => {
    // The load-bearing claim: the cap is the largest tier a single covered
    // cell can be hiding, given the sum behind a number and how many of that
    // number's covered cells are dark. Sweep acts on it as a proof, so it is
    // checked as one -- by enumerating every legal assignment of tiers to a
    // small ring and asking what the biggest light and dark values were.
    //
    // SOUND (never below what a layout can hold) is the half that matters:
    // too high is a missed deduction, too low is HP the player did not agree
    // to spend. TIGHT is checked too, because a cap nobody can reach would
    // quietly be a weaker rule than the one documented.
    const MAX_TIER = 6;
    for (let lights = 0; lights <= 3; lights++) {
      for (let darks = 0; darks <= 3; darks++) {
        if (lights + darks === 0) continue;
        const reachable = new Map<number, { light: number; dark: number }>();

        const walk = (i: number, sum: number, topLight: number, topDark: number): void => {
          if (i === lights + darks) {
            const seen = reachable.get(sum) ?? { light: -1, dark: -1 };
            reachable.set(sum, {
              light: Math.max(seen.light, topLight),
              dark: Math.max(seen.dark, topDark),
            });
            return;
          }
          const isLight = i < lights;
          for (let t = 0; t <= MAX_TIER; t++) {
            // A cell holds empty ground or a creature of its own parity.
            if (t !== 0 && (t % 2 === 0) !== isLight) continue;
            walk(
              i + 1,
              sum + t,
              isLight ? Math.max(topLight, t) : topLight,
              isLight ? topDark : Math.max(topDark, t),
            );
          }
        };
        walk(0, 0, -1, -1);

        for (const [hidden, best] of reachable) {
          if (lights) {
            const cap = hiddenCap('light', hidden, darks);
            expect(cap, `light, hidden ${hidden}, ${darks} dark`).toBeGreaterThanOrEqual(
              best.light,
            );
            if (cap <= MAX_TIER) expect(cap).toBe(best.light);
          }
          if (darks) {
            const cap = hiddenCap('dark', hidden, darks);
            expect(cap, `dark, hidden ${hidden}, ${darks} dark`).toBeGreaterThanOrEqual(best.dark);
            if (cap <= MAX_TIER) expect(cap).toBe(best.dark);
          }
        }
      }
    }
  });

  it('never sweeps a cell that costs HP', () => {
    // The parity bound is the only proof in the game decided per cell rather
    // than for a whole ring at once, so the thing to check is the thing every
    // Sweep rule promises: what it hands you is free.
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        let guard = cfg.width * cfg.height;
        while (game.status === 'playing' && guard-- > 0) {
          const before = game.hp;
          if (!game.sweep({ useMarks: false }).length) break;
          expect(game.hp, `${cfg.typeId}#${cfg.board} seed ${seed}`).toBe(before);
        }
      }
    }
  });

  it('does not let Sweep alone carry a board', () => {
    // Same guard as Sudoku's, for the same reason: the colour rule is real
    // deduction and an automatic deducer that could finish with it would have
    // made the mode a button. It runs out, because it is bounded by what the
    // numbers already on screen say.
    let cleared = 0;
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        let guard = cfg.width * cfg.height;
        while (game.status === 'playing' && guard-- > 0) {
          if (!game.sweep({ useMarks: false }).length) break;
        }
        if (game.status === 'won') cleared++;
      }
    }
    expect(cleared).toBe(0);
  });

  it('refuses a board the colours cannot balance', () => {
    // The balance is a property of `quantity`, so it is checked where the
    // ladder data becomes a config -- a schedule that stopped apportioning per
    // parity would otherwise produce a playable board that is not this mode.
    const type = structuredClone(findType(ladders, 'checker'));
    type.boards[0]!.quantity = [...type.boards[0]!.quantity];
    type.boards[0]!.quantity[0]! += 4;
    expect(() => boardConfig([type], 'checker', 1)).toThrow(/within one of each other/);
  });
});
