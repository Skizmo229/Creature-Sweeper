/**
 * Turning the generated ladder data into board configs.
 *
 * `design/data/ladders.json` is written by `design/ladders.py` and is the
 * single source of truth for tuning. The engine reads it; it never duplicates
 * those numbers.
 */

import type { BoardConfig, OpeningRule, Placement, WorkoutRule } from './types.js';
import { sideTotals } from './checker.js';
import { PAIR_MAX_DENSITY } from './pairs.js';
import { setsIn } from './dominoes.js';
import { PACK_MAX_DENSITY, packsIn } from './packs.js';
import { CONGO_MAX_DENSITY } from './congo.js';
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
 * The pairing rule's structural requirements.
 *
 * Same argument as the checkerboard block above and the cave's cell count:
 * neither of these would throw on a board, they would quietly produce a
 * different mode from the one that was tuned, and a player cannot tell which
 * one they are on.
 *
 * An EVEN total, because every creature has exactly one partner and an odd one
 * has nobody. This is the only constraint pairing puts on `quantity`, and it
 * is a much lighter one than the checkerboard's — pairing ignores tiers, so a
 * tier 2 may partner a tier 7 and the distribution is left entirely alone.
 * `ladders.py` rounds its quota down to even to meet it.
 *
 * And a density the packing can actually reach. Dominoes that may not touch
 * jam well below a board's capacity, and the quota has to be hit EXACTLY
 * because C_k assumed it — so a schedule that asked for too many would not
 * produce a hard board, it would produce a board that fails to generate on
 * some seeds and is mistuned on the rest. Refused here, with the arithmetic in
 * the message, rather than deep inside a lay-down that ran out of room.
 */
function readPairs(type: LadderType, row: LadderBoard): 'pairs' {
  const where = `${type.id}#${row.n}`;
  const total = row.quantity.reduce((a, b) => a + b, 0);
  if (total % 2 !== 0) {
    throw new Error(
      `${where}: ${total} creatures cannot pair up — every creature has ` +
        `exactly one partner, so the total must be even`,
    );
  }
  // Against the cells a creature may actually stand on, which on a shaped
  // board is fewer than the bounding box and on a dungeon fewer again.
  const share = total / row.cells;
  if (share > PAIR_MAX_DENSITY) {
    throw new Error(
      `${where}: ${total} creatures on ${row.cells} cells is ` +
        `${(100 * share).toFixed(1)}%, past the ${(100 * PAIR_MAX_DENSITY).toFixed(0)}% ` +
        `a non-touching domino packing can be laid down reliably`,
    );
  }
  return 'pairs';
}

/**
 * The domino rule's structural requirements.
 *
 * Everything PAIRS requires, because a domino board IS a pairing board — the
 * even total and the packing ceiling are checked by `readPairs` itself rather
 * than restated here, so the two cannot drift. What this adds is the set.
 *
 * `quantity` must be exactly a whole number of double-T sets: flat, at T+1 of
 * each tier per set. Same argument as the Sudoku block below and the
 * checkerboard's balance: a board whose quantity were merely CLOSE to a set
 * would still generate and still be tuned correctly — and would not be the
 * mode, because the dealer could not lay a full set onto it. It is refused
 * here, with the arithmetic, rather than on the first seed that tries.
 */
function readDominoes(type: LadderType, row: LadderBoard): 'dominoes' {
  const where = `${type.id}#${row.n}`;
  if (setsIn(row.tiers, row.quantity) === null) {
    const per = row.tiers + 1;
    throw new Error(
      `${where}: quantity [${row.quantity.join(',')}] is not a whole number of ` +
        `double-${row.tiers} domino sets — a set is ${per} of every tier, so the ` +
        `quantity has to be flat and a multiple of ${per}`,
    );
  }
  readPairs(type, row);
  return 'dominoes';
}

/**
 * The pack rule's structural requirements, for the same reason as the domino
 * set's: a quantity merely CLOSE to whole packs would still be tuned correctly
 * and still generate — and would not be the mode, because the dealer could not
 * put one of every tier into every pack.
 *
 * `quantity` must be flat, n of every tier for n packs. And the density must be
 * one the packing can reach, because the quota has to be landed exactly.
 */
function readPacks(type: LadderType, row: LadderBoard): 'packs' {
  const where = `${type.id}#${row.n}`;
  if (packsIn(row.tiers, row.quantity) === null) {
    throw new Error(
      `${where}: quantity [${row.quantity.join(',')}] is not a whole number of packs — ` +
        `a pack is one of each of the ${row.tiers} tiers, so the quantity has to be flat`,
    );
  }
  const share = row.monsters / row.cells;
  if (share > PACK_MAX_DENSITY) {
    throw new Error(
      `${where}: ${row.monsters} creatures on ${row.cells} cells is ` +
        `${(100 * share).toFixed(1)}%, past the ${(100 * PACK_MAX_DENSITY).toFixed(0)}% ` +
        `non-touching packs can be laid down reliably`,
    );
  }
  return 'packs';
}

/**
 * The congo rule's requirements: PACKS's, plus a plain square board. A line is
 * defined by ORTHOGONAL steps, which hex does not have, and a wrapped seam
 * would let a line step off one edge and on at the other — legal to
 * `neighbours()`, invisible as a line on screen, and a case the "no 2x2" proof
 * would have to be re-argued for. Refused rather than half-supported.
 */
function readCongo(type: LadderType, row: LadderBoard): 'congo' {
  const where = `${type.id}#${row.n}`;
  if (type.topology === 'hex' || (type.wrap && type.wrap !== 'none')) {
    throw new Error(
      `${where}: congo lines step orthogonally, so they need an unwrapped square board`,
    );
  }
  if (packsIn(row.tiers, row.quantity) === null) {
    throw new Error(
      `${where}: quantity [${row.quantity.join(',')}] is not a whole number of lines — ` +
        `a line is one of each of the ${row.tiers} tiers, so the quantity has to be flat`,
    );
  }
  const share = row.monsters / row.cells;
  if (share > CONGO_MAX_DENSITY) {
    throw new Error(
      `${where}: ${row.monsters} creatures on ${row.cells} cells is ` +
        `${(100 * share).toFixed(1)}%, past the ${(100 * CONGO_MAX_DENSITY).toFixed(0)}% ` +
        `non-touching lines can be laid down reliably`,
    );
  }
  return 'congo';
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
  if (
    raw !== 'uniform' &&
    raw !== 'sudoku' &&
    raw !== 'checker' &&
    raw !== 'pairs' &&
    raw !== 'dominoes' &&
    raw !== 'packs' &&
    raw !== 'congo'
  ) {
    throw new Error(
      `${type.id}: unknown placement "${raw}" ` +
        `(uniform | sudoku | checker | pairs | dominoes | packs | congo)`,
    );
  }
  if (raw === 'checker') return readChecker(type, row);
  if (raw === 'pairs') return readPairs(type, row);
  if (raw === 'dominoes') return readDominoes(type, row);
  if (raw === 'packs') return readPacks(type, row);
  if (raw === 'congo') return readCongo(type, row);
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
  if (
    type.topology === 'hex' ||
    (type.wrap && type.wrap !== 'none') ||
    (type.shape && type.shape !== 'rect')
  ) {
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
    // The Sudoku opening is its nine empty cells. The cascade rule cannot
    // produce it: a cascade needs a zero cell with no creature neighbours, and
    // at 100% density there is no such cell, so 'auto' would silently fall
    // through to the single-cell fallback.
    opening: options.opening ?? (placement === 'sudoku' ? 'empties' : 'auto'),
    reach: readReach(type),
    spells,
    startMana: type.start_mana ?? 0,
    ...(workout ? { workout } : {}),
    ...(type.sweep === false ? { sweep: false } : {}),
    topology: type.topology === 'hex' ? 'hex' : 'square',
    wrap: readWrap(type, row),
    shape: shape,
    // A carved shape's parameter is the cell count the mask must land on, and
    // it differs per board, so it is read from the board's own row. That row is
    // the same `cells` figure `ladders.py` apportioned the creatures against,
    // which is what keeps C_k and the thresholds true on every seed.
    shapeParam: (CARVED as readonly string[]).includes(shape) ? row.cells : (type.shape_param ?? 0),
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
