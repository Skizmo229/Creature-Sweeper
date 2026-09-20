/**
 * Turning the generated ladder data into board configs.
 *
 * `design/data/ladders.json` is written by `design/ladders.py` and is the
 * single source of truth for tuning. The engine reads it; it never duplicates
 * those numbers.
 */

import type { BoardConfig, OpeningRule, Placement } from './types.js';
import { sideTotals } from './checker.js';
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
  /** 'hex' gives cells six neighbours instead of eight. Defaults to square. */
  topology?: string;
  /** 'horizontal' joins left/right; 'both' makes a torus. */
  wrap?: string;
  /** 'donut' | 'cross' | 'diamond' | 'cave' | 'dungeon'; absent is a rectangle. */
  shape?: string;
  shape_param?: number;
  /**
   * Steps of adjacency the player may act beyond already-revealed ground.
   * Absent or 0 means the whole board, which is every type but DUNGEON.
   */
  reach?: number;
  /**
   * 'sudoku' constrains tiers to a Sudoku solution; 'checker' sends even
   * tiers to the light squares and odd ones to the dark. Absent is uniform.
   */
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

const SHAPES = ['rect', 'donut', 'cross', 'diamond', 'cave', 'dungeon'] as const;

/** The shapes whose mask is seeded rather than a per-cell predicate. */
const CARVED = ['cave', 'dungeon'] as const;

/**
 * A carved mask carries two constraints the fixed shapes do not. It is laid
 * out and checked with square adjacency, so on a hex board its "connected"
 * region could be in pieces under the six-way rule; and it always leaves a
 * margin of absent cells around the bounding box, so joining those edges would
 * join two holes. Both would be silent, so both are refused here rather than
 * discovered on a board the player cannot finish.
 */
function readShape(type: LadderType): (typeof SHAPES)[number] {
  const raw = type.shape ?? 'rect';
  const found = SHAPES.find((s) => s === raw);
  if (!found) throw new Error(`${type.id}: unknown shape "${raw}" (${SHAPES.join(' | ')})`);
  if ((CARVED as readonly string[]).includes(found)) {
    if (type.topology === 'hex') {
      throw new Error(`${type.id}: ${found} is carved with eight-way adjacency, not hex`);
    }
    if (type.wrap && type.wrap !== 'none') {
      throw new Error(`${type.id}: ${found} leaves an absent margin, so wrapping joins nothing`);
    }
  }
  return found;
}

/**
 * The checkerboard rule's structural requirements.
 *
 * Same argument as the Sudoku block below and the cave's cell count: none of
 * these would throw on a board, they would just quietly produce a different
 * mode from the one that was tuned, and a player cannot tell which one they
 * are on.
 *
 * Two colours, so a hex grid is out on arithmetic rather than on taste — a
 * hexagonal tiling cannot be two-coloured at all, so there is no rule to
 * apply. A carved or cut-out shape is out because the colour split of a mask
 * is not the colour split of its bounding box: the mode promises the two sides
 * hold the same number of enemies, and on a shape that promise would depend on
 * the silhouette, which for a cave depends on the seed.
 *
 * An even cell count is what makes the two colours exactly equal, so the
 * balance below is a statement about the creatures alone and never about
 * having one more square to put them on.
 *
 * And a wrapped axis must be even in cells, or the seam joins two squares of
 * the same colour and the colouring stops being a colouring. No ladder wraps
 * one today; the condition is cheap to state and silent to get wrong.
 */
function readChecker(type: LadderType, row: LadderBoard): 'checker' {
  const where = `${type.id}#${row.n}`;
  if (type.topology === 'hex') {
    throw new Error(`${type.id}: a hex tiling has no two-colouring, so there is no checkerboard`);
  }
  if (type.shape && type.shape !== 'rect') {
    throw new Error(
      `${type.id}: the checkerboard needs a rectangle — a "${type.shape}" mask splits ` +
      `between the colours by its silhouette, and the mode promises an even split`,
    );
  }
  if ((row.w * row.h) % 2 !== 0) {
    throw new Error(
      `${where}: ${row.w}x${row.h} is an odd number of cells, so one colour has ` +
      `a square more than the other`,
    );
  }
  const wrap = type.wrap ?? 'none';
  if (wrap !== 'none' && row.w % 2 !== 0) {
    throw new Error(`${where}: joining left to right across an odd width meets two light squares`);
  }
  if (wrap === 'both' && row.h % 2 !== 0) {
    throw new Error(`${where}: joining top to bottom across an odd height meets two light squares`);
  }

  // The balance promise, checked rather than assumed. `ladders.py` apportions
  // each parity its own half of the creature budget to hit this; a ladder that
  // stopped doing so would still generate, and would still be tuned correctly,
  // but it would no longer be the mode.
  const { light, dark } = sideTotals(row.quantity);
  if (Math.abs(light - dark) > 1) {
    throw new Error(
      `${where}: ${dark} odd-tier creatures against ${light} even-tier ones. ` +
      `The colours must carry within one of each other`,
    );
  }
  const half = (row.w * row.h) / 2;
  if (dark > half || light > half) {
    throw new Error(
      `${where}: ${Math.max(light, dark)} creatures of one parity want ` +
      `${half} squares of that colour`,
    );
  }
  return 'checker';
}

/**
 * Sudoku placement carries hard structural requirements, because the rule is
 * what fixes the quantities and therefore C_k. A board that failed any of
 * these would not throw during generation — it would just be tuned against
 * numbers its own layout cannot produce, and the top gate would sit one kill
 * out of reach. Same argument as the cave's cell count.
 */
function readPlacement(type: LadderType, row: LadderBoard): Placement {
  const raw = type.placement ?? 'uniform';
  if (raw !== 'uniform' && raw !== 'sudoku' && raw !== 'checker') {
    throw new Error(`${type.id}: unknown placement "${raw}" (uniform | sudoku | checker)`);
  }
  if (raw === 'checker') return readChecker(type, row);
  if (raw !== 'sudoku') return raw;

  if (row.w !== 9 || row.h !== 9) {
    throw new Error(`${type.id}#${row.n}: sudoku needs a 9x9 board, got ${row.w}x${row.h}`);
  }
  if (row.tiers !== 8) {
    throw new Error(
      `${type.id}#${row.n}: sudoku uses the nine digits 0-8, so 8 creature ` +
      `tiers plus empty ground — got ${row.tiers}`,
    );
  }
  if (row.quantity.length !== 8 || row.quantity.some((n) => n !== 9)) {
    throw new Error(
      `${type.id}#${row.n}: sudoku places each tier exactly nine times; ` +
      `quantity is [${row.quantity.join(',')}]`,
    );
  }
  if (type.topology === 'hex' || (type.wrap && type.wrap !== 'none') ||
      (type.shape && type.shape !== 'rect')) {
    throw new Error(`${type.id}: sudoku's rows, columns and boxes need a plain square 9x9`);
  }
  const givens = row.givens ?? 0;
  if (givens < 1 || givens > 72) {
    throw new Error(
      `${type.id}#${row.n}: givens is ${givens}; it must be between 1 and 72 ` +
      `(the creatures — a given on empty ground says nothing, since the opening reveals it)`,
    );
  }
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
export function boardRow(
  ladders: Ladders, typeId: string, board: number,
): LadderBoard | undefined {
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
    // The Sudoku opening is its nine empty cells. The cascade rule cannot
    // produce it: a cascade needs a zero cell with no creature neighbours, and
    // at 100% density there is no such cell, so 'auto' would silently fall
    // through to the single-cell fallback.
    opening: options.opening ?? (placement === 'sudoku' ? 'empties' : 'auto'),
    reach: readReach(type),
    spells: readSpells(type),
    startMana: type.start_mana ?? 0,
    topology: type.topology === 'hex' ? 'hex' : 'square',
    wrap: readWrap(type, row),
    shape: shape,
    // A carved shape's parameter is the cell count the mask must land on, and
    // it differs per board, so it is read from the board's own row. That row is
    // the same `cells` figure `ladders.py` apportioned the creatures against,
    // which is what keeps C_k and the thresholds true on every seed.
    shapeParam: (CARVED as readonly string[]).includes(shape)
      ? row.cells
      : type.shape_param ?? 0,
  };
}

/**
 * The HP pool a Full Run of this type is given, for all ten boards at once.
 *
 * Read through here rather than off the row, because it is deliberately NOT a
 * per-board number — see `run.ts`.
 */
export function fullRunHp(ladders: Ladders, typeId: string): number {
  return findType(ladders, typeId).run_hp;
}

/**
 * Every board of every type.
 *
 * `scaling` includes the continuation past board 10. It defaults to true
 * because those boards are as real as the tuned ten — they are generated by
 * the same code and have to satisfy the same invariants — and a sweep that
 * skipped them would be checking the part that was already checked.
 */
export function allBoards(
  ladders: Ladders,
  options: BoardOptions & { scaling?: boolean } = {},
): BoardConfig[] {
  const { scaling = true, ...boardOptions } = options;
  return ladders.flatMap((type) =>
    [...type.boards, ...(scaling ? type.extended : [])]
      .map((row) => boardConfig(ladders, type.id, row.n, boardOptions)),
  );
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
