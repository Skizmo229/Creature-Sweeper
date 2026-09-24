/**
 * WORKOUT: one spell, Exercise, on rules of its own.
 *
 * Three rules, and each is a place the tuning identity could be broken if it
 * were written the wrong way round. The price rises and falls but only ever in
 * mana. The EXP bonus only ever ADDS: the gates are C_k, so a kill paying short
 * would strand one, while a kill paying over only reaches it sooner. And all of
 * it resets with the board, because a new board is a new `Game`.
 */

import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game.js';
import { SPELLS } from '../src/engine/spells.js';
import { loadLadders } from '../src/data.js';
import { boardConfig, findType } from '../src/engine/config.js';
import { FullRun } from '../src/engine/run.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';
import type { BoardConfig, WorkoutRule } from '../src/engine/types.js';
import { computeNumbers } from '../src/engine/grid.js';

const RULE: WorkoutRule = { base: 30, step: 10, relief: 10, expMultiplier: 2 };

function workoutConfig(over: Partial<BoardConfig> = {}): BoardConfig {
  return {
    typeId: 'test',
    board: 1,
    width: 8,
    height: 8,
    tiers: 5,
    quantity: [2, 1, 1, 1, 1],
    hp: 20,
    startLevel: 1,
    // Out of reach unless a test lowers them, so a level-up is always the
    // thing the test set up rather than a side effect.
    exp: [999, 999, 999, 999],
    search: false,
    placement: 'uniform',
    givens: 0,
    opening: 'none',
    topology: 'square',
    wrap: 'none',
    shape: 'rect',
    shapeParam: 0,
    spells: ['exercise'],
    startMana: 1000,
    reach: 0,
    workout: RULE,
    ...over,
  };
}

function paint(game: Game, rows: string[]): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const cell = game.grid[y]![x]!;
      cell.tier = ch === '.' ? 0 : Number(ch);
      cell.alive = cell.tier > 0;
    });
  });
  computeNumbers(game.grid, game.config.topology, game.config.wrap);
  game.remaining.fill(0);
  for (const r of game.grid) {
    for (const c of r) if (c.tier > 0) game.remaining[c.tier - 1]!++;
  }
}

const EMPTY = [
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
  '........',
];

describe('the rising price', () => {
  it('starts at the base and rises a step with every cast', () => {
    const game = Game.create(workoutConfig(), 7);
    paint(game, ['1.1.1...', ...EMPTY.slice(1)]);
    const paid: number[] = [];
    for (const x of [0, 2, 4]) {
      const before = game.mana;
      expect(game.spellCost('exercise')).toBe(30 + 10 * paid.length);
      game.cast('exercise');
      paid.push(before - game.mana);
      game.open(x, 0); // spends the charge on a tier 1
    }
    expect(paid).toEqual([30, 40, 50]);
  });

  it('refuses when mana is short of the CURRENT price, not the base', () => {
    const game = Game.create(workoutConfig(), 7);
    // Two creatures, so the first kill does not win the board and end it.
    paint(game, ['1......1', ...EMPTY.slice(1)]);
    game.cast('exercise');
    game.open(0, 0);
    game.mana = 39; // enough for the base, not the price
    expect(game.spellCost('exercise')).toBe(40);
    expect(game.canCast('exercise')).toBe(false);
    expect(game.cast('exercise')[0]).toMatchObject({ type: 'blocked', reason: 'no-mana' });
    expect(game.spellCost('exercise')).toBe(40); // a refusal does not raise it
  });

  it('does not stack, and a refused second cast neither charges nor raises the price', () => {
    const game = Game.create(workoutConfig(), 7);
    paint(game, EMPTY);
    game.cast('exercise');
    const mana = game.mana;
    expect(game.cast('exercise')[0]).toMatchObject({ type: 'blocked', reason: 'no-effect' });
    expect(game.mana).toBe(mana);
    expect(game.spellCost('exercise')).toBe(40);
  });

  it('comes down a step for every level gained, never below the base', () => {
    // A tier 1 pays 1 EXP, doubled to 2 on a borrowed level: exactly LV2.
    const game = Game.create(workoutConfig({ exp: [2, 999, 999, 999] }), 7);
    paint(game, ['1.1.....', ...EMPTY.slice(1)]);
    game.cast('exercise'); // 30 -> price 40
    game.cast('exercise'); // refused, still 40
    game.open(0, 0); // 2 EXP -> LV2, price back to 30
    expect(game.level).toBe(2);
    expect(game.spellCost('exercise')).toBe(30);
  });

  it('never goes below the base, however many levels are gained', () => {
    const game = Game.create(workoutConfig({ exp: [2, 3, 999, 999] }), 7);
    paint(game, ['3.......', ...EMPTY.slice(1)]);
    game.open(0, 0); // tier 3 unaided: 4 EXP, LV1 -> LV3
    expect(game.level).toBe(3);
    expect(game.exerciseSurcharge).toBe(0);
    expect(game.spellCost('exercise')).toBe(30);
  });

  it('counts every level of a multi-level jump', () => {
    const game = Game.create(workoutConfig({ exp: [2, 3, 4, 999] }), 7);
    paint(game, ['3.......', ...EMPTY.slice(1)]);
    game.exerciseSurcharge = 50;
    game.cast('exercise'); // pays 80, surcharge 60
    game.open(0, 0); // tier 3 pays 4 x2 = 8 EXP: LV1 -> LV4
    expect(game.level).toBe(4);
    expect(game.exerciseSurcharge).toBe(60 - 3 * RULE.relief);
  });

  it('leaves the global price alone everywhere without a workout rule', () => {
    const { workout: _rule, ...plain } = workoutConfig();
    const game = Game.create(plain, 7);
    paint(game, ['1.......', ...EMPTY.slice(1)]);
    expect(game.spellCost('exercise')).toBe(SPELLS.exercise.cost);
    game.cast('exercise');
    game.open(0, 0);
    expect(game.spellCost('exercise')).toBe(SPELLS.exercise.cost);
    expect(game.ex).toBe(1); // and no bonus EXP either
  });
});

describe('double EXP', () => {
  it('pays twice for a kill made on a borrowed level, and says so', () => {
    const game = Game.create(workoutConfig(), 7);
    paint(game, ['........', '.4......', ...EMPTY.slice(2)]);
    game.cast('exercise');
    const events = game.open(1, 1);
    expect(game.ex).toBe(16); // 2^(4-1), doubled
    expect(events.some((e) => e.type === 'exercised' && e.bonusExp === 8)).toBe(true);
  });

  it('pays it on ANY fight the charge is spent on, even a free one', () => {
    const game = Game.create(workoutConfig(), 7);
    paint(game, ['1.......', ...EMPTY.slice(1)]);
    game.cast('exercise');
    game.open(0, 0);
    expect(game.ex).toBe(2);
  });

  it('pays the ordinary amount without a charge', () => {
    const game = Game.create(workoutConfig(), 7);
    paint(game, ['........', '.4......', ...EMPTY.slice(2)]);
    game.open(1, 1);
    expect(game.ex).toBe(8);
  });

  it('pays nothing extra for a fight that kills you', () => {
    const game = Game.create(workoutConfig({ hp: 2 }), 7);
    paint(game, ['........', '.5......', ...EMPTY.slice(2)]);
    game.cast('exercise');
    const events = game.open(1, 1);
    expect(game.status).toBe('lost');
    expect(events.some((e) => e.type === 'exercised' && e.bonusExp === 0)).toBe(true);
  });
});

describe('the WORKOUT ladder', () => {
  const ladders = loadLadders();
  const type = findType(ladders, 'workout');

  it('carries Exercise alone, at 30 rising by 10, with 30 mana to start', () => {
    for (const row of [...type.boards, ...type.extended]) {
      const cfg = boardConfig(ladders, 'workout', row.n);
      expect(cfg.spells).toEqual(['exercise']);
      expect(cfg.startMana).toBe(30);
      expect(cfg.workout).toEqual(RULE);
    }
  });

  it("keeps NORMAL's HP and gates deeper than NORMAL does", () => {
    const normal = findType(ladders, 'normal');
    type.boards.forEach((row, i) => {
      expect(row.hp, `WORKOUT#${row.n}`).toBe(normal.boards[i]!.hp);
      expect(row.lock, `WORKOUT#${row.n}`).toBeGreaterThan(normal.boards[i]!.lock);
    });
  });

  /**
   * Double EXP only ever adds, so it cannot take the zero-damage guarantee away
   * — but the claim is cheap to check directly, so it is checked.
   */
  it('is clearable without damage by the tier-order player on every board', () => {
    for (const row of [...type.boards, ...type.extended]) {
      for (const seed of [1, 2, 3]) {
        const game = Game.create(boardConfig(ladders, 'workout', row.n), seed);
        expect(autoplayTierOrder(game).cleared, `WORKOUT#${row.n} seed ${seed}`).toBe(true);
        expect(game.hp, `WORKOUT#${row.n} seed ${seed}`).toBe(game.maxHp);
      }
    }
  });

  it('resets the price on every board of a Full Run', () => {
    const run = FullRun.start(ladders, 'workout', 5);
    const first = run.game;
    first.exerciseSurcharge = 70;
    expect(first.spellCost('exercise')).toBe(100);
    autoplayTierOrder(first);
    run.advance();
    expect(run.game).not.toBe(first);
    expect(run.game.spellCost('exercise')).toBe(30);
    expect(run.game.mana).toBe(30);
  });
});

describe('the workout rule at the boundary', () => {
  const ladders = loadLadders();
  const base = findType(ladders, 'workout');

  it('is refused on a ladder that does not offer Exercise', () => {
    const bent = [{ ...base, id: 'bent', spells: ['reveal'] }];
    expect(() => boardConfig(bent, 'bent', 1)).toThrow(/needs Exercise/);
  });

  it('refuses a multiplier that would pay a kill short of its EXP', () => {
    const bent = [{ ...base, id: 'bent', workout: { ...base.workout!, exp_multiplier: 0 } }];
    expect(() => boardConfig(bent, 'bent', 1)).toThrow(/C_k/);
  });
});
