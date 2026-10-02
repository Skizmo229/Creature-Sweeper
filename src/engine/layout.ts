/**
 * Boards from drawings (docs/teaching-plan.md, section 5.2): a board stated as two pictures in
 * the catalogue's notation (docs/strategies.md), what is there and what the player sees, for the
 * school's lessons, the field guide's diagrams and the tests. `Game.fromLayout` builds the game;
 * this file reads the pictures, derives the config, and refuses a drawing that is not a board the
 * game could be showing.
 *
 * The config is derived so that the four facts hold by construction (docs/invariants.md): the
 * quantities are counted off the drawing, every threshold is `C_k` exactly, and the EXP in hand is
 * what the beaten creatures paid. So each level-up is "kill everything at or below", which is
 * also the easiest rule to narrate, and every creature still on the board pays in full.
 */

import type { BoardConfig, Cell } from './types.js';
import type { Placement } from './placement/registry.js';
import { Progression, expForTier } from './combat.js';
import { cumulativeExp } from './config.js';
import { type Grid, computeNumbers, makeCell, neighbours } from './grid.js';
import { placementRule } from './placement/registry.js';
import type { GameOptions } from './game.js';

/**
 * HP a drawn board gives when it does not say: the pool of the common ladders, which the
 * catalogue's damage table is read against.
 */
const DRAWN_HP = 10;

/** How a drawing is read into a board, beyond the drawing itself. */
export interface LayoutOptions extends GameOptions {
  /**
   * The player's level. Defaults to the level the beaten creatures' EXP buys, which is 1 on a
   * board with nothing beaten and a creature of tier 1; a drawing may start higher, never lower.
   */
  startLevel?: number;
  /**
   * Tiers on the board, at least the highest drawn. The catalogue's examples are five-tier boards
   * whatever they draw, and a tier drawn nowhere is one the counters show at 0.
   */
  tiers?: number;
  /** The board's HP pool. */
  hp?: number;
  /**
   * The placement rule the drawing is read by, for the rule's display and its proofs. The drawing
   * must be a board the rule could have dealt (`PlacementRule.fault`).
   */
  placement?: Placement;
  /** The config's `typeId`, for a caller that files the board somewhere. */
  typeId?: string;
  /** False for a board that offers no Sweep, as EASY does: a lesson, where it would do the work. */
  sweep?: boolean;
}

/** A drawing read: the board with every creature in place and nothing open, and what to show. */
export interface Drawing {
  readonly config: BoardConfig;
  readonly grid: Grid;
  /** Open ground and beaten creatures, in reading order. */
  readonly opened: readonly Cell[];
  /** Covered cells the player has marked, and the mark. */
  readonly marked: ReadonlyArray<readonly [Cell, number]>;
  /** EXP the beaten creatures paid. */
  readonly paid: number;
}

/** What `Game.fromLayout` changes on the board it builds. `Game` satisfies it. */
export interface DrawingHost {
  readonly remaining: number[];
  readonly progression: Progression;
  markOpen(cell: Cell): boolean;
  applyMark(cell: Cell, mark: number): void;
}

/** The tokens of each row. Whitespace separates them, so a number may run to two digits. */
function tokens(rows: readonly string[], which: string): string[][] {
  const grid = rows.map((row) => row.trim().split(/\s+/));
  const width = grid[0]?.length ?? 0;
  if (!grid.length || width === 0 || grid[0]![0] === '') {
    throw new Error(`the ${which} drawing is empty`);
  }
  grid.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`row ${y} of the ${which} drawing is ${row.length} wide, not ${width}`);
    }
  });
  return grid;
}

/** A whole number written as digits, or null. */
function whole(token: string): number | null {
  return /^\d+$/.test(token) ? Number(token) : null;
}

/** Lay the truth into a grid: holes, empty ground and creatures, numbered. */
function layTruth(truth: readonly string[][]): Grid {
  const grid = truth.map((row, y) =>
    row.map((token, x) => {
      const cell = makeCell(x, y);
      const tier = whole(token);
      if (token === '#') cell.present = false;
      else if (tier !== null && tier > 0) {
        cell.tier = tier;
        cell.alive = true;
      } else if (token !== '.') {
        throw new Error(`the truth at ${x},${y} is "${token}": a tier, "." or "#"`);
      }
      return cell;
    }),
  );
  computeNumbers(grid);
  return grid;
}

/** Read what the drawing shows on one cell, refusing what the truth under it makes impossible. */
function readShown(
  cell: Cell,
  token: string,
  tiers: number,
  opened: Cell[],
  marked: Array<readonly [Cell, number]>,
): void {
  const at = `${cell.x},${cell.y}`;
  if ((token === '#') !== !cell.present) {
    throw new Error(`${at} is a hole in one drawing and not in the other`);
  }
  if (token === '#' || token === '?') return;
  const mark = /^m(\d+)$/.exec(token);
  if (mark) {
    const tier = Number(mark[1]);
    if (tier < 1 || tier > tiers) throw new Error(`the mark at ${at} is not a tier 1 to ${tiers}`);
    marked.push([cell, tier]);
    return;
  }
  const beaten = /^k(\d+)$/.exec(token);
  if (beaten) {
    if (cell.tier !== Number(beaten[1])) {
      throw new Error(
        `the beaten creature at ${at} is a ${beaten[1]} but the truth is ${cell.tier}`,
      );
    }
    opened.push(cell);
    return;
  }
  const num = token === '.' ? 0 : whole(token);
  if (num === null) throw new Error(`${at} shows "${token}": ?, ., a number, kN or mN`);
  if (cell.tier > 0)
    throw new Error(`${at} shows open ground over a creature of tier ${cell.tier}`);
  if (cell.num !== num) {
    throw new Error(`${at} shows ${num}, but the creatures around it add up to ${cell.num}`);
  }
  opened.push(cell);
}

/**
 * Read a drawing. `truth` is the board as it is, a token per cell: `.` empty ground, a digit a
 * creature of that tier, `#` a hole. `shown` is the board as the player sees it: `?` covered,
 * `.` open ground showing 0, a number open ground showing it, `kN` a beaten creature of tier N,
 * `mN` a covered cell marked N. One string per row, tokens separated by whitespace.
 *
 * Refused, with a message naming the cell: grids of different sizes or ragged rows; a hole in
 * one and not the other; an open number the creatures around it do not add up to; open ground
 * over a creature, or a beaten creature of the wrong tier; an open 0 beside a covered cell, which
 * a cascade would have opened; nothing left alive; a level below what the beaten creatures'
 * EXP buys; and a layout the placement rule could not have dealt.
 */
export function readLayout(
  truth: readonly string[],
  shown: readonly string[],
  options: LayoutOptions = {},
): Drawing {
  const what = tokens(truth, 'truth');
  const seen = tokens(shown, 'shown');
  if (what.length !== seen.length || what[0]!.length !== seen[0]!.length) {
    throw new Error(
      `the truth is ${what[0]!.length}x${what.length} and the shown drawing ` +
        `${seen[0]!.length}x${seen.length}`,
    );
  }
  const grid = layTruth(what);
  const cells = grid.flat();

  const top = Math.max(0, ...cells.map((c) => c.tier));
  if (top === 0) throw new Error('the truth has no creature');
  const tiers = options.tiers ?? top;
  if (!Number.isInteger(tiers) || tiers < top) {
    throw new Error(`tiers is ${tiers}; the drawing needs at least ${top}`);
  }
  const quantity = new Array<number>(tiers).fill(0);
  for (const c of cells) if (c.tier > 0) quantity[c.tier - 1]!++;

  const opened: Cell[] = [];
  const marked: Array<readonly [Cell, number]> = [];
  for (const c of cells) readShown(c, seen[c.y]![c.x]!, tiers, opened, marked);
  const open = new Set(opened);
  // Opening any cell numbered 0 cascades through every neighbour (`Game.reveal`).
  for (const c of opened) {
    if (c.num === 0 && neighbours(grid, c.x, c.y).some((n) => !open.has(n))) {
      throw new Error(`the 0 at ${c.x},${c.y} would have opened the covered cells beside it`);
    }
  }
  const beaten = opened.filter((c) => c.tier > 0);
  if (!cells.some((c) => c.alive && !open.has(c))) {
    throw new Error('nothing is left alive, so the board is already won');
  }

  const exp = cumulativeExp(quantity).slice(0, tiers - 1);
  const paid = beaten.reduce((sum, c) => sum + expForTier(c.tier), 0);
  const bought = new Progression(1, exp);
  bought.award(paid);
  const startLevel = options.startLevel ?? bought.level;
  if (!Number.isInteger(startLevel) || startLevel < bought.level || startLevel > tiers) {
    throw new Error(
      `level ${startLevel} is not in ${bought.level}..${tiers}: ${paid} EXP buys level ` +
        `${bought.level} on this board, where each level costs every creature at or below it`,
    );
  }

  const placement = options.placement ?? 'uniform';
  const config: BoardConfig = {
    typeId: options.typeId ?? 'layout',
    board: 1,
    width: grid[0]!.length,
    height: grid.length,
    tiers,
    quantity,
    hp: options.hp ?? DRAWN_HP,
    startLevel,
    exp,
    search: false,
    // The drawing is the opening; nothing is dealt.
    opening: 'none',
    topology: 'square',
    wrap: 'none',
    // The silhouette is the drawing's own. A shape's rule is more than its silhouette (a dungeon
    // keeps its hallways clear), and a drawing has no way to be checked against one yet.
    shape: 'rect',
    shapeParam: 0,
    placement,
    givens: 0,
    reach: 0,
    spells: [],
    startMana: 0,
    ...(options.sweep === false ? { sweep: false } : {}),
  };
  const fault = placementRule(placement).fault(grid, config);
  if (fault) throw new Error(`the drawing breaks the ${placement} placement: ${fault}`);
  return { config, grid, opened, marked, paid };
}

/**
 * Show a drawing on the game built from it: open what is open, count the beaten creatures as
 * killed and pay their EXP, and write the marks through the counters. None of it is the player's
 * work in this game, so none of it banks a Sweep charge or exploration mana.
 */
export function showDrawing(host: DrawingHost, drawing: Drawing): void {
  for (const cell of drawing.opened) {
    host.markOpen(cell);
    if (cell.tier === 0) continue;
    cell.alive = false;
    host.remaining[cell.tier - 1]!--;
  }
  for (const [cell, mark] of drawing.marked) host.applyMark(cell, mark);
  // Never a level: `readLayout` refused a start below what this buys.
  host.progression.award(drawing.paid);
}
