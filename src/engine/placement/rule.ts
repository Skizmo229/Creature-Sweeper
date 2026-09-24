/**
 * The contract every placement rule meets.
 *
 * A placement rule decides where a board's creatures stand, never how many there are or what they
 * are worth, so none can reach C_k (docs/invariants.md). Everything the engine, the renderer and
 * the instruments need to know about a rule is a member of `PlacementRule`; each rule is one module
 * in this folder, and `registry.ts` lists them. A reader asks the rule rather than comparing its
 * name, so a new rule that forgets a hook is a compile error rather than a board quietly handed
 * none of its mode's deduction (decision 0029).
 */

import type { OpeningRule, Placement } from '../types.js';

/** One ladder row as a rule's config check sees it: the row's numbers and the type's geometry. */
export interface PlacementRow {
  /** The ladder id, for a message about the whole ladder. */
  readonly typeId: string;
  /** The board number within the ladder. */
  readonly n: number;
  readonly width: number;
  readonly height: number;
  readonly tiers: number;
  readonly quantity: readonly number[];
  /** Cells a creature may stand on: the bounding box less holes, hallways and doorways. */
  readonly cells: number;
  /** Creatures on the board. */
  readonly monsters: number;
  /** Sudoku's clue count, as the row carries it. */
  readonly givens: number | undefined;
  /** The type's topology, wrap and shape, spelled exactly as the ladder data spells them. */
  readonly topology: string | undefined;
  readonly wrap: string | undefined;
  readonly shape: string | undefined;
}

export interface PlacementRule {
  readonly id: Placement;
  /**
   * Refuse a ladder row this rule cannot honour, throwing a message that names the board. A row
   * that fails one of these would not throw during generation; it would generate and quietly not
   * be the mode that was tuned, so it is refused at the config boundary.
   */
  validate(row: PlacementRow): void;
  /** The opening a board of this rule gets unless its caller asks for another. */
  readonly opening: OpeningRule;
}

/** `${typeId}#${n}`, the way every config message names a board. */
export function boardName(row: PlacementRow): string {
  return `${row.typeId}#${row.n}`;
}
