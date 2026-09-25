/**
 * The honest player: reads only what a player can see, deduces what it can,
 * and when deduction runs out either spends mana or takes a guess and eats the
 * damage.
 *
 * A library, like `solver.ts` and `autoplay.ts`: the command-line measurements
 * in `cli/` run on import and share this one player, because a second copy of
 * it would drift. `cli/spellvalue.ts` measures spells with it; `cli/forced.ts`
 * measures how many of its forced guesses a complete deducer would not have
 * needed.
 */

import type { Game } from '../engine/game.js';
import type { SpellId } from '../engine/spells.js';
import type { Cell } from '../engine/types.js';
import {
  type Constraint,
  allConstraints,
  bestGuess,
  censusOracle,
  censusTarget,
  nameWhatIsCertain,
  safeToOpen,
} from './deduce.js';

/**
 * How the player spends, if they spend at all.
 *
 * The information spells are cast at a stuck point and judged on whether they
 * unlock a deduction. Exercise cannot be judged that way and it is not a flaw
 * in the spell: it unlocks nothing, it makes the fight you were already going
 * to take cost less. So it is cast at the same moment — the one where
 * deduction has run out and a guess is coming — and judged on the `exercised`
 * event the fight itself emits, which says exactly what it spared.
 */
export type Policy =
  'none' | 'reveal' | 'census' | 'census-best' | 'exercise' | 'beacon' | 'workout' | 'gym';

/**
 * The policies that measure each spell, keyed by every spell, so a new one cannot be added without
 * saying how it is measured. Declaration order is the order the measurements print. WORKOUT's
 * `workout` and `gym` are Exercise under that ladder's own rule and are measured on their own.
 */
export const SPELL_POLICIES: Readonly<Record<SpellId, readonly Policy[]>> = {
  reveal: ['reveal'],
  // `census-best` casts where the count demonstrably unlocks something: what Census is worth
  // when aimed perfectly, against `census`, aimed by judgement.
  census: ['census', 'census-best'],
  exercise: ['exercise'],
  // Cast at a stuck point, like Reveal and Census, while there is an untouched blank region left.
  beacon: ['beacon'],
};

export interface Run {
  cleared: boolean;
  hpLost: number;
  guesses: number;
  stuckPoints: number;
  casts: number;
  castsThatHelped: number;
  manaSpent: number;
  manaPool: number;
  /** Stuck points a `rescue` deducer turned into a free move instead. */
  rescued: number;
  /** In observe mode, stuck points where it could have. */
  couldRescue: number;
  /** HP lost on cells a rescue called free. Anything but 0 is a solver bug. */
  rescueDamage: number;
}

/**
 * A stronger deducer to fall back on, for measuring what this player misses.
 *
 * Asked only once the player's own reasoning has run dry, so everything it
 * returns is a cell the player would otherwise have gambled around. With
 * `observe` it is asked and ignored, which measures the honest trajectory
 * itself — how many of THIS player's stuck points had a free move in them.
 */
export interface PlayOptions {
  rescue?: (game: Game) => Cell[];
  observe?: boolean;
  /**
   * Where to gamble when nothing is proven, in place of this player's own
   * choice. For measuring what a better GUESSER would face, on top of a better
   * deducer — `lethal.ts` guesses the cell whose worst case is lowest.
   */
  guess?: (game: Game) => Cell | null;
}

/**
 * This player's own choice of gamble, optionally restricted to some cells —
 * so a caller that has narrowed the field by other means can still break the
 * tie the way this player would.
 */
export function honestGuess(game: Game, among?: ReadonlySet<Cell>): Cell | null {
  return bestGuess(game, allConstraints(game), among);
}

export function play(
  game: Game,
  policy: Policy,
  spellId: SpellId | null,
  options: PlayOptions = {},
): Run {
  const run: Run = {
    cleared: false,
    hpLost: 0,
    guesses: 0,
    stuckPoints: 0,
    casts: 0,
    castsThatHelped: 0,
    manaSpent: 0,
    manaPool: 0,
    rescued: 0,
    couldRescue: 0,
    rescueDamage: 0,
  };
  const freeMoves = (): Cell[] =>
    options.rescue ? options.rescue(game).filter((c) => !c.open && game.inReach(c)) : [];
  const startHp = game.hp;
  let castsHere = 0;
  let guard = game.config.width * game.config.height * 4;

  while (game.status === 'playing' && guard-- > 0) {
    // Everything free first: name what is certain, then take what is proven,
    // and only call it stuck when neither has anything left to give.
    if (nameWhatIsCertain(game)) {
      castsHere = 0;
      continue;
    }

    const constraints = allConstraints(game);
    // Same again: a proof about a cell you cannot click yet is a proof you
    // have to hold on to, not a move.
    const safe = safeToOpen(game, constraints).filter(
      (c) => c.mark <= game.level && game.inReach(c),
    );

    if (workoutMove(game, policy, safe.length > 0, run)) continue;

    if (safe.length) {
      for (const cell of safe) {
        if (game.status !== 'playing' || cell.open) continue;
        game.open(cell.x, cell.y);
      }
      castsHere = 0;
      continue;
    }

    if (options.rescue && !options.observe) {
      const found = freeMoves();
      if (found.length) {
        run.rescued++;
        for (const cell of found) {
          if (game.status !== 'playing' || cell.open) continue;
          const hp = game.hp;
          game.open(cell.x, cell.y);
          run.rescueDamage += hp - game.hp;
        }
        castsHere = 0;
        continue;
      }
    }

    const guess = options.guess ? options.guess(game) : bestGuess(game, constraints);
    if (!guess) break;
    run.stuckPoints++;
    if (options.rescue && options.observe && freeMoves().length) run.couldRescue++;

    // Exercise, if this policy holds one, goes on the guess about to be made
    // rather than on the deduction that has already failed. Cast and fall
    // straight through: it changes nothing a player could reason about, so
    // going round the loop again would only find the same dead end.
    if (
      (policy === 'exercise' || policy === 'workout' || policy === 'gym') &&
      game.exerciseCharge === 0 &&
      game.canCast('exercise')
    ) {
      const before = game.mana;
      if (!game.cast('exercise').some((e) => e.type === 'blocked')) {
        run.casts++;
        run.manaSpent += before - game.mana;
      }
    }

    if (castsHere < 2 && spendAtStuckPoint(game, policy, spellId, guess, constraints, run)) {
      castsHere++;
      continue;
    }

    run.guesses++;
    castsHere = 0;
    const opened = game.open(guess.x, guess.y);
    // A cast counts as useful when the fight says so. `spared` is the engine's
    // own arithmetic for what the borrowed level took off the damage, so a
    // charge spent on a guess that turned out to be empty ground, or on a
    // creature already free to kill, correctly counts for nothing.
    if (opened.some((e) => e.type === 'exercised' && e.spared > 0)) run.castsThatHelped++;
  }

  run.cleared = game.status === 'won';
  run.hpLost = startHp - game.hp;
  run.manaPool = game.mana + run.manaSpent;
  return run;
}

// WORKOUT's own move, and the reason the mode exists: a creature named at
// one tier past your level is a free kill for the price of an Exercise,
// and pays double for it. Taken before any guess, because it is not one.
//
// `gym` goes further and trains on free kills too: any creature already
// named at or one past your level, taken on a charge for the double EXP,
// whenever the price is back at its base. That is the player who treats
// the spell as a way to level rather than as insurance.
function workoutMove(game: Game, policy: Policy, hasSafe: boolean, run: Run): boolean {
  const training =
    policy === 'gym' &&
    game.config.workout &&
    game.spellCost('exercise') === game.config.workout.base;
  if (
    (training || (!hasSafe && (policy === 'workout' || policy === 'gym'))) &&
    game.exerciseCharge === 0 &&
    game.canCast('exercise')
  ) {
    const reachable = game.grid
      .flat()
      .filter(
        (c) =>
          c.present &&
          !c.open &&
          c.mark > 0 &&
          c.mark <= game.level + 1 &&
          (training || c.mark === game.level + 1) &&
          game.inReach(c),
      )
      .sort((a, b) => b.mark - a.mark)[0];
    if (reachable) {
      const before = game.mana;
      if (!game.cast('exercise').some((e) => e.type === 'blocked')) {
        run.casts++;
        run.manaSpent += before - game.mana;
        const events = game.open(reachable.x, reachable.y);
        if (events.some((e) => e.type === 'exercised' && (e.spared > 0 || e.bonusExp > 0))) {
          run.castsThatHelped++;
        }
        return true;
      }
    }
  }
  return false;
}

// Spend, if this policy spends and the spell can still be afforded. Two
// casts at one stuck point at most: past that it is throwing mana at a
// wall, which is a decision a player makes once and not again.
function spendAtStuckPoint(
  game: Game,
  policy: Policy,
  spellId: SpellId | null,
  guess: Cell,
  constraints: Constraint[],
  run: Run,
): boolean {
  if (
    policy !== 'none' &&
    policy !== 'workout' &&
    policy !== 'gym' &&
    spellId &&
    game.canCast(spellId)
  ) {
    // Beacon takes no target: it opens the largest blank region nobody has touched, and is
    // refused when there is none.
    const untargeted = spellId === 'beacon';
    const target = untargeted
      ? null
      : spellId === 'reveal'
        ? guess
        : policy === 'census-best'
          ? censusOracle(game, guess)
          : censusTarget(game, constraints, guess);
    if (target || untargeted) {
      const before = game.mana;
      const events = target ? game.cast(spellId, target.x, target.y) : game.cast(spellId);
      if (!events.some((e) => e.type === 'blocked')) {
        run.casts++;
        run.manaSpent += before - game.mana;
        const after = safeToOpen(game, allConstraints(game)).filter((c) => !c.open);
        if (after.length) run.castsThatHelped++;
        return true;
      }
    }
  }
  return false;
}
