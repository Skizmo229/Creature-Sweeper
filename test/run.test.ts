/**
 * Full Run — the rules of a ten-board run, as executable specifications.
 *
 * Three of these encode decisions that are not free choices. Level and EXP
 * MUST reset per board or every board after the first is free; mana must not
 * carry or the late boards become the cheap ones; and the pool must be one
 * number for the whole run or a heal means something different on board 9
 * than it did on board 1. Each is asserted rather than trusted, because all
 * three fail silently — a run would still be playable, just not the mode.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { boardConfig, findType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { FullRun } from '../src/engine/run.js';
import { autoplaySearch, autoplayTierOrder } from '../src/sim/autoplay.js';

const ladders = loadLadders();
const SEED = 0x5eed;

/** Play a run to its end with the omniscient tier-order player. */
function autoRun(typeId: string, seed: number): FullRun {
  const run = FullRun.start(ladders, typeId, seed);
  const search = findType(ladders, typeId).search;
  for (;;) {
    const result = search ? autoplaySearch(run.game) : autoplayTierOrder(run.game);
    if (!result.cleared || run.status !== 'playing') return run;
    run.advance();
  }
}

/**
 * Pick a fight, on purpose.
 *
 * Damage is `E * (ceil(E / L) - 1)`, so it is a staircase in the tier: the
 * smallest creature above your level is the cheapest way to lose HP and
 * survive, and the biggest is reliably fatal at level 1. Tests that want one
 * must not accidentally get the other, which is why neither of these takes
 * the first creature it finds.
 */
function strike(game: Game, pick: 'cheapest' | 'fatal'): number {
  let target = null as null | { x: number; y: number; tier: number };
  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.alive || cell.tier <= game.level) continue;
      if (!target) {
        target = cell;
        continue;
      }
      const better = pick === 'cheapest' ? cell.tier < target.tier : cell.tier > target.tier;
      if (better) target = cell;
    }
  }
  if (!target) throw new Error('nothing on this board costs anything to fight');
  const before = game.hp;
  game.open(target.x, target.y);
  return before - game.hp;
}

describe('the run pool', () => {
  it('is one max HP for all ten boards, whatever the per-board schedule says', () => {
    // EXTREME's schedule drops from 10 to 8 across the ladder. A run replaces
    // it wholesale, so the ceiling cannot move under the player mid-run.
    const type = findType(ladders, 'extreme');
    expect(new Set(type.boards.map((b) => b.hp)).size).toBeGreaterThan(1);

    const run = autoRun('extreme', SEED);
    expect(run.status).toBe('won');
    for (const leg of run.legs) expect(leg.hpAfter).toBeLessThanOrEqual(type.run_hp);
    expect(run.game.maxHp).toBe(type.run_hp);
  });

  it('never sets a ceiling below what a board was tuned against', () => {
    // Board 1 is the most generous entry in every schedule, which is the
    // reason `run_hp` can be taken from it and applied to all ten.
    for (const type of ladders) {
      for (const board of type.boards) {
        expect(board.hp, `${type.id}#${board.n}`).toBeLessThanOrEqual(type.run_hp);
      }
    }
  });

  it('heals half the pool, rounded down, after each cleared board', () => {
    for (const type of ladders) {
      const run = FullRun.start(ladders, type.id, SEED);
      expect(run.healPerBoard).toBe(Math.floor(type.run_hp / 2));
    }
  });

  it('carries damage into the next board, less the heal', () => {
    const run = FullRun.start(ladders, 'huge', SEED);
    const damage = strike(run.game, 'cheapest');
    expect(damage).toBeGreaterThan(0);
    const hurt = run.hp;

    autoplayTierOrder(run.game);
    expect(run.game.status).toBe('won');

    const leg = run.advance();
    expect(leg.hpAtClear).toBe(hurt);
    expect(leg.healed).toBe(Math.min(run.healPerBoard, run.maxHp - hurt));
    expect(run.game.hp).toBe(hurt + leg.healed);
    expect(run.game.hp).toBeLessThanOrEqual(run.maxHp);
  });

  it('never heals past the pool, so an undamaged board gains nothing', () => {
    const run = FullRun.start(ladders, 'normal', SEED);
    autoplayTierOrder(run.game);
    const leg = run.advance();
    expect(leg.hpAtClear).toBe(run.maxHp);
    expect(leg.healed).toBe(0);
    expect(run.game.hp).toBe(run.maxHp);
  });

  it('gives a one-HP ladder no heal at all, by rounding down', () => {
    // BLIND's pool is 1. Rounding up would restore it fully and make the run
    // ten unrelated boards; the whole mode would evaporate on that ladder.
    const run = FullRun.start(ladders, 'blind', SEED);
    expect(run.maxHp).toBe(1);
    expect(run.healPerBoard).toBe(0);
  });
});

describe('what a board boundary resets', () => {
  it('resets level and EXP — thresholds are C_k of a specific board', () => {
    const run = FullRun.start(ladders, 'normal', SEED);
    autoplayTierOrder(run.game);
    expect(run.game.level).toBeGreaterThan(1);
    expect(run.game.ex).toBeGreaterThan(0);

    const startLevel = run.game.config.startLevel;
    run.advance();
    expect(run.game.level).toBe(startLevel);
    expect(run.game.ex).toBe(0);
  });

  it('does not carry mana', () => {
    const run = FullRun.start(ladders, 'arcane', SEED);
    const start = run.game.config.startMana;
    autoplayTierOrder(run.game);
    expect(run.game.mana).toBeGreaterThan(start);

    run.advance();
    expect(run.game.mana).toBe(start);
  });

  it('keeps the board otherwise exactly the board the ladder tuned', () => {
    const run = FullRun.start(ladders, 'oracle', SEED);
    const solo = boardConfig(ladders, 'oracle', 1);
    const inRun = run.game.config;
    expect(inRun.quantity).toEqual(solo.quantity);
    expect(inRun.exp).toEqual(solo.exp);
    expect(inRun.tiers).toBe(solo.tiers);
    expect(inRun.spells).toEqual(solo.spells);
    // The pool is the one and only difference.
    expect(inRun.hp).toBe(findType(ladders, 'oracle').run_hp);
  });
});

describe('a run as a whole', () => {
  it('is not won until the last board is', () => {
    const run = FullRun.start(ladders, 'easy', SEED);
    autoplayTierOrder(run.game);
    expect(run.game.status).toBe('won');
    expect(run.boardWon).toBe(true);
    expect(run.status).toBe('playing');

    while (!run.isLastBoard) {
      run.advance();
      autoplayTierOrder(run.game);
    }
    expect(run.status).toBe('won');
    expect(run.boardsCleared).toBe(run.boardCount);
  });

  it('ends the moment a board is lost', () => {
    const run = FullRun.start(ladders, 'oracle', SEED);
    strike(run.game, 'fatal');
    expect(run.game.status).toBe('lost');
    expect(run.status).toBe('lost');
    expect(() => run.advance()).toThrow();
  });

  it('refuses to advance off an unfinished or final board', () => {
    const run = FullRun.start(ladders, 'easy', SEED);
    expect(() => run.advance()).toThrow(/playing/);

    while (!run.isLastBoard) {
      autoplayTierOrder(run.game);
      run.advance();
    }
    autoplayTierOrder(run.game);
    expect(() => run.advance()).toThrow(/last/);
  });

  it('replays from one seed, like a board does', () => {
    const a = autoRun('cave', 0xbeef);
    const b = autoRun('cave', 0xbeef);
    const c = autoRun('cave', 0xc0ffee);
    const shape = (r: FullRun) =>
      r.game.grid
        .flat()
        .map((x) => x.tier)
        .join('');
    expect(shape(a)).toBe(shape(b));
    expect(shape(a)).not.toBe(shape(c));
    // Consecutive boards must not be related boards.
    expect(a.boardSeed(1)).not.toBe(a.boardSeed(2));
  });

  it('gives every board of the run its own seed', () => {
    const run = FullRun.start(ladders, 'normal', SEED);
    const seeds = new Set<number>();
    for (let n = 1; n <= run.boardCount; n++) seeds.add(run.boardSeed(n));
    expect(seeds.size).toBe(run.boardCount);
  });
});

describe('the zero-damage guarantee, ten boards deep', () => {
  // The guarantee is per board: at level k every tier <= k is free and the
  // gate to k+1 is at most C_k. Because a run resets level and EXP, that
  // argument still applies to every board of a run — so a whole run is
  // clearable without the heal ever mattering. `npm run sim:run` sweeps every
  // type over many seeds; this is the regression gate.
  for (const type of ladders) {
    it(`${type.name} completes at full HP`, () => {
      const run = autoRun(type.id, SEED);
      expect(run.status).toBe('won');
      expect(run.hp).toBe(run.maxHp);
      expect(run.damageTaken).toBe(0);
      for (const leg of run.legs) expect(leg.healed).toBe(0);
    });
  }
});

describe('entering a board part-way down', () => {
  it('rejects an HP that is not a live pool', () => {
    const cfg = boardConfig(ladders, 'normal', 1, { hp: 10 });
    expect(() => Game.create(cfg, SEED, { startHp: 0 })).toThrow();
    expect(() => Game.create(cfg, SEED, { startHp: 11 })).toThrow();
    expect(() => Game.create(cfg, SEED, { startHp: 2.5 })).toThrow();
  });

  it('leaves maxHp alone — the board is still the board', () => {
    const cfg = boardConfig(ladders, 'normal', 1, { hp: 10 });
    const game = Game.create(cfg, SEED, { startHp: 3 });
    expect(game.hp).toBe(3);
    expect(game.maxHp).toBe(10);
  });
});
