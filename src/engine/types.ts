/** Core types for the rules engine. No rendering, no DOM, no I/O. */

import type { Placement } from './placement/registry.js';
import type { BoardShape } from './shape/registry.js';
import type { SpellId } from './spells.js';

/** 0 = empty ground; 1..tiers = a creature of that power level. */
export type Tier = number;

export interface Cell {
  readonly x: number;
  readonly y: number;
  /** 0 for empty ground, otherwise the creature's tier. */
  tier: Tier;
  /** Sum of the eight neighbours' tiers — NOT a count of creatures. */
  num: number;
  open: boolean;
  /** True while a creature here is undefeated. Always false for empty ground. */
  alive: boolean;
  /**
   * False for cells cut away by the board's shape. Absent cells are neighbours
   * of nothing and belong to no win condition — they are holes, not ground.
   */
  present: boolean;
  /** Player annotation, 0 = none. A mark above your level blocks clicks. */
  mark: number;
  /**
   * True when this cell's mark came from the board rather than the player — a
   * Sudoku given.
   *
   * It matters twice. A given is a FACT, so deductions resting on it are
   * proven rather than merely claimed, and they stand even when the player
   * turns mark-assistance off. And a given must not be erasable: re-marking
   * toggles a mark off, which would quietly destroy board information the
   * player cannot get back and turn a guess-free board into an unfair one.
   */
  given: boolean;
  /**
   * Pencil marks: a bitmask of the tiers this cell could still be, where bit
   * `t` means tier `t` is a candidate. Bit 0 is empty ground, which is a
   * candidate like any other.
   *
   * A mark is a claim about what a cell *is*; notes are a claim about what it
   * could be, and the two are mutually exclusive on a cell — committing one
   * clears the other, the way a pencilled Sudoku cell is erased when you write
   * the digit in.
   *
   * 0 means "no notes", NOT "nothing is possible". Every rule that reads this
   * has to check for the empty mask first, because an empty set would
   * otherwise claim a cell is impossible.
   *
   * Notes never feed the neighbour-sum arithmetic — you cannot subtract a set
   * from a number — and they never make a cell sweepable either. They mean
   * "the tiers I have not ruled out yet", which is the opposite of a claim
   * about what the cell is, so acting on them permissively would charge the
   * player for thinking out loud.
   *
   * They are read in exactly one direction: the SMALLEST candidate. If even
   * that is above your level then every possibility is, and the cell is
   * guarded. Notes can protect you; they never expose you. When the player is
   * sure, they commit the pencil to a mark.
   */
  notes: number;
  /**
   * Creatures among this cell's eight neighbours, once Census has counted
   * them. The number is their SUM, so sum plus count usually pins the layout.
   */
  census: number | null;
}

/**
 * The shape of the grid, and therefore how many neighbours a cell has.
 *
 * This is not cosmetic. A cell's number is the SUM of its neighbours, so six
 * neighbours instead of eight lowers every number, and a blank cell needs only
 * six empty neighbours instead of eight — which makes blank regions markedly
 * more common at the same density. A hex board therefore has to run denser to
 * play as tight as a square one.
 *
 * What does NOT change: the zero-damage guarantee, Sweep's proof and the
 * cascade rule are all statements about sums and levels, not about how many
 * neighbours there are.
 */
export type Topology = 'square' | 'hex';

/**
 * Which edges of the board join up.
 *
 * This is a difficulty lever disguised as a cosmetic one. Edges are
 * *information*: a corner cell has three neighbours and an edge cell five, and
 * those constrained cells are where a sweeper player gets their first
 * footholds. Wrapping deletes every one of them, so every cell has the full
 * neighbour count and the easy openings vanish.
 *
 * 'horizontal' is the gentle version — a cylinder, where top and bottom stay
 * real edges to anchor yourself against. 'both' is a torus with no edges at
 * all. Requires a board at least 3 cells across the wrapped axis, or a cell
 * could end up its own neighbour.
 */
export type Wrap = 'none' | 'horizontal' | 'both';

/**
 * Which cells of the bounding box actually exist.
 *
 * Cut-away cells are *absent*, not empty: they hold nothing, they are not
 * neighbours of anything, and they are not part of the win condition. That
 * matters because a cell's number is the sum of its neighbours, so removing
 * cells removes neighbours, which makes the survivors more constrained and
 * therefore easier to deduce. Every shape is easier than a rectangle for that
 * reason; wrapping, which removes edges instead, is the only variant that is
 * harder.
 *
 * Parameters are always in CELLS, never in fractions of the board. A ring
 * "20% of the width" thick is nine cells on a long side and four on a short
 * one — the same board playing two different games. The thickness IS the
 * gameplay, so it is the thing held constant.
 *
 * 'cave' and 'dungeon' are the two shapes that are not per-cell predicates:
 * they are seeded, so the same board index gives a different silhouette on
 * every seed. Their parameter is therefore the exact number of cells the mask
 * must leave — see `caveMask` in `shape/cave.ts` for why that exactness is not
 * optional. A dungeon splits what it builds into rooms, one-cell hallways and
 * the doorways between them, and only room floor ever holds a creature; see
 * `shape/dungeon.ts`. Each is a `ShapeRule` in `src/engine/shape/`, listed in
 * `registry.ts`.
 */
export type { BoardShape };

/** How a board hands the player their first move. */
export type OpeningRule =
  /** Reveal the zero-region whose cascade uncovers the most cells. Default. */
  | 'auto'
  /** Reveal nothing; the player clicks into a cold board with no protection. */
  | 'none'
  /**
   * Reveal every empty cell on the board.
   *
   * Only sane where empty ground is scarce and spread by a rule rather than by
   * chance — which is exactly the Sudoku placement, where tier 0 is one of the
   * nine digits and so appears exactly once per row, column and box. On an
   * ordinary board this would uncover most of it.
   *
   * It exists because the 'auto' rule cannot work at 100% density: a cascade
   * needs a zero cell whose neighbours are all empty too, and here every
   * empty cell is surrounded by creatures.
   */
  | 'empties';

export type { Placement };

export interface BoardConfig {
  /** Game type id, e.g. "normal". */
  readonly typeId: string;
  /** 1-based board index within that type's ladder. */
  readonly board: number;
  readonly width: number;
  readonly height: number;
  /** Number of creature tiers on this board. */
  readonly tiers: number;
  /** How many creatures of each tier; index 0 is tier 1. Length === tiers. */
  readonly quantity: readonly number[];
  readonly hp: number;
  /** Starting player level. 0 means you cannot win a fight (BLIND). */
  readonly startLevel: number;
  /** EXP needed to reach level k+1, at index k-1. Length === tiers - 1. */
  readonly exp: readonly number[];
  /** Win by opening every empty cell rather than by defeating every creature. */
  readonly search: boolean;
  readonly opening: OpeningRule;
  readonly topology: Topology;
  readonly wrap: Wrap;
  readonly shape: BoardShape;
  /**
   * Ring thickness for donut, arm width for cross, exact cell count for cave
   * and dungeon; unused otherwise. Always in cells.
   */
  readonly shapeParam: number;
  readonly placement: Placement;
  /**
   * Cells whose tier the player is told up front, as truthful marks.
   *
   * The Sudoku ladder's only real difficulty dial, since the rule fixes
   * density, tier count and distribution. Unused by 'uniform' placement.
   */
  readonly givens: number;
  /**
   * How far from already-revealed ground the player may act, in steps of
   * adjacency. 0 means anywhere on the board, which is every type but DUNGEON.
   *
   * Distance is counted through `neighbours()`, not across the grid, so it is
   * the distance you could WALK: it stops at a wall instead of reaching
   * through one, it follows a hex board's six directions, and it crosses a
   * wrapped seam. That is what makes it a dungeon crawl rather than a radius —
   * you extend your reach by opening ground, so the map unfolds from where you
   * already are.
   *
   * It governs opening a cell and casting a targeted spell on one. It
   * deliberately does NOT govern marking or pencilling: an annotation is
   * thinking, and a player should be free to reason about a room before they
   * can walk into it.
   */
  readonly reach: number;
  /** Spells this game type offers. Empty means no magic. */
  readonly spells: readonly SpellId[];
  /** Mana in hand at the start, so the opening moves are not spell-less. */
  readonly startMana: number;
  /**
   * WORKOUT's Exercise rules, or absent for the global price. See
   * `WorkoutRule`. Optional so every config built by hand stays unchanged.
   */
  readonly workout?: WorkoutRule;
  /**
   * False on a ladder that offers no Sweep at all — EASY, where the numbers are
   * learned by hand. Absent means Sweep is on offer, subject to the player's
   * dial. Optional so every config built by hand stays unchanged.
   */
  readonly sweep?: boolean;
}

/**
 * Exercise as WORKOUT plays it: cheap to start, dearer every cast, cheaper
 * again as you level, and a fight fought on a borrowed level pays extra EXP.
 *
 * All in mana except the multiplier. The price is `base + surcharge`, where
 * each cast adds `step` to the surcharge and each level gained takes `relief`
 * off it, never below zero. A new board is a new `Game`, so the surcharge
 * resets with the board, the same way mana does.
 */
export interface WorkoutRule {
  readonly base: number;
  readonly step: number;
  readonly relief: number;
  /** EXP multiplier for a creature killed on a borrowed level. */
  readonly expMultiplier: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export type GameEvent =
  /** Cells uncovered, including everything a cascade reached. */
  | { type: 'revealed'; cells: ReadonlyArray<{ x: number; y: number }> }
  /** A fight happened. `damage` is HP actually lost. */
  | { type: 'battle'; x: number; y: number; tier: Tier; damage: number; defeated: boolean }
  | { type: 'levelUp'; level: number }
  | { type: 'marked'; x: number; y: number; from: number; to: number }
  /** A cell's pencil marks changed. `from` and `to` are candidate bitmasks. */
  | { type: 'noted'; x: number; y: number; from: number; to: number }
  /** The action did nothing, and why. */
  | { type: 'blocked'; reason: BlockReason }
  | { type: 'won' }
  | { type: 'lost' }
  /** A spell resolved. `detail` is what it told you, if anything. */
  | { type: 'spell'; id: SpellId; x?: number; y?: number; detail?: string }
  /** Exercise lent levels to this fight, and what that spared you. */
  | { type: 'exercised'; levels: number; spared: number; bonusExp: number };

export type BlockReason =
  /** The cell is marked above your level — the guard that protects you. */
  | 'mark-guard'
  /** Every tier you pencilled in is above your level, so the fight is a
   * certain loss of HP. The same guard, read off a set instead of a value. */
  | 'note-guard'
  | 'already-open'
  | 'out-of-bounds'
  | 'game-over'
  /** Not enough mana, or this type does not offer that spell. */
  | 'no-mana'
  | 'no-such-spell'
  /** The spell had nothing to act on. */
  | 'no-effect'
  /** Sweep is switched off, or its charge is not banked yet. */
  | 'no-charge'
  /** The cell carries a board-dealt clue, which the player may not rub out. */
  | 'given'
  /**
   * A pencil candidate the placement rule has already refused for this cell —
   * an odd tier on a light CHECKERBOARD square, anything but empty ground or
   * the partner's tier beside a defeated PAIRS creature, empty ground on
   * SUDOKU. See `Game.noteCandidates`. Only ever refuses ADDING a note.
   */
  | 'ruled-out'
  /**
   * Too far from anything you have uncovered. Only boards with a `reach` can
   * produce this, and only for opening and targeted spells.
   */
  | 'out-of-reach';

export interface SweepOptions {
  /**
   * Subtract the player's marks from a cell's number when deciding what is
   * safe. Default true. A mark is a claim rather than a fact, so this trades
   * the proof for reach: a wrong mark can cost HP.
   *
   * Pencil marks are NOT consulted. A mark is an assertion and a note is an
   * open question, and only the first is something to act on.
   */
  useMarks?: boolean;
}
