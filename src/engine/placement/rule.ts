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

import type { BoardConfig, OpeningRule, Placement } from '../types.js';
import type { Grid } from '../grid.js';
import type { Rng } from '../rng.js';

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

/** A board the shape has been cut into, ready for its creatures. */
export interface Deal {
  readonly grid: Grid;
  readonly cfg: BoardConfig;
  /** Flat indices (`y * width + x`) of the cells a creature may stand on, in board order. */
  readonly spawnable: readonly number[];
  readonly rng: Rng;
  /** The cells beside a flat index, through `neighbours()`, as flat indices. */
  neighboursOf(flat: number): number[];
}

/**
 * Where a tier may stand by position alone, before anything is open. Every cell and every tier
 * belongs to a pool, and a tier stands only on a cell of its own pool; empty ground stands on any.
 * The checkerboard's pools are its two colours; every other rule has one.
 */
export interface Pools {
  of(x: number, y: number): string;
  forTier(tier: number): string;
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
  /**
   * Lay the creatures into the board: set `tier` and `alive` on exactly `quantity[i]` cells of tier
   * i + 1, and nothing else. It decides where, never how many; a quota that cannot land exactly
   * throws rather than leaving a board a few creatures short of its C_k gates. Numbers are computed
   * after it returns.
   */
  deal(d: Deal): void;
}

/** `${typeId}#${n}`, the way every config message names a board. */
export function boardName(row: PlacementRow): string {
  return `${row.typeId}#${row.n}`;
}
