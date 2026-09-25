/**
 * Every placement rule, by the name the ladder data uses. Keyed by the whole `Placement` union, so
 * a name without a rule is a compile error; `test/placement.test.ts` checks every name in
 * `ladders.json` is here.
 */

import type { Placement } from '../types.js';
import type { PlacementRule } from './rule.js';
import { UNIFORM_RULE } from './uniform.js';
import { SUDOKU_RULE } from './sudoku.js';
import { CHECKER_RULE } from './checker.js';
import { PAIRS_RULE } from './pairs.js';
import { DOMINOES_RULE } from './dominoes.js';
import { PACKS_RULE } from './packs.js';
import { CONGO_RULE } from './congo.js';

export const RULES: Readonly<Record<Placement, PlacementRule>> = {
  uniform: UNIFORM_RULE,
  sudoku: SUDOKU_RULE,
  checker: CHECKER_RULE,
  pairs: PAIRS_RULE,
  dominoes: DOMINOES_RULE,
  packs: PACKS_RULE,
  congo: CONGO_RULE,
};

/** The rule a board is dealt and read by. */
export function placementRule(placement: Placement): PlacementRule {
  return RULES[placement];
}

/** Is this ladder-data name a placement the engine has a rule for? */
export function isPlacement(name: string): name is Placement {
  return Object.hasOwn(RULES, name);
}
