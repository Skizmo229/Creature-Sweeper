/**
 * Sudoku-ruled board generation.
 *
 * A 9x9 board whose tiers are a Sudoku solution over the digits 0-8, so each
 * of the nine tiers appears exactly once in every row, column and 3x3 box.
 *
 * Tier 0 is empty ground, and it is a digit like any other. That is the whole
 * reason the digits run 0-8 rather than 1-9: it puts exactly one empty cell in
 * every row, column and box, and those nine cells are the opening. They are
 * safe by definition, they show their numbers, and they grant no EXP, so
 * nothing is invented and `C_k` is untouched.
 *
 * With 1-9 there is no empty ground at all, so anything the board pre-reveals
 * is a pre-KILLED creature — and a removed creature must still pay its full
 * EXP or the `C_k` gates become unreachable. Thirty random pre-kills grant
 * about 1,700 EXP, past C_7, which would hand the player level 8 before their
 * first click. 0-8 removes that problem rather than managing it.
 *
 * The quantities are fixed by the rule — nine of each tier — so `C_k` is
 * identical on every board of the ladder and density, tier count and
 * distribution are not available as difficulty dials. What is left is the
 * number of GIVENS: cells whose tier the player is told up front.
 */

import type { Rng } from '../rng.js';
import { expForTier } from '../combat.js';
import {
  type Deal,
  NOTHING_EMPTIED,
  NO_RING_PROOF,
  type PlacementRow,
  type PlacementRule,
  WHOLE_SUM,
  boardName,
} from './rule.js';

export const SUDOKU_SIZE = 9;
export const SUDOKU_BOX = 3;
const DIGITS = SUDOKU_SIZE;
const ALL = (1 << DIGITS) - 1;

/** A solution grid, indexed [y][x], holding tiers 0..8. */
export type SudokuGrid = number[][];

function idx(x: number, y: number): number {
  return y * SUDOKU_SIZE + x;
}

/** The 27 units — nine rows, nine columns, nine boxes. */
const SUDOKU_UNITS: ReadonlyArray<ReadonlyArray<number>> = (() => {
  const units: number[][] = [];
  for (let i = 0; i < SUDOKU_SIZE; i++) {
    units.push(Array.from({ length: SUDOKU_SIZE }, (_, k) => idx(k, i)));
    units.push(Array.from({ length: SUDOKU_SIZE }, (_, k) => idx(i, k)));
  }
  for (let by = 0; by < SUDOKU_SIZE; by += SUDOKU_BOX) {
    for (let bx = 0; bx < SUDOKU_SIZE; bx += SUDOKU_BOX) {
      const unit: number[] = [];
      for (let dy = 0; dy < SUDOKU_BOX; dy++) {
        for (let dx = 0; dx < SUDOKU_BOX; dx++) unit.push(idx(bx + dx, by + dy));
      }
      units.push(unit);
    }
  }
  return units;
})();

/** Every cell sharing a row, column or box with this one. */
const SUDOKU_PEERS: ReadonlyArray<ReadonlyArray<number>> = (() => {
  const peers: Set<number>[] = Array.from({ length: 81 }, () => new Set<number>());
  for (const unit of SUDOKU_UNITS) {
    for (const a of unit) for (const b of unit) if (a !== b) peers[a]!.add(b);
  }
  return peers.map((s) => [...s]);
})();

/** The eight-way neighbours used for the board's numbers. Edges are real. */
const SUDOKU_NBRS: ReadonlyArray<ReadonlyArray<number>> = (() => {
  const out: number[][] = [];
  for (let y = 0; y < SUDOKU_SIZE; y++) {
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      const n: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const a = x + dx;
          const b = y + dy;
          if (a >= 0 && a < SUDOKU_SIZE && b >= 0 && b < SUDOKU_SIZE) n.push(idx(a, b));
        }
      }
      out.push(n);
    }
  }
  return out;
})();

function bit(digit: number): number {
  return 1 << digit;
}

function lowestBit(mask: number): number {
  for (let d = 0; mask >>> d; d++) if (mask & bit(d)) return d;
  return -1;
}

function highestBit(mask: number): number {
  let hi = -1;
  for (let d = 0; mask >>> d; d++) if (mask & bit(d)) hi = d;
  return hi;
}

function popCount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m >>>= 1) n += m & 1;
  return n;
}

/**
 * A random full solution, by randomised backtracking.
 *
 * Shuffling a canonical grid would be cheaper, but it only ever reaches the
 * relabel-and-permute orbit of one grid. Backtracking reaches the whole space,
 * which matters because the generator then rejects most of what it makes — a
 * restricted source would bias what survives.
 */
export function sudokuSolution(rng: Rng): SudokuGrid {
  const cells = new Int32Array(81).fill(-1);
  const used: number[] = new Array(81).fill(0);

  const order: number[][] = [];
  for (let i = 0; i < 81; i++) {
    const digits = Array.from({ length: DIGITS }, (_, d) => d);
    for (let k = digits.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [digits[k], digits[j]] = [digits[j]!, digits[k]!];
    }
    order.push(digits);
  }

  const solve = (at: number): boolean => {
    if (at === 81) return true;
    for (const d of order[at]!) {
      let clash = false;
      for (const p of SUDOKU_PEERS[at]!) {
        if (cells[p] === d) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      cells[at] = d;
      if (solve(at + 1)) return true;
      cells[at] = -1;
    }
    return false;
  };

  if (!solve(0)) throw new Error('sudoku: no solution from an empty grid, which cannot happen');
  void used;

  const grid: SudokuGrid = [];
  for (let y = 0; y < SUDOKU_SIZE; y++) {
    const row: number[] = [];
    for (let x = 0; x < SUDOKU_SIZE; x++) row.push(cells[idx(x, y)]!);
    grid.push(row);
  }
  return grid;
}

/** The eight-way neighbour sum of every cell — the board's numbers. */
function numbersOf(grid: SudokuGrid): number[] {
  const flat: number[] = [];
  for (let y = 0; y < SUDOKU_SIZE; y++)
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      flat.push(grid[y]![x]!);
    }
  return flat.map((_, i) => SUDOKU_NBRS[i]!.reduce((a, n) => a + flat[n]!, 0));
}

/**
 * Propagate both deduction channels to a fixpoint.
 *
 * SUDOKU  — a solved cell removes its digit from its peers, and a digit with
 *           one home left in a unit takes it.
 * SUM     — an OPEN cell's number is the sum of its neighbours' tiers, so a
 *           candidate survives only if the others can still make up the rest.
 *           This is bounds propagation, the same relaxation Sweep's own proof
 *           uses: it ignores Sudoku interaction between those neighbours, so
 *           it under-deduces rather than over-deduces, which is the safe
 *           direction for a generator.
 *
 * Returns false on a contradiction, which a generator treats as "reject".
 */
function propagate(cand: number[], open: boolean[], nums: number[]): boolean {
  let changed = true;
  while (changed) {
    changed = false;

    for (let i = 0; i < 81; i++) {
      if (popCount(cand[i]!) !== 1) continue;
      const d = lowestBit(cand[i]!);
      for (const p of SUDOKU_PEERS[i]!) {
        if (cand[p]! & bit(d)) {
          cand[p] = cand[p]! & ~bit(d);
          if (!cand[p]) return false;
          changed = true;
        }
      }
    }

    for (const unit of SUDOKU_UNITS) {
      for (let d = 0; d < DIGITS; d++) {
        let home = -1;
        let count = 0;
        for (const c of unit) {
          if (cand[c]! & bit(d)) {
            home = c;
            count++;
          }
        }
        if (count === 0) return false;
        if (count === 1 && popCount(cand[home]!) > 1) {
          cand[home] = bit(d);
          changed = true;
        }
      }
    }

    for (let i = 0; i < 81; i++) {
      if (!open[i]) continue;
      const ns = SUDOKU_NBRS[i]!;
      let lo = 0;
      let hi = 0;
      for (const n of ns) {
        lo += lowestBit(cand[n]!);
        hi += highestBit(cand[n]!);
      }
      const target = nums[i]!;
      if (target < lo || target > hi) return false;
      for (const n of ns) {
        const othersLo = lo - lowestBit(cand[n]!);
        const othersHi = hi - highestBit(cand[n]!);
        let keep = 0;
        for (let d = 0; d < DIGITS; d++) {
          if (!(cand[n]! & bit(d))) continue;
          const rest = target - d;
          if (rest >= othersLo && rest <= othersHi) keep |= bit(d);
        }
        if (!keep) return false;
        if (keep !== cand[n]) {
          cand[n] = keep;
          changed = true;
        }
      }
    }
  }
  return true;
}

/**
 * Can an honest player clear this board without ever being forced to guess?
 *
 * Plays it the way a player must: deduce, open everything now provably at or
 * below your level, bank the EXP, level up, deduce again. The two channels
 * feed each other — you cannot read a number until you have killed the cell
 * that shows it, and you cannot kill it until you have proved it weak enough.
 * The question is whether that loop ignites from the givens and the nine
 * empties, and then runs all the way to 81.
 *
 * A false here is the generator's reject signal, not a statement that the
 * board is unsolvable by a cleverer player: the propagator does singles and
 * bounds only, so it is a floor. Boards it clears are certainly fair; boards
 * it fails may merely be harder than it is.
 */
export function clearableWithoutGuessing(
  grid: SudokuGrid,
  givens: ReadonlyArray<number>,
  thresholds: ReadonlyArray<number>,
  startLevel = 1,
): boolean {
  const flat: number[] = [];
  for (let y = 0; y < SUDOKU_SIZE; y++)
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      flat.push(grid[y]![x]!);
    }
  const nums = numbersOf(grid);
  const cand: number[] = new Array(81).fill(ALL);
  const open: boolean[] = new Array(81).fill(false);

  for (const g of givens) cand[g] = bit(flat[g]!);
  // The opening: every empty cell, free and by construction.
  let openCount = 0;
  for (let i = 0; i < 81; i++) {
    if (flat[i] === 0) {
      open[i] = true;
      cand[i] = bit(0);
      openCount++;
    }
  }

  let level = startLevel;
  let exp = 0;
  const levelUp = (): void => {
    while (level - startLevel < thresholds.length && exp >= thresholds[level - startLevel]!) {
      level++;
    }
  };

  for (;;) {
    if (!propagate(cand, open, nums)) return false;

    let progressed = false;
    for (let i = 0; i < 81; i++) {
      if (open[i]) continue;
      // Every tier still possible here is at or below your level, so the fight
      // is free whichever it turns out to be. That is Sweep's own bound, read
      // off a candidate set instead of off a number.
      if (highestBit(cand[i]!) > level) continue;
      open[i] = true;
      openCount++;
      cand[i] = bit(flat[i]!);
      if (flat[i]! > 0) exp += expForTier(flat[i]!);
      progressed = true;
    }
    if (openCount === 81) return true;
    if (!progressed) return false;
    levelUp();
  }
}

/**
 * What a player can prove from what is currently on screen.
 *
 * Takes only visible facts — which cells are open and what tier they turned
 * out to be, what number each open cell shows, and which covered cells carry a
 * truthful mark — and returns the candidate set for every cell, or null if
 * they contradict.
 *
 * This is the deduction the board type is built around, and it is deliberately
 * separate from `clearableWithoutGuessing`: that one owns the whole play loop
 * for the generator, this one answers "what is knowable right now" for anything
 * driving a real Game.
 */
export function sudokuDeduction(
  openTiers: ReadonlyArray<number | null>,
  nums: ReadonlyArray<number>,
  marks: ReadonlyArray<number>,
): number[] | null {
  const cand: number[] = new Array(81).fill(ALL);
  const open: boolean[] = new Array(81).fill(false);
  for (let i = 0; i < 81; i++) {
    const tier = openTiers[i];
    if (tier !== null && tier !== undefined) {
      open[i] = true;
      cand[i] = bit(tier);
    } else if (marks[i]) {
      cand[i] = bit(marks[i]!);
    }
  }
  return propagate(cand, open, nums as number[]) ? cand : null;
}

/** The strongest tier a candidate mask still admits. -1 for an empty mask. */
export function sudokuCeiling(mask: number): number {
  return highestBit(mask);
}

export interface SudokuBoard {
  grid: SudokuGrid;
  /** Flat indices of the cells whose tier the player is told up front. */
  givens: number[];
}

/**
 * How many solutions to try before giving up on a givens count.
 *
 * Generous on purpose. The rejection rate climbs steeply as givens fall — the
 * hard end of the ladder passes a few boards in a hundred — and a board that
 * quietly fell back to an easier setting would be mistuned on that seed with
 * nothing to show for it. Exhausting this throws instead.
 */
const SUDOKU_ATTEMPTS = 4000;

/**
 * A board with exactly `givens` clues that a deductive player can clear
 * without a single forced guess.
 *
 * This is the one board type in the game that can promise that, and it is the
 * reason the type is worth having: at 100% density HP cannot act as a guess
 * budget — a tier-8 at LV1 costs 56 — so a board with a 50/50 in it is not
 * hard, it is broken. Generate-and-test is affordable here precisely because
 * the propagator above is cheap.
 *
 * Givens are only ever placed on creatures. A given on empty ground would say
 * nothing: the opening reveals every empty cell before the player's first
 * move.
 */
function generateSudokuBoard(
  rng: Rng,
  givens: number,
  thresholds: ReadonlyArray<number>,
  startLevel = 1,
): SudokuBoard {
  for (let attempt = 0; attempt < SUDOKU_ATTEMPTS; attempt++) {
    const grid = sudokuSolution(rng);
    const creatures: number[] = [];
    for (let y = 0; y < SUDOKU_SIZE; y++)
      for (let x = 0; x < SUDOKU_SIZE; x++) {
        if (grid[y]![x]! > 0) creatures.push(idx(x, y));
      }
    for (let k = creatures.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [creatures[k], creatures[j]] = [creatures[j]!, creatures[k]!];
    }
    const chosen = creatures.slice(0, Math.min(givens, creatures.length));
    if (clearableWithoutGuessing(grid, chosen, thresholds, startLevel)) {
      return { grid, givens: chosen };
    }
  }
  throw new Error(
    `sudoku: no guess-free board with ${givens} givens in ${SUDOKU_ATTEMPTS} attempts — ` +
      `the givens schedule in ladders.py is below what the propagator can carry`,
  );
}

/** Creature cells on a Sudoku board: every cell but the one empty cell in each row. */
const SUDOKU_CREATURES = SUDOKU_SIZE * (SUDOKU_SIZE - 1);

/**
 * Sudoku's structural requirements, which are hard because the rule is what fixes the quantities
 * and therefore C_k. A board failing any of these would not throw during generation; it would be
 * tuned against numbers its own layout cannot produce, and the top gate would sit one kill out of
 * reach. A given on empty ground would say nothing, since the opening reveals it.
 */
function validateSudoku(row: PlacementRow): void {
  const where = boardName(row);
  if (row.width !== SUDOKU_SIZE || row.height !== SUDOKU_SIZE) {
    throw new Error(`${where}: sudoku needs a 9x9 board, got ${row.width}x${row.height}`);
  }
  if (row.tiers !== SUDOKU_SIZE - 1) {
    throw new Error(
      `${where}: sudoku uses the nine digits 0-8, so 8 creature ` +
        `tiers plus empty ground — got ${row.tiers}`,
    );
  }
  if (row.quantity.length !== SUDOKU_SIZE - 1 || row.quantity.some((n) => n !== SUDOKU_SIZE)) {
    throw new Error(
      `${where}: sudoku places each tier exactly nine times; ` +
        `quantity is [${row.quantity.join(',')}]`,
    );
  }
  if (
    row.topology === 'hex' ||
    (row.wrap && row.wrap !== 'none') ||
    (row.shape && row.shape !== 'rect')
  ) {
    throw new Error(`${row.typeId}: sudoku's rows, columns and boxes need a plain square 9x9`);
  }
  const givens = row.givens ?? 0;
  if (givens < 1 || givens > SUDOKU_CREATURES) {
    throw new Error(
      `${where}: givens is ${givens}; it must be between 1 and ${SUDOKU_CREATURES} ` +
        `(the creatures — a given on empty ground says nothing, since the opening reveals it)`,
    );
  }
}

/**
 * Lay the tiers out as a Sudoku solution and pin the givens as marks. Givens are placed here rather
 * than by the Game because they are part of the board, not of play: the same seed must produce the
 * same clues. They are truthful marks, which is what Reveal produces too, so every rule that trusts
 * a mark (the guard, mark-assisted Sweep) reads them without knowing where they came from.
 */
function fillSudoku(d: Deal): void {
  const { cfg, grid } = d;
  if (cfg.width !== SUDOKU_SIZE || cfg.height !== SUDOKU_SIZE) {
    throw new Error(
      `${cfg.typeId}#${cfg.board}: sudoku placement needs a ` +
        `${SUDOKU_SIZE}x${SUDOKU_SIZE} board, got ${cfg.width}x${cfg.height}`,
    );
  }
  // Generated against the board's own thresholds, because they decide when a tier becomes
  // openable: a board proven against the wrong ones is provably clear for a player who does not
  // exist.
  const board = generateSudokuBoard(d.rng, cfg.givens, cfg.exp, cfg.startLevel);
  for (let y = 0; y < SUDOKU_SIZE; y++) {
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      const cell = grid[y]![x]!;
      cell.tier = board.grid[y]![x]!;
      cell.alive = cell.tier > 0;
    }
  }
  for (const flat of board.givens) {
    const cell = grid[Math.floor(flat / SUDOKU_SIZE)]![flat % SUDOKU_SIZE]!;
    cell.mark = cell.tier;
    cell.given = true;
  }
}

export const SUDOKU_RULE: PlacementRule = {
  id: 'sudoku',
  validate: validateSudoku,
  // Its nine empty cells. The cascade rule cannot produce them: a cascade needs a zero cell with
  // no creature neighbours, and at 100% density there is none, so 'auto' would silently fall
  // through to the single-cell fallback.
  opening: 'empties',
  deal: fillSudoku,
  // The opening uncovered every empty cell, so nothing covered can be tier 0. The pencil refuses
  // nothing else: a row already holding a 3 does not strike the 3, that is the player's work.
  coveredCanBeEmpty: false,
  candidates: () => null,
  guessFree: true,
  cap: WHOLE_SUM,
  ringProof: NO_RING_PROOF,
  emptied: NOTHING_EMPTIED,
};
