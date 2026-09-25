/**
 * Player-chosen gameplay modifiers.
 *
 * Headless like the rest of the engine: these are numbers the rules read, not
 * a preferences store. The UI owns persistence (`src/ui/settings.ts`); this
 * file owns what the dials mean and, crucially, what they are not allowed to
 * touch.
 *
 * THE RULE THAT KEEPS THE INVARIANTS ALIVE. Not one of these modifiers
 * changes EXP, a level threshold, or whether a creature dies and pays out.
 * That is what makes them safe to ship at all:
 *
 *  - The tuning identity (upper thresholds are `C_k`) is untouched, because
 *    `C_k` is a sum over creatures and no dial here adds, removes or re-values
 *    one.
 *  - The zero-damage guarantee is a statement about what is *possible* — at
 *    level k every tier <= k is a free kill, and a free kill scaled by any
 *    damage ratio is still free. Scaling HP moves the guess budget; it cannot
 *    make a required fight cost something.
 *  - "EXP must always be collected" is untouched for the same reason as the
 *    first: nothing here can remove a creature.
 *
 * Anything added to this interface has to clear those three before it lands.
 * A dial that scaled EXP, or one that let a creature be skipped, would break a
 * run silently rather than throwing.
 */

/** Empty cells you must uncover yourself to earn one mana, unmodified. */
import { MANA_PER_EMPTY_CELLS } from './spells.js';

/** How the Sweep buttons are gated. */
export type SweepMode =
  /** Always available, as the game has always worked. */
  | 'on'
  /** Gone entirely — every cell is opened by hand. */
  | 'off'
  /** Banked: opening cells by hand charges it, sweeping spends the charge. */
  | 'charge';

export interface GameplaySettings {
  /** Scales the board's HP pool. 0 still leaves 1 HP — a board you enter
   *  already dead is not a board. */
  readonly hpRatio: number;
  /**
   * Fraction of the pool a Full Run heals after each cleared board.
   *
   * ONLY a Full Run. Healing inside a board would turn HP from a guess budget
   * into a combat resource, which is the one change the whole risk model rests
   * on not happening. 0.5 is the mode's original rule, rounded down as it
   * always was.
   */
  readonly hpRegenRatio: number;
  /** Scales the damage a creature's retaliation does. A free kill stays free
   *  at any value, which is why this cannot reach the guarantee. */
  readonly enemyDamageRatio: number;
  /** Scales the exploration trickle — mana per empty cell you uncover. */
  readonly manaRegenRatio: number;
  /** Scales the mana a defeated creature pays out. Never its EXP. */
  readonly manaRewardRatio: number;
  readonly sweep: SweepMode;
  /** Cells opened by hand per sweep, when `sweep` is 'charge'. */
  readonly sweepChargeClicks: number;
  /**
   * Replay against your own best time: the clock counts down from it and
   * hitting zero loses the board.
   *
   * Entirely the caller's to enforce — the engine has no timers. It is here so
   * that "am I playing the tuned game?" is one question with one answer.
   */
  readonly timeAttack: boolean;
}

export const DEFAULT_GAMEPLAY: GameplaySettings = {
  hpRatio: 1,
  hpRegenRatio: 0.5,
  enemyDamageRatio: 1,
  manaRegenRatio: 1,
  manaRewardRatio: 1,
  sweep: 'charge',
  sweepChargeClicks: 10,
  timeAttack: false,
};

/** The step every ratio slider moves in. */
const RATIO_STEP = 0.05;

/**
 * True when nothing here makes the game easier than the tuned default.
 *
 * This is what decides whether a clear is written down as a record. Each dial
 * has a direction: less HP, less healing, more damage, less mana and a gated
 * Sweep are all harder, and Time Attack can only add a way to lose. A setting
 * left exactly at its default is "equal", which counts.
 *
 * Deliberately per-dial rather than a blanket "modified" flag, because most of
 * these are asymmetric — a player who wants a harder game should not have
 * their times thrown away for it.
 */
export function isAtLeastAsHard(s: GameplaySettings): boolean {
  return (
    s.hpRatio <= DEFAULT_GAMEPLAY.hpRatio &&
    s.hpRegenRatio <= DEFAULT_GAMEPLAY.hpRegenRatio &&
    s.enemyDamageRatio >= DEFAULT_GAMEPLAY.enemyDamageRatio &&
    s.manaRegenRatio <= DEFAULT_GAMEPLAY.manaRegenRatio &&
    s.manaRewardRatio <= DEFAULT_GAMEPLAY.manaRewardRatio &&
    sweepRank(s) >= sweepRank(DEFAULT_GAMEPLAY) &&
    s.sweepChargeClicks >= DEFAULT_GAMEPLAY.sweepChargeClicks
  );
}

/**
 * How hard a Sweep mode is, as an order: off is hardest, on is easiest.
 *
 * Ranked because Sweep is charged by default (decision 0014): 'on' is
 * unlimited access to a tool the tuned game rations, and a player who switched
 * to it would otherwise be handed records and unlocks for a strictly easier
 * game. The charge size is the same argument in miniature: a
 * bank of 1 cell per sweep is nearly 'on' wearing a meter, so it has to be
 * compared rather than assumed finite-and-therefore-harder.
 */
function sweepRank(s: GameplaySettings): number {
  return s.sweep === 'off' ? 2 : s.sweep === 'charge' ? 1 : 0;
}

/** True when every dial sits exactly where the ladder was tuned. */
export function isDefaultGameplay(s: GameplaySettings): boolean {
  return (Object.keys(DEFAULT_GAMEPLAY) as Array<keyof GameplaySettings>).every(
    (k) => s[k] === DEFAULT_GAMEPLAY[k],
  );
}

/**
 * Which dials are easier than default, named — for telling the player why a
 * board will not be recorded. Empty means it will be.
 */
export function easierThanDefault(s: GameplaySettings): string[] {
  const out: string[] = [];
  if (s.hpRatio > DEFAULT_GAMEPLAY.hpRatio) out.push('player HP');
  if (s.hpRegenRatio > DEFAULT_GAMEPLAY.hpRegenRatio) out.push('HP regen');
  if (s.enemyDamageRatio < DEFAULT_GAMEPLAY.enemyDamageRatio) out.push('creature damage');
  if (s.manaRegenRatio > DEFAULT_GAMEPLAY.manaRegenRatio) out.push('mana regen');
  if (s.manaRewardRatio > DEFAULT_GAMEPLAY.manaRewardRatio) out.push('mana reward');
  if (sweepRank(s) < sweepRank(DEFAULT_GAMEPLAY)) out.push('Sweep');
  else if (s.sweepChargeClicks < DEFAULT_GAMEPLAY.sweepChargeClicks) out.push('cells per sweep');
  return out;
}

// ------------------------------------------------------------------ appliers
//
// One function per dial, so the arithmetic lives beside the meaning rather
// than being spelled out at each call site.

/** The HP a board actually starts with. Never below 1. */
export function effectiveHp(baseHp: number, s: GameplaySettings): number {
  return Math.max(1, Math.round(baseHp * s.hpRatio));
}

/** HP restored between the boards of a Full Run. Rounded DOWN, as the mode
 *  has always done — see `run.ts` for why a pool of 1 must heal nothing. */
export function healPerBoard(poolHp: number, s: GameplaySettings): number {
  return Math.floor(poolHp * s.hpRegenRatio);
}

/**
 * What one retaliation from a tier-E creature costs.
 *
 * Scaled per blow rather than applied to the total, because the fight is
 * resolved blow by blow and whether you survive round three depends on what
 * rounds one and two actually took off you.
 */
export function biteFor(tier: number, s: GameplaySettings): number {
  return Math.max(0, Math.round(tier * s.enemyDamageRatio));
}

/** Mana a defeated tier-E creature pays. Its EXP is never scaled. */
export function manaRewardFor(tier: number, s: GameplaySettings): number {
  return Math.max(0, Math.round(tier * s.manaRewardRatio));
}

/**
 * Empty cells per mana of exploration income, after the dial.
 *
 * A ratio of 0 switches the trickle off entirely, which is why this can return
 * Infinity rather than clamping to some very large number — "never" is a real
 * setting and the caller compares against it directly.
 */
export function cellsPerMana(s: GameplaySettings): number {
  if (s.manaRegenRatio <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.round(MANA_PER_EMPTY_CELLS / s.manaRegenRatio));
}

/** Snap a slider value onto the step, and into range. */
export function snapRatio(value: number, min: number, max: number): number {
  const stepped = Math.round(value / RATIO_STEP) * RATIO_STEP;
  return Math.min(max, Math.max(min, Math.round(stepped * 100) / 100));
}
