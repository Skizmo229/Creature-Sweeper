/**
 * Turning the generated ladder data into board configs.
 *
 * `design/data/ladders.json` is written by `design/ladders.py` and is the
 * single source of truth for tuning. The engine reads it; it never duplicates
 * those numbers.
 */

import type { BoardConfig, BoardShape, OpeningRule, Placement, WorkoutRule } from './types.js';
import { RULES, isPlacement, placementRule } from './placement/registry.js';
import { SHAPES, isShape, shapeRule } from './shape/registry.js';
import { SPELLS, type SpellId, isSpellId, orderSpells } from './spells.js';

/** One board's row as `ladders.py` emits it. */
export interface LadderBoard {
  n: number;
  w: number;
  h: number;
  cells: number;
  monsters: number;
  density: number;
  tiers: number;
  quantity: number[];
  hp: number;
  lock: number;
  exp: number[];
  total_exp: number;
  empty: number;
  /** Sudoku only: how many cells arrive already identified. */
  givens?: number;
}

/** One game type's ladder as `ladders.py` emits it. */
export interface LadderType {
  id: string;
  name: string;
  tint: string;
  axis: string;
  blurb: string;
  archetype: string;
  search: boolean;
  postgame: boolean;
  /** Spell ids this type offers; absent or empty means no magic. */
  spells?: string[];
  start_mana?: number;
  /** WORKOUT's Exercise rules; absent means the global price table. */
  workout?: { base: number; step: number; relief: number; exp_multiplier: number };
  /** False on a ladder that offers no Sweep. Absent means it does. */
  sweep?: boolean;
  /** 'hex' gives cells six neighbours instead of eight. Defaults to square. */
  topology?: string;
  /** 'horizontal' joins left/right; 'both' makes a torus. */
  wrap?: string;
  /** A key of the shape registry (`src/engine/shape/registry.ts`). Absent is a rectangle. */
  shape?: string;
  shape_param?: number;
  /**
   * Steps of adjacency the player may act beyond already-revealed ground.
   * Absent or 0 means the whole board, which is every type but DUNGEON.
   */
  reach?: number;
  /** A key of the placement registry (`src/engine/placement/registry.ts`). Absent is uniform. */
  placement?: string;
  /**
   * The HP pool a Full Run gets for all ten boards, taken from board 1.
   *
   * A run ignores the per-board HP schedule entirely: one max, one pool,
   * carried from board to board. Board 1 is always the most generous entry in
   * every schedule, so this is never *below* what a later board was tuned for
   * — the run is harsh because HP carries, not because the ceiling moved.
   */
  run_hp: number;
  /**
   * Types whose board 10 must be cleared first — a readiness gate.
   *
   * More than one means all of them: HUGE x EXTREME is literally both of its
   * parents at once, so it should not be reachable without having played them.
   */
  requires: string[];
  /**
   * Boards cleared anywhere in the game, counting each board once. 0 means no
   * such gate.
   *
   * A different claim from `requires`: that one says "you are ready for this",
   * this one says "you have played enough to be offered something new". The
   * variant ladders use it because they do not teach each other — a hex grid
   * teaches nothing about a torus — so chaining them was a fiction that made a
   * player grind three shapes to reach a fourth they actually wanted.
   */
  requires_boards: number;
  /**
   * Full Runs completed, each on a different type. 0 means no such gate.
   *
   * The third claim: not readiness or time served but finishing something
   * without a restart, which is what BLIND asks of every board. Distinct types
   * so the same easy run three times does not count.
   */
  requires_runs: number;
  /** The tuned ladder: ten boards, and the thing "clearing a type" means. */
  boards: LadderBoard[];
  /**
   * Boards 11..N — the same schedules continued past the ladder and clamped.
   *
   * Deliberately NOT part of `boards`. Ten is what a Full Run plays, what
   * clearing a type requires and what the board grid shows; folding the
   * continuation into that list would silently change all three. Everything
   * that means "the ladder" reads `boards`, and only the scaling picker reads
   * past it.
   */
  extended: LadderBoard[];
}

export type Ladders = LadderType[];

export interface BoardOptions {
  opening?: OpeningRule;
  /**
   * Override the board's max HP.
   *
   * Exists for Full Run, which replaces the per-board schedule with a single
   * pool for the whole ladder. Nothing else should need it: a board's HP is
   * one of the numbers `ladders.py` tuned it against.
   */
  hp?: number;
}

/** Validate the loadout at the boundary so a typo cannot reach the engine. */
function readSpells(type: LadderType): SpellId[] {
  const raw = type.spells ?? [];
  const bad = raw.filter((id) => !isSpellId(id));
  if (bad.length) {
    throw new Error(
      `${type.id}: unknown spell(s) ${bad.join(', ')} ` +
        `(have: ${Object.keys(SPELLS).join(', ')})`,
    );
  }
  // Sorted by price here rather than wherever the ladder listed them, so a
  // loadout can never be offered in an order that disagrees with its costs.
  return orderSpells(raw.filter(isSpellId));
}

/**
 * WORKOUT's rules for Exercise, validated at the boundary.
 *
 * Refused unless the type actually offers Exercise, because a rule for a spell
 * nobody can cast would read as a mode and do nothing. The multiplier may not
 * be below 1: the gates are C_k, so a kill paying short of full EXP could
 * leave the top gate out of reach.
 */
function readWorkout(type: LadderType, spells: readonly string[]): WorkoutRule | undefined {
  const raw = type.workout;
  if (!raw) return undefined;
  if (!spells.includes('exercise')) {
    throw new Error(`${type.id}: a workout rule needs Exercise in the loadout`);
  }
  const { base, step, relief, exp_multiplier: expMultiplier } = raw;
  for (const [name, v] of [
    ['base', base],
    ['step', step],
    ['relief', relief],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`${type.id}: workout ${name} is ${v}; it must be a whole number of mana`);
    }
  }
  if (base < 1) throw new Error(`${type.id}: a free Exercise is not a price`);
  if (!Number.isInteger(expMultiplier) || expMultiplier < 1) {
    throw new Error(
      `${type.id}: workout exp_multiplier is ${expMultiplier}; below 1 a kill pays short ` +
        `of the EXP its C_k gate was built from`,
    );
  }
  return { base, step, relief, expMultiplier };
}

/** Wrapping needs at least 3 cells across the joined axis, or a cell would
 *  end up adjacent to itself. Caught here rather than producing a silent
 *  miscount deep in the number calculation. */
function readWrap(type: LadderType, row: LadderBoard): 'none' | 'horizontal' | 'both' {
  const raw = type.wrap ?? 'none';
  if (raw !== 'none' && raw !== 'horizontal' && raw !== 'both') {
    throw new Error(`${type.id}: unknown wrap "${raw}" (none | horizontal | both)`);
  }
  if (raw !== 'none' && row.w < 3) {
    throw new Error(`${type.id}#${row.n}: board is ${row.w} wide, too narrow to wrap`);
  }
  if (raw === 'both' && row.h < 3) {
    throw new Error(`${type.id}#${row.n}: board is ${row.h} tall, too short to wrap vertically`);
  }
  return raw;
}

/**
 * The crawl rule's radius, validated here so a typo cannot reach the engine.
 *
 * A reach of 1 is refused rather than clamped: at one step the only cells you
 * may ever open are the ones already touching your frontier, so the board
 * advances a single ring at a time and no deduction can be acted on until the
 * cascade happens to arrive next to it. It is not a hard mode, it is a
 * different game, and if one is ever wanted it should be chosen deliberately
 * rather than reached by decrementing a number.
 */
function readReach(type: LadderType): number {
  const raw = type.reach ?? 0;
  if (!Number.isInteger(raw) || raw < 0) {
    throw new Error(`${type.id}: reach is ${raw}; it must be a whole number of steps`);
  }
  if (raw === 1) throw new Error(`${type.id}: a reach of 1 opens only the frontier ring`);
  return raw;
}

/** The board's shape, refusing a type it cannot live on (each shape's `validate`). */
function readShape(type: LadderType): BoardShape {
  const raw = type.shape ?? 'rect';
  if (!isShape(raw)) {
    throw new Error(`${type.id}: unknown shape "${raw}" (${Object.keys(SHAPES).join(' | ')})`);
  }
  shapeRule(raw).validate({ typeId: type.id, topology: type.topology, wrap: type.wrap });
  return raw;
}

/**
 * The board's placement, refusing a row its rule could not honour (each rule's `validate`).
 * Topology, wrap and shape are passed as the ladder spells them, so a rule's message names what
 * the data said.
 */
function readPlacement(type: LadderType, row: LadderBoard): Placement {
  const raw = type.placement ?? 'uniform';
  if (!isPlacement(raw)) {
    throw new Error(`${type.id}: unknown placement "${raw}" (${Object.keys(RULES).join(' | ')})`);
  }
  placementRule(raw).validate({
    typeId: type.id,
    n: row.n,
    width: row.w,
    height: row.h,
    tiers: row.tiers,
    quantity: row.quantity,
    cells: row.cells,
    monsters: row.monsters,
    givens: row.givens,
    topology: type.topology,
    wrap: type.wrap,
    shape: type.shape,
  });
  return raw;
}

/** Highest board index this type offers, continuation included. */
export function maxBoard(ladders: Ladders, typeId: string): number {
  const type = findType(ladders, typeId);
  return type.boards.length + type.extended.length;
}

/** True for a board past the tuned ladder — one the scaling picker reaches. */
export function isExtendedBoard(ladders: Ladders, typeId: string, board: number): boolean {
  return board > findType(ladders, typeId).boards.length;
}

/** The row for a board index, from the ladder or from its continuation. */
export function boardRow(ladders: Ladders, typeId: string, board: number): LadderBoard | undefined {
  const type = findType(ladders, typeId);
  return board <= type.boards.length
    ? type.boards[board - 1]
    : type.extended[board - type.boards.length - 1];
}

export function findType(ladders: Ladders, typeId: string): LadderType {
  const type = ladders.find((t) => t.id === typeId);
  if (!type) {
    throw new Error(`unknown game type "${typeId}" (have: ${ladders.map((t) => t.id).join(', ')})`);
  }
  return type;
}

/** Build a board config for a 1-based board index on a game type's ladder. */
export function boardConfig(
  ladders: Ladders,
  typeId: string,
  board: number,
  options: BoardOptions = {},
): BoardConfig {
  const type = findType(ladders, typeId);
  const row = boardRow(ladders, typeId, board);
  if (!row) {
    throw new Error(
      `${typeId} has no board ${board} ` +
        `(ladder 1..${type.boards.length}` +
        (type.extended.length ? `, scaling to ${maxBoard(ladders, typeId)})` : ')'),
    );
  }

  // Search modes put the player at level 0, where no fight can be won.
  const startLevel = type.search ? 0 : 1;
  const shape = readShape(type);
  const placement = readPlacement(type, row);
  const spells = readSpells(type);
  const workout = readWorkout(type, spells);

  return {
    typeId: type.id,
    board: row.n,
    width: row.w,
    height: row.h,
    tiers: row.tiers,
    quantity: row.quantity,
    hp: options.hp ?? row.hp,
    startLevel,
    exp: row.exp,
    search: type.search,
    placement,
    givens: row.givens ?? 0,
    opening: options.opening ?? placementRule(placement).opening,
    reach: readReach(type),
    spells,
    startMana: type.start_mana ?? 0,
    ...(workout ? { workout } : {}),
    ...(type.sweep === false ? { sweep: false } : {}),
    topology: type.topology === 'hex' ? 'hex' : 'square',
    wrap: readWrap(type, row),
    shape: shape,
    // A seeded shape's parameter is the cell count the mask must land on, and
    // it differs per board, so it is read from the board's own row. That row is
    // the same `cells` figure `ladders.py` apportioned the creatures against,
    // which is what keeps C_k and the thresholds true on every seed.
    shapeParam: shapeRule(shape).seeded ? row.cells : (type.shape_param ?? 0),
  };
}

/**
 * C_k — the total EXP available from every creature of tier <= k.
 *
 * The tuning identity the whole progression rests on: the top `lock`
 * thresholds equal C_k exactly, making each of those level-ups a full-tier
 * clear. Everything below is at most C_k, which is what guarantees a
 * zero-damage clear is always possible.
 */
export function cumulativeExp(quantity: readonly number[]): number[] {
  const out: number[] = [];
  let running = 0;
  for (let i = 0; i < quantity.length; i++) {
    running += quantity[i]! * 2 ** i;
    out.push(running);
  }
  return out;
}
