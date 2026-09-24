/**
 * The gameplay dials, as executable specifications.
 *
 * The one that matters most is the last block. The dials are the first thing
 * in the game that can change a rule at the player's discretion, so the claim
 * they have to clear is that they cannot reach the three load-bearing facts:
 * the tuning identity, the zero-damage guarantee, and "EXP must always be
 * collected". Each of those fails SILENTLY — a broken board is still playable,
 * it just cannot be finished — so none of them can be left to inspection.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { boardConfig, findType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { FullRun } from '../src/engine/run.js';
import { resolveBattle } from '../src/engine/combat.js';
import {
  DEFAULT_GAMEPLAY,
  type GameplaySettings,
  cellsPerMana,
  easierThanDefault,
  effectiveHp,
  healPerBoard,
  isAtLeastAsHard,
  isDefaultGameplay,
  snapRatio,
} from '../src/engine/settings.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';

const ladders = loadLadders();
const SEED = 0x5eed;

const dials = (patch: Partial<GameplaySettings>): GameplaySettings => ({
  ...DEFAULT_GAMEPLAY,
  ...patch,
});

const board = (typeId: string, n = 1) => boardConfig(ladders, typeId, n);

/** A board with magic on it, for the two mana dials. */
const magicBoard = (n = 3) => board('arcane', n);

describe('the dials default to the tuned game', () => {
  it('leaves a board identical when nothing is passed', () => {
    const cfg = board('normal', 4);
    const bare = Game.create(cfg, SEED);
    const dialled = Game.create(cfg, SEED, { settings: DEFAULT_GAMEPLAY });
    expect(dialled.maxHp).toBe(bare.maxHp);
    expect(dialled.hp).toBe(bare.hp);
    expect(dialled.mana).toBe(bare.mana);
    // Same seed, same board — the dials must not touch generation at all.
    expect(dialled.grid.flat().map((c) => c.tier)).toEqual(bare.grid.flat().map((c) => c.tier));
  });

  it('agrees with itself about what "default" means', () => {
    expect(isDefaultGameplay(DEFAULT_GAMEPLAY)).toBe(true);
    expect(isAtLeastAsHard(DEFAULT_GAMEPLAY)).toBe(true);
    expect(easierThanDefault(DEFAULT_GAMEPLAY)).toEqual([]);
  });

  it('keeps the Full Run heal exactly where the mode left it', () => {
    // 0.5 rounded down IS the shipped rule. If this drifts, every run's HP
    // economy moves with it.
    for (const pool of [1, 2, 7, 20, 41]) {
      expect(healPerBoard(pool, DEFAULT_GAMEPLAY)).toBe(Math.floor(pool / 2));
    }
  });
});

describe('the HP dial', () => {
  it('scales the pool', () => {
    const cfg = board('normal', 5);
    expect(Game.create(cfg, SEED, { settings: dials({ hpRatio: 2 }) }).maxHp).toBe(
      Math.round(cfg.hp * 2),
    );
  });

  it('never leaves a board you enter already dead', () => {
    // A pool of 0 is not a harder board, it is an unplayable one.
    expect(effectiveHp(20, dials({ hpRatio: 0 }))).toBe(1);
    const game = Game.create(board('normal'), SEED, { settings: dials({ hpRatio: 0 }) });
    expect(game.hp).toBe(1);
    expect(game.status).toBe('playing');
  });
});

describe('the creature-damage dial', () => {
  it('scales what a retaliation costs', () => {
    // Tier 5 at level 1: four retaliations of 5, which is 20 unmodified.
    expect(resolveBattle(1, 500, 5).damage).toBe(20);
    expect(resolveBattle(1, 500, 5, 10).damage).toBe(40);
    expect(resolveBattle(1, 500, 5, 2).damage).toBe(8);
  });

  it('leaves a free kill free at every setting', () => {
    // The zero-damage guarantee is a statement about fights at or below your
    // level, and those end in one round with no retaliation at all. No scaling
    // of the retaliation can reach them.
    for (const bite of [0, 1, 3, 30]) {
      expect(resolveBattle(5, 100, 5, bite).damage).toBe(0);
      expect(resolveBattle(5, 100, 5, bite).defeated).toBe(true);
    }
  });

  it('terminates when neither side can land a blow', () => {
    // Level 0 (BLIND) can never reduce a creature; a bite of 0 can never
    // reduce the player. Without the stalemate guard this hangs.
    const out = resolveBattle(0, 10, 4, 0);
    expect(out).toEqual({ defeated: false, hp: 10, damage: 0 });
  });
});

describe('the mana dials', () => {
  it('scales the kill reward without touching EXP', () => {
    const cfg = magicBoard();
    const rich = Game.create(cfg, SEED, { settings: dials({ manaRewardRatio: 3 }) });
    const plain = Game.create(cfg, SEED);

    const kill = (game: Game) => {
      const target = game.grid.flat().find((c) => c.present && !c.open && c.tier === 1);
      expect(target).toBeDefined();
      game.open(target!.x, target!.y);
    };
    kill(rich);
    kill(plain);

    expect(rich.mana - cfg.startMana).toBe((plain.mana - cfg.startMana) * 3);
    // EXP is what the level gates are made of, so it must be untouched.
    expect(rich.ex).toBe(plain.ex);
    expect(rich.level).toBe(plain.level);
  });

  it('switches exploration income off entirely at zero', () => {
    expect(cellsPerMana(dials({ manaRegenRatio: 0 }))).toBe(Number.POSITIVE_INFINITY);
    expect(cellsPerMana(DEFAULT_GAMEPLAY)).toBe(4);
    // Faster regen means fewer cells per mana, never more.
    expect(cellsPerMana(dials({ manaRegenRatio: 2 }))).toBeLessThan(4);
  });
});

describe('the sweep dial', () => {
  /** A board with something for Sweep to find. */
  const sweepable = (settings: GameplaySettings) =>
    Game.create(board('normal', 2), SEED, { settings });

  it('refuses to sweep at all when switched off', () => {
    const game = sweepable(dials({ sweep: 'off' }));
    expect(game.sweepAvailable).toBe(false);
    expect(game.sweep()).toEqual([{ type: 'blocked', reason: 'no-charge' }]);
  });

  it('holds a charged sweep until the cells are banked', () => {
    const game = sweepable(dials({ sweep: 'charge', sweepChargeClicks: 3 }));
    expect(game.sweepAvailable).toBe(false);
    expect(game.chargeNeeded).toBe(3);

    let opened = 0;
    for (const cell of game.grid.flat()) {
      if (opened >= 3) break;
      if (!cell.present || cell.open || cell.tier > 0) continue;
      game.open(cell.x, cell.y);
      opened++;
    }
    expect(game.charge).toBeGreaterThanOrEqual(3);
    expect(game.sweepAvailable).toBe(true);
  });

  it('never lets a sweep pay for the next one', () => {
    // The cells a sweep opens must not charge the meter, or the gate is
    // decorative: one sweep of forty cells would bank a dozen more.
    const game = sweepable(dials({ sweep: 'charge', sweepChargeClicks: 1 }));
    const target = game.grid.flat().find((c) => c.present && !c.open && c.tier === 0);
    game.open(target!.x, target!.y);
    expect(game.sweepAvailable).toBe(true);

    const events = game.sweep();
    // Non-vacuous on purpose: a sweep that found nothing would prove nothing.
    expect(events.length).toBeGreaterThan(0);
    // Spent, and not refilled by the cells it opened itself.
    expect(game.charge).toBe(0);
    expect(game.sweepAvailable).toBe(false);
  });

  it('is always available when the dial is on', () => {
    expect(sweepable(dials({ sweep: 'on' })).sweepAvailable).toBe(true);
  });

  it('starts uncharged on the tuned default, which is charged', () => {
    // The default gates Sweep behind ten hand-opened cells, so a fresh board
    // has nothing banked. This is the assertion that fails first if the
    // default is ever flipped back.
    expect(DEFAULT_GAMEPLAY.sweep).toBe('charge');
    expect(sweepable(DEFAULT_GAMEPLAY).sweepAvailable).toBe(false);
  });
});

describe('forfeit', () => {
  it('ends the board as a loss and reveals the creatures', () => {
    const game = Game.create(board('normal'), SEED);
    const events = game.forfeit();
    expect(game.status).toBe('lost');
    expect(events).toEqual([{ type: 'lost' }]);
    expect(
      game.grid
        .flat()
        .filter((c) => c.tier > 0)
        .every((c) => c.open),
    ).toBe(true);
  });

  it('cannot end a board twice', () => {
    const game = Game.create(board('normal'), SEED);
    game.forfeit();
    expect(game.forfeit()).toEqual([{ type: 'blocked', reason: 'game-over' }]);
  });
});

describe('a Full Run under the dials', () => {
  it('spends the HP-regen dial on the heal, and nothing else', () => {
    const type = findType(ladders, 'normal');
    const quarter = FullRun.start(ladders, 'normal', SEED, {
      settings: dials({ hpRegenRatio: 0.25 }),
    });
    expect(quarter.maxHp).toBe(type.run_hp);
    expect(quarter.healPerBoard).toBe(Math.floor(type.run_hp * 0.25));
    // Nothing heals INSIDE a board at any setting — HP is a guess budget.
    expect(quarter.game.maxHp).toBe(type.run_hp);
  });

  it('scales the pool once, not twice', () => {
    // The run passes the board's unscaled HP into the config and lets `Game`
    // apply the dial, so a run's pool and its board's ceiling must agree.
    const run = FullRun.start(ladders, 'normal', SEED, { settings: dials({ hpRatio: 2 }) });
    expect(run.game.maxHp).toBe(run.maxHp);
    expect(run.maxHp).toBe(effectiveHp(findType(ladders, 'normal').run_hp, dials({ hpRatio: 2 })));
    expect(run.hp).toBe(run.maxHp);
  });
});

describe('which settings keep a record', () => {
  it('counts anything at or harder than the tuned game', () => {
    for (const patch of [
      { hpRatio: 0.5 },
      { hpRegenRatio: 0 },
      { enemyDamageRatio: 3 },
      { manaRegenRatio: 0 },
      { manaRewardRatio: 0.1 },
      { sweep: 'off' as const },
      { sweep: 'charge' as const, sweepChargeClicks: 25 },
      { timeAttack: true },
    ]) {
      expect(isAtLeastAsHard(dials(patch)), JSON.stringify(patch)).toBe(true);
      expect(easierThanDefault(dials(patch))).toEqual([]);
    }
  });

  it('refuses an unlimited Sweep, now that the default rations it', () => {
    // The whole reason Sweep had to join this check. While 'on' was the
    // default, nothing about the dial could be easier than default; charging
    // it by default makes unlimited access exactly that.
    expect(isAtLeastAsHard(dials({ sweep: 'on' }))).toBe(false);
    expect(easierThanDefault(dials({ sweep: 'on' }))).toEqual(['Sweep']);
    // And a bank small enough to be 'on' wearing a meter.
    expect(isAtLeastAsHard(dials({ sweepChargeClicks: 1 }))).toBe(false);
    expect(easierThanDefault(dials({ sweepChargeClicks: 1 }))).toEqual(['cells per sweep']);
  });

  it('refuses anything easier, and names it', () => {
    expect(isAtLeastAsHard(dials({ hpRatio: 1.05 }))).toBe(false);
    expect(easierThanDefault(dials({ hpRatio: 1.05 }))).toEqual(['player HP']);
    expect(easierThanDefault(dials({ enemyDamageRatio: 0 }))).toEqual(['creature damage']);
    expect(easierThanDefault(dials({ hpRegenRatio: 1, manaRewardRatio: 2 }))).toEqual([
      'HP regen',
      'mana reward',
    ]);
  });

  it('never counts a gated Sweep as easier', () => {
    // Both non-default modes take a tool away, and any finite bank is less
    // than unlimited, so no setting of it can make a board easier.
    expect(easierThanDefault(dials({ sweep: 'charge', sweepChargeClicks: 50 }))).toEqual([]);
  });
});

describe('sliders move in 0.05 steps', () => {
  it('snaps and clamps', () => {
    expect(snapRatio(0.53, 0, 3)).toBe(0.55);
    expect(snapRatio(0.52, 0, 3)).toBe(0.5);
    expect(snapRatio(-4, 0, 3)).toBe(0);
    expect(snapRatio(99, 0, 1)).toBe(1);
  });
});

describe('THE DIALS CANNOT REACH THE LOAD-BEARING FACTS', () => {
  const harsh = dials({
    hpRatio: 0, // one point of HP, the minimum a board can have
    enemyDamageRatio: 3,
    manaRegenRatio: 0,
    manaRewardRatio: 0,
    sweep: 'off',
  });

  it('still clears every battle ladder without losing a point of HP', () => {
    // The zero-damage guarantee is a claim about what is POSSIBLE: at level k
    // every tier <= k is a free kill and the gate to k+1 is at most C_k. A
    // free kill takes no retaliation, so no damage dial can touch it — which
    // means a board on 1 HP against triple-damage creatures is still clearable
    // without being hit once.
    for (const type of ladders.filter((t) => !t.search)) {
      for (const n of [1, 5, 10]) {
        const cfg = boardConfig(ladders, type.id, n);
        const game = Game.create(cfg, SEED, { settings: harsh });
        const result = autoplayTierOrder(game);
        expect(result.cleared, `${type.id}#${n} could not be cleared`).toBe(true);
        expect(result.hpLost, `${type.id}#${n} lost HP`).toBe(0);
      }
    }
  });

  it('pays every creature its full EXP whatever the dials say', () => {
    // Invariant 3: the upper gates ARE C_k, so a creature removed without
    // paying out makes that gate permanently unreachable. No dial may skip it.
    const cfg = boardConfig(ladders, 'normal', 6);
    const plain = Game.create(cfg, SEED);
    const wild = Game.create(cfg, SEED, { settings: harsh });
    autoplayTierOrder(plain);
    autoplayTierOrder(wild);
    expect(wild.ex).toBe(plain.ex);
    expect(wild.level).toBe(plain.level);
  });
});
