/**
 * A fight with the creature on a cell the player opened: Exercise's borrowed level, the damage,
 * WORKOUT's bonus EXP, the kill's EXP and mana, the level-up, and the board won or lost. `Game`
 * does the opening and calls this; every kill pays its full EXP (docs/invariants.md, fact 3).
 */

import type { BoardConfig, Cell, GameEvent, GameStatus } from './types.js';
import { type Progression, expForTier, resolveBattle } from './combat.js';
import { type GameplaySettings, biteFor, manaRewardFor } from './settings.js';
import type { Grid } from './grid.js';

/** The game state a fight reads and changes. `Game` satisfies it. */
export interface FightHost {
  readonly config: BoardConfig;
  readonly settings: GameplaySettings;
  readonly grid: Grid;
  readonly level: number;
  readonly progression: Progression;
  /** Creatures left of each tier; index 0 is tier 1. */
  readonly remaining: number[];
  hp: number;
  mana: number;
  status: GameStatus;
  exerciseCharge: number;
  exerciseSurcharge: number;
  creaturesLeft(): number;
}

export function fight(host: FightHost, cell: Cell): GameEvent[] {
  const events: GameEvent[] = [];

  // Exercise is spent on the fight itself, not on the damage afterwards:
  // you swing at the borrowed level, so a creature that would have taken
  // three rounds off you takes two. The creature's fate is unchanged, and it
  // still pays its EXP in full — nothing here can skip that.
  const lent = host.exerciseCharge;
  host.exerciseCharge = 0;
  const bite = biteFor(cell.tier, host.settings);
  const result = resolveBattle(host.level + lent, host.hp, cell.tier, bite);
  const taken = result.damage;
  host.hp = Math.max(0, host.hp - taken);

  // WORKOUT pays extra EXP for a kill made on a borrowed level. Extra, never
  // less: the gates are C_k, so a kill paying short could strand one, but a
  // kill paying over only reaches a gate sooner. The bonus is counted here so
  // the event can say what it was worth.
  const workout = host.config.workout;
  const bonusExp =
    lent > 0 && workout && result.defeated
      ? expForTier(cell.tier) * (workout.expMultiplier - 1)
      : 0;
  if (lent > 0) {
    const unaided = resolveBattle(host.level, host.hp + taken, cell.tier, bite).damage;
    events.push({ type: 'exercised', levels: lent, spared: unaided - taken, bonusExp });
  }
  events.push({
    type: 'battle',
    x: cell.x,
    y: cell.y,
    tier: cell.tier,
    damage: taken,
    defeated: result.defeated,
  });

  if (result.defeated) {
    cell.alive = false;
    host.remaining[cell.tier - 1] = (host.remaining[cell.tier - 1] ?? 0) - 1;
    // Every removal must pay full EXP. The upper level thresholds are the
    // TOTAL exp available from tiers at or below k, so a creature that dies
    // without paying makes that threshold permanently unreachable.
    host.mana += manaRewardFor(cell.tier, host.settings);
    const levelBefore = host.level;
    if (host.progression.award(expForTier(cell.tier) + bonusExp)) {
      events.push({ type: 'levelUp', level: host.level });
      // Levelling eases WORKOUT's price, a step per level gained. A double
      // kill can buy two levels at once, and both count.
      if (workout) {
        host.exerciseSurcharge = Math.max(
          0,
          host.exerciseSurcharge - workout.relief * (host.level - levelBefore),
        );
      }
    }
    if (host.creaturesLeft() === 0 && !host.config.search) {
      host.status = 'won';
      events.push({ type: 'won' });
      return events;
    }
  }

  if (host.hp <= 0) {
    host.hp = 0;
    host.status = 'lost';
    revealAllCreatures(host.grid);
    events.push({ type: 'lost' });
  }
  return events;
}

/** Uncover every creature, as a lost or forfeited board does. */
export function revealAllCreatures(grid: Grid): void {
  for (const row of grid) {
    for (const cell of row) {
      if (cell.tier > 0) cell.open = true;
    }
  }
}
