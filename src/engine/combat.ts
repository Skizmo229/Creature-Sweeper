/**
 * Combat, experience and levelling — ported from the original's behaviour,
 * not from its description.
 *
 * A creature's tier is simultaneously its HP, its attack, and the basis of its
 * EXP value. The player's level is their attack. The player always strikes
 * first.
 */

import type { Tier } from './types.js';

/** EXP awarded for defeating a tier-E creature: 1, 2, 4, 8, 16, ... */
export function expForTier(tier: Tier): number {
  return 2 ** (tier - 1);
}

/**
 * Mana awarded for defeating a tier-E creature: linear, where EXP is
 * exponential. That difference is what keeps spells available early and scarce
 * late. Unused until magic lands, but it belongs beside its sibling.
 */
export function manaForTier(tier: Tier): number {
  return tier;
}

/**
 * HP lost beating a tier-E creature at level L, *assuming you survive*.
 *
 *   damage = E * (ceil(E / L) - 1)
 *
 * So E <= L always costs nothing, and one tier up costs exactly E while
 * E <= 2L. At level 0 you can never reduce a creature's HP, so the fight is
 * unwinnable and the cost is unbounded.
 */
export function damageIfSurvived(level: number, tier: Tier): number {
  if (level <= 0) return Number.POSITIVE_INFINITY;
  return tier * (Math.ceil(tier / level) - 1);
}

/** True when this fight is guaranteed to cost nothing. */
export function isFreeKill(level: number, tier: Tier): boolean {
  return level > 0 && tier <= level;
}

export interface BattleResult {
  defeated: boolean;
  /** Player HP after the exchange; 0 or less means dead. */
  hp: number;
  /** HP actually lost — capped by death, unlike `damageIfSurvived`. */
  damage: number;
}

/**
 * Resolve one fight, blow by blow, exactly as the original does: the player
 * swings, and if the creature is still standing it swings back, repeating
 * until one of them drops.
 *
 * `bite` is what one retaliation costs, and defaults to the creature's tier —
 * the unmodified rule. The enemy-damage dial scales it per blow rather than
 * scaling the total afterwards, because the fight is resolved round by round
 * and whether you survive round three depends on what rounds one and two
 * actually took off you.
 */
export function resolveBattle(
  level: number, hp: number, tier: Tier, bite: number = tier,
): BattleResult {
  if (tier <= 0) throw new Error('resolveBattle called on empty ground');

  const startHp = hp;
  let creatureHp = tier;
  let defeated = false;

  // A stalemate is reachable only with the damage dial at zero: at level 0 the
  // player can never reduce the creature, and at bite 0 the creature can never
  // reduce the player, so the loop below would not terminate. Neither side can
  // land a blow, so neither side does.
  if (level <= 0 && bite <= 0) return { defeated: false, hp, damage: 0 };

  while (hp > 0 && creatureHp > 0) {
    creatureHp -= level;
    if (creatureHp <= 0) {
      defeated = true;
      break;
    }
    // The creature survived, so it retaliates. A positive bite guarantees this
    // terminates even at level 0, where the player can never land a kill.
    hp -= bite;
  }

  return { defeated, hp: Math.max(0, hp), damage: startHp - Math.max(0, hp) };
}

/** The player's level/EXP track for a single board. */
export class Progression {
  level: number;
  ex = 0;
  readonly thresholds: readonly number[];

  constructor(startLevel: number, thresholds: readonly number[]) {
    this.level = startLevel;
    this.thresholds = thresholds;
  }

  /**
   * EXP required for the next level. Level 0 can never advance, and past the
   * end of the table the target runs away from you so the HUD reads 9999.
   */
  nextAt(): number {
    if (this.level === 0) return 9999;
    if (this.thresholds.length <= this.level - 1) return 9999 + this.ex;
    return this.thresholds[this.level - 1]!;
  }

  isMaxLevel(): boolean {
    return this.level > this.thresholds.length;
  }

  /** EXP still needed to level, as shown in the HUD's NE field. */
  toNext(): number {
    return this.nextAt() - this.ex;
  }

  /** Award EXP and apply any levels it buys. Returns true if the level rose. */
  award(exp: number): boolean {
    this.ex += exp;
    let leveled = false;
    while (this.ex >= this.nextAt()) {
      leveled = true;
      this.level++;
      if (this.isMaxLevel()) break;
    }
    return leveled;
  }
}
