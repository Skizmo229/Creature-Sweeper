import { describe, expect, it } from 'vitest';
import {
  Progression,
  damageIfSurvived,
  expForTier,
  isFreeKill,
  manaForTier,
  resolveBattle,
} from '../src/engine/combat.js';

describe('damage formula', () => {
  it('costs nothing at or below your level', () => {
    for (let level = 1; level <= 9; level++) {
      for (let tier = 1; tier <= level; tier++) {
        expect(damageIfSurvived(level, tier)).toBe(0);
        expect(isFreeKill(level, tier)).toBe(true);
      }
    }
  });

  it('costs exactly the creature tier one tier up, while E <= 2L', () => {
    for (let level = 1; level <= 9; level++) {
      for (let tier = level + 1; tier <= Math.min(9, 2 * level); tier++) {
        expect(damageIfSurvived(level, tier)).toBe(tier);
      }
    }
  });

  it('matches the table on the reference page', () => {
    // rows are level 1..9, columns tier 1..9
    const table = [
      [0, 2, 6, 12, 20, 30, 42, 56, 72],
      [0, 0, 3, 4, 10, 12, 21, 24, 36],
      [0, 0, 0, 4, 5, 6, 14, 16, 18],
      [0, 0, 0, 0, 5, 6, 7, 8, 18],
      [0, 0, 0, 0, 0, 6, 7, 8, 9],
      [0, 0, 0, 0, 0, 0, 7, 8, 9],
      [0, 0, 0, 0, 0, 0, 0, 8, 9],
      [0, 0, 0, 0, 0, 0, 0, 0, 9],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    table.forEach((row, i) => {
      row.forEach((expected, j) => {
        expect(damageIfSurvived(i + 1, j + 1)).toBe(expected);
      });
    });
  });

  it('is unbounded at level 0 — no fight can ever be won', () => {
    expect(damageIfSurvived(0, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(isFreeKill(0, 1)).toBe(false);
  });
});

describe('resolveBattle', () => {
  it('agrees with the closed form whenever the player survives', () => {
    for (let level = 1; level <= 9; level++) {
      for (let tier = 1; tier <= 9; tier++) {
        const result = resolveBattle(level, 999, tier);
        expect(result.defeated).toBe(true);
        expect(result.damage).toBe(damageIfSurvived(level, tier));
      }
    }
  });

  it('caps damage at death rather than reporting the full exchange', () => {
    // level 1 vs tier 5 would cost 20 to survive; with 10 HP you die first.
    expect(damageIfSurvived(1, 5)).toBe(20);
    const result = resolveBattle(1, 10, 5);
    expect(result.defeated).toBe(false);
    expect(result.hp).toBe(0);
    expect(result.damage).toBe(10);
  });

  it('kills a level-0 player without ever scratching the creature', () => {
    const result = resolveBattle(0, 1, 3);
    expect(result.defeated).toBe(false);
    expect(result.hp).toBe(0);
  });

  it('rejects fighting empty ground', () => {
    expect(() => resolveBattle(1, 10, 0)).toThrow();
  });
});

describe('rewards', () => {
  it('awards EXP exponentially and mana linearly', () => {
    expect([1, 2, 3, 4, 5].map(expForTier)).toEqual([1, 2, 4, 8, 16]);
    expect([1, 2, 3, 4, 5].map(manaForTier)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Progression', () => {
  const thresholds = [10, 50, 167, 271]; // NORMAL board 1 in the original

  it('levels up on reaching each threshold', () => {
    const p = new Progression(1, thresholds);
    expect(p.nextAt()).toBe(10);
    expect(p.award(9)).toBe(false);
    expect(p.level).toBe(1);
    expect(p.award(1)).toBe(true);
    expect(p.level).toBe(2);
  });

  it('can climb several levels from one award', () => {
    const p = new Progression(1, thresholds);
    expect(p.award(200)).toBe(true);
    expect(p.level).toBe(4);
  });

  it('caps at one past the table and reports NE 9999', () => {
    const p = new Progression(1, thresholds);
    p.award(1000);
    expect(p.level).toBe(5);
    expect(p.isMaxLevel()).toBe(true);
    expect(p.toNext()).toBe(9999);
    // further EXP must not push the level any higher
    p.award(10_000);
    expect(p.level).toBe(5);
  });

  it('never advances from level 0', () => {
    const p = new Progression(0, [9999, 9999, 9999, 9999]);
    expect(p.award(500)).toBe(false);
    expect(p.level).toBe(0);
  });
});
