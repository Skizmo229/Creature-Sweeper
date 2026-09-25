/**
 * Every placement rule, by the name the ladder data uses. `Placement` is this record's keys, so a
 * rule is added by adding its line here and a name without a rule cannot exist;
 * `test/placement.test.ts` checks every name in `ladders.json` is here.
 */

import type { PlacementRule } from './rule.js';
import { UNIFORM_RULE } from './uniform.js';
import { SUDOKU_RULE } from './sudoku.js';
import { CHECKER_RULE } from './checker.js';
import { PAIRS_RULE } from './pairs.js';
import { DOMINOES_RULE } from './dominoes.js';
import { PACKS_RULE } from './packs.js';
import { CONGO_RULE } from './congo.js';

export const RULES = {
  uniform: UNIFORM_RULE,
  sudoku: SUDOKU_RULE,
  checker: CHECKER_RULE,
  pairs: PAIRS_RULE,
  dominoes: DOMINOES_RULE,
  packs: PACKS_RULE,
  congo: CONGO_RULE,
} as const satisfies Readonly<Record<string, PlacementRule>>;

/**
 * How creatures are laid out among the cells: a key of `RULES`. A placement decides where a
 * board's creatures stand, never how many there are or what they are worth, so none can reach C_k;
 * each rule's own module and `docs/modes.md` say what it is.
 */
export type Placement = keyof typeof RULES;

/** The rule a board is dealt and read by. */
export function placementRule(placement: Placement): PlacementRule {
  return RULES[placement];
}

/** Is this ladder-data name a placement the engine has a rule for? */
export function isPlacement(name: string): name is Placement {
  return Object.hasOwn(RULES, name);
}
