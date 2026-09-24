/**
 * An omniscient auto-player, used to validate tuning.
 *
 * IMPORTANT: this is not a solver and makes no claim about deducibility. It
 * can see the whole board. What it tests is the *economy* — whether the EXP
 * available from tiers at or below your level is always enough to reach the
 * next one, so the board can be cleared without ever punching above your
 * weight.
 *
 * Whether a player could actually work out where those creatures are is a
 * different question, and needs the constraint solver that solvable generation
 * will be built on.
 */

import type { Cell } from '../engine/types.js';
import { Game } from '../engine/game.js';

export interface AutoplayResult {
  cleared: boolean;
  /** HP lost over the whole board. The tuning claim is that this stays 0. */
  hpLost: number;
  finalLevel: number;
  kills: number;
  /** Set when the run could not continue without fighting above its level. */
  stuck?: { level: number; remaining: number[] };
}

/**
 * Clear a battle board in strict tier order, only ever fighting creatures at
 * or below the current level.
 */
export function autoplayTierOrder(game: Game): AutoplayResult {
  if (game.config.search) {
    throw new Error(
      'autoplayTierOrder is for battle boards; search boards cannot be cleared by combat',
    );
  }

  const startHp = game.hp;
  let kills = 0;

  while (game.status === 'playing') {
    // On a board with a crawl rule the nearest free kill may be across the
    // map, so the player walks: open safe empty ground to push the frontier
    // out, and take the creature once it comes within reach. Without this the
    // loop would re-pick the same unreachable creature for ever, and the sim
    // would hang rather than report anything.
    const target = nextSafeTarget(game) ?? nextStep(game);
    if (!target) {
      return {
        cleared: false,
        hpLost: startHp - game.hp,
        finalLevel: game.level,
        kills,
        stuck: { level: game.level, remaining: [...game.remaining] },
      };
    }
    // Walking is not killing: a step onto empty ground must not inflate the
    // kill count the tuning is read against.
    const fight = target.alive && target.tier > 0;
    game.open(target.x, target.y);
    if (fight) kills++;
  }

  return {
    cleared: game.status === 'won',
    hpLost: startHp - game.hp,
    finalLevel: game.level,
    kills,
  };
}

/**
 * The lowest-tier creature still alive that costs nothing to kill, and that
 * the crawl rule allows to be touched.
 *
 * `inReach` is free on every board without one, so this stays the same search
 * it always was everywhere else.
 */
function nextSafeTarget(game: Game): Cell | null {
  let best: Cell | null = null;
  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.alive || cell.tier === 0) continue;
      if (cell.tier > game.level) continue;
      if (!game.inReach(cell)) continue;
      if (!best || cell.tier < best.tier) best = cell;
      if (best.tier === 1) return best;
    }
  }
  return best;
}

/**
 * A step deeper in: covered empty ground within reach.
 *
 * Empty ground costs nothing to open at any level, so walking is always free
 * and can never spend the HP the sim is measuring. Returning null means the
 * frontier is walled in by creatures above the player's level — a board the
 * crawl rule has made unclearable, which is exactly what the sim exists to
 * catch.
 */
function nextStep(game: Game): Cell | null {
  for (const row of game.grid) {
    for (const cell of row) {
      if (cell.open || cell.tier !== 0 || !cell.present) continue;
      if (!game.inReach(cell)) continue;
      return cell;
    }
  }
  return null;
}

/**
 * Open every empty cell — the win condition for search boards.
 *
 * Passes repeat until one opens nothing. A single raster pass is enough on a
 * board where anything may be clicked, but it would leave cells behind under a
 * crawl rule: raster order reaches a cell before the frontier does, and the
 * refusal is silent. No search ladder carries a reach today; repeating the
 * pass costs one loop and means none ever has to remember this.
 */
export function autoplaySearch(game: Game): AutoplayResult {
  const startHp = game.hp;
  for (;;) {
    let opened = 0;
    for (const row of game.grid) {
      for (const cell of row) {
        if (game.status !== 'playing') break;
        if (cell.tier !== 0 || cell.open || !game.inReach(cell)) continue;
        game.open(cell.x, cell.y);
        opened++;
      }
    }
    if (!opened || game.status !== 'playing') break;
  }
  return {
    cleared: game.status === 'won',
    hpLost: startHp - game.hp,
    finalLevel: game.level,
    kills: 0,
  };
}
