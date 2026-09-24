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

import type { BoardConfig, Cell, OpeningRule, Placement } from '../types.js';
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

  /** False where the opening uncovers every empty cell, so a covered cell is always a creature. */
  readonly coveredCanBeEmpty: boolean;
  /**
   * The tiers a covered cell may still hold by this rule alone, read off what is open, as a note
   * mask; null when the rule says nothing about this cell. What the pencil offers. Sound one way:
   * it never refuses the tier the cell holds, and it never does the player's deduction for them
   * (decision 0010).
   */
  candidates(cell: Cell, view: RuleView): number | null;

  /**
   * True where every board is generated guess-free against a solver stronger than Sweep's
   * (SUDOKU). Sweep there must not read the numbers, or it solves the board in one click, so it
   * harvests tiers already written down instead (decision 0027); and a board no deducer is forced
   * to guess on has no forced guess for the instruments to measure.
   */
  readonly guessFree: boolean;
  /**
   * The most tier `cell`, one of `among`, can hold when together they hide `hidden`. Without a rule
   * that bounds a single cell that is the whole of `hidden`, which is Sweep's base bound.
   */
  cap(cell: Cell, hidden: number, among: readonly Cell[]): number;
  /**
   * The rule's whole-ring proof at `level`, made once per sweep, or null for a rule without one:
   * every covered neighbour of the open cell it is asked about is free to open. It must never run
   * away: a freed ring may hold only what the proof bounded and empty ground.
   */
  ringProof(view: RuleView, level: number): RingProof | null;
  /**
   * Covered cells the rule proves are empty ground at any level, from what is open. Every one is
   * a free sweep into a creature if the proof is ever wrong, so the test that matters is that it
   * never names a creature, whatever is open.
   */
  emptied(view: RuleView): ReadonlySet<Cell>;
}

/** What a rule reads off a board in play. `Game` satisfies it. */
export interface RuleView {
  readonly grid: Grid;
  readonly config: BoardConfig;
  neighboursOf(cell: Cell): Cell[];
}

/** Is every covered neighbour of this open cell free? `ring` is its neighbours. */
export type RingProof = (cell: Cell, ring: readonly Cell[]) => boolean;

/** The rules with no whole-ring proof and nothing proven empty. */
export const NO_RING_PROOF = (): null => null;
const NONE: ReadonlySet<Cell> = new Set();
export const NOTHING_EMPTIED = (): ReadonlySet<Cell> => NONE;
/** The cap without a rule that bounds one cell: the whole hidden sum. */
export const WHOLE_SUM = (_cell: Cell, hidden: number): number => hidden;

/** `${typeId}#${n}`, the way every config message names a board. */
export function boardName(row: PlacementRow): string {
  return `${row.typeId}#${row.n}`;
}
