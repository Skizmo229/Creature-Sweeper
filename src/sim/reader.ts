/**
 * What the graded player can see, and the arithmetic every trick shares.
 *
 * The honest player (`deduce.ts`) reads every open cell's number, because it was built to say
 * whether a board is fair. This reader is built to say what a PERSON has to work with, so it
 * reads a number only where the game draws it: an open empty cell always, a beaten creature only
 * where the placement rule shows its number on hover (`display.hoverShowsNumber`, false on the
 * pairing rules, decision 0012). A switch lets a measurement peek anyway, so that what hiding the
 * number costs can be measured rather than argued. A covered cell's tier, number and life are
 * never read here, except whether it holds a creature where the game draws that
 * (`display.showsCreatures`); the one hidden read the instrument makes is the alarm in `graded.ts`.
 *
 * A constraint is one visible number with the tiers already on show subtracted: open neighbours
 * count their tier, and the player's own marks count as the tier they claim, because the graded
 * player writes a mark only when a trick has named the cell (docs/human-tuning-plan.md). The
 * candidate sets ("domains") a person would pencil are held by the player, not in `Cell.notes`,
 * which the engine reads as a guard and must never be read as a bound (docs/invariants.md).
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { hasNote, noteBit } from '../engine/notes.js';
import { placementRule } from '../engine/placement/registry.js';
import { augurNow } from '../engine/augur.js';

/** One visible number, less everything on show around it. */
export interface Constraint {
  readonly cell: Cell;
  /** Tier still hidden, spread over `unknown`. */
  readonly residual: number;
  /** Covered, unmarked neighbours. Marked ones are subtracted as the tier they claim. */
  readonly unknown: readonly Cell[];
  /**
   * Creatures among `unknown`, once a Census has counted this cell's ring or where the board
   * shows every creature; null otherwise.
   */
  readonly creatures: number | null;
  /** The strongest tier any of `unknown` could be, once an Augur has read this cell's ring. */
  readonly ceiling: number | null;
  /** The tiers of the creatures among `unknown`, strongest first, once an Augur has read the ring. */
  readonly tiers: readonly number[] | null;
}

/** The board as the graded player sees it on one pass. */
export interface Reading {
  readonly constraints: readonly Constraint[];
  /** The constraints each unknown cell is under. A cell under none is "interior". */
  readonly touching: ReadonlyMap<Cell, readonly Constraint[]>;
  /** Every covered, unmarked, present cell. */
  readonly unknown: readonly Cell[];
  /** Covered cells the player has marked, and what they claim. */
  readonly marked: ReadonlyMap<Cell, number>;
  /**
   * Creatures of each tier still hiding in `unknown` cells (index 0 unused): the counters,
   * less the player's marks. On a search board the counters already subtract marks, as the HUD
   * shows them (`Game.counterFor`), so nothing is taken off twice.
   */
  readonly hiding: readonly number[];
  /** The tiers with a creature still hiding, as a mask; bit 0 is always set. */
  readonly hidingMask: number;
  /** The highest tier with a creature still hiding, 0 when none. */
  readonly top: number;
  /** Total tier hiding in `unknown` cells: `hiding`, weighted. */
  readonly totalHiding: number;
}

/** Whether the game shows this open cell's number. */
function numberVisible(game: Game, cell: Cell, peek: boolean): boolean {
  if (!cell.open) return false;
  if (cell.tier === 0 || peek) return true;
  return !cell.alive && placementRule(game.config.placement).display.hoverShowsNumber;
}

/** Which of the player's marks a reading believes. */
export interface ReadOptions {
  /**
   * Whether a mark is believed. The graded player writes only proven marks and believes them
   * (the default); a person writes guesses, so the tutor believes none (docs/teaching-plan.md),
   * and a marked cell is then read as covered and unknown, its mark subtracted from nothing.
   */
  trustMarks?: boolean;
  /** Marks believed although `trustMarks` is false: the ones the caller has proven itself. */
  trusted?: ReadonlySet<Cell>;
}

/** Read the board. `peek` reads a beaten creature's number even where the game hides it. */
export function readBoard(game: Game, peek: boolean, options: ReadOptions = {}): Reading {
  const constraints: Constraint[] = [];
  const touching = new Map<Cell, Constraint[]>();
  const unknown: Cell[] = [];
  const marked = new Map<Cell, number>();

  // Where the creatures walk a mark is a route, not a claim about a cell (PATROL), so nothing
  // marked is subtracted there; the graded player writes no marks on such a board anyway.
  const trustAll = options.trustMarks ?? true;
  const believed = (cell: Cell): boolean =>
    cell.mark > 0 && game.marksAreClaims && (trustAll || (options.trusted?.has(cell) ?? false));
  // On a search board the counters already subtract every mark as a flag (`Game.counterFor`);
  // a mark read as unknown here has to be added back, or the tier would be counted gone.
  const flags = new Array<number>(game.config.tiers + 1).fill(0);
  // Where the board draws every creature where it stands (SPRINKLE DONUT), a person counts the
  // creatures under a number as a Census would, so the count is read off what is drawn.
  const shown = placementRule(game.config.placement).display.showsCreatures;
  for (const cell of game.grid.flat()) {
    if (!cell.present) continue;
    if (!cell.open) {
      if (believed(cell)) marked.set(cell, cell.mark);
      else {
        unknown.push(cell);
        if (cell.mark > 0 && game.config.search) flags[cell.mark]!++;
      }
      continue;
    }
    if (!numberVisible(game, cell, peek)) continue;
    let residual = cell.num;
    let counted = 0;
    const covered: Cell[] = [];
    const ring = game.neighboursOf(cell);
    // An Augur lists the marked creatures too: each believed mark takes its tier out of the list.
    const tiers = augurNow(cell, ring);
    for (const n of ring) {
      if (n.open) {
        residual -= n.tier;
        if (n.tier > 0) counted++;
      } else if (believed(n)) {
        residual -= n.mark;
        counted++;
        const at = tiers?.indexOf(n.mark) ?? -1;
        if (at >= 0) tiers!.splice(at, 1);
      } else covered.push(n);
    }
    if (!covered.length) continue;
    let creatures = cell.census === null ? null : cell.census - counted;
    if (tiers) creatures = tiers.length;
    if (shown) creatures = covered.filter((n) => n.tier > 0).length;
    const ceiling = tiers ? (tiers[0] ?? 0) : null;
    const c: Constraint = { cell, residual, unknown: covered, creatures, ceiling, tiers };
    constraints.push(c);
    for (const n of covered) {
      const list = touching.get(n);
      if (list) list.push(c);
      else touching.set(n, [c]);
    }
  }

  let hidingMask = noteBit(0);
  let top = 0;
  let totalHiding = 0;
  const hiding = new Array<number>(game.config.tiers + 1).fill(0);
  const markedOf = new Array<number>(game.config.tiers + 1).fill(0);
  if (!game.config.search) for (const t of marked.values()) markedOf[t] = (markedOf[t] ?? 0) + 1;
  for (let t = 1; t <= game.config.tiers; t++) {
    const left = Math.max(0, game.counterFor(t) + flags[t]! - markedOf[t]!);
    if (left <= 0) continue;
    hidingMask |= noteBit(t);
    top = t;
    hiding[t] = left;
    totalHiding += t * left;
  }
  return { constraints, touching, unknown, marked, hiding, hidingMask, top, totalHiding };
}

// ------------------------------------------------------------- candidate sets

/** The mask of every tier from 0 to `tiers`. */
export function everyTier(tiers: number): number {
  return (1 << (tiers + 1)) - 1;
}

/** The highest candidate in a mask, -1 for an empty one. */
export function highestTier(mask: number): number {
  return 31 - Math.clz32(mask);
}

/** The lowest candidate in a mask, -1 for an empty one. */
export function lowestTier(mask: number): number {
  return mask === 0 ? -1 : 31 - Math.clz32(mask & -mask);
}

/**
 * Every tier at or below `max`, as a mask. A remainder can run to hundreds on a fresh board,
 * far past what a mask can hold, so anything beyond the widest mask is the widest mask: every
 * tier there is, which caps nothing, and is what a remainder that large means.
 */
export function tiersUpTo(max: number): number {
  if (max < 0) return 0;
  if (max >= 30) return 0x7fffffff;
  return (1 << (max + 1)) - 1;
}

/**
 * Which values of each cell can take part in a sum landing in [lo, hi].
 *
 * The arithmetic behind "bounds" and "what if": a 9 over two cells of a five-tier board is a 4
 * and a 5, because no other pair of candidates reaches it. Forward sums over a prefix of the
 * cells and backward sums over the suffix are enumerated once each, and a value survives when
 * some prefix sum, the value and some suffix sum land in the range. Exact, and cheap: a ring is
 * at most eight cells and a sum at most a few dozen. Returns null when NO assignment fits, which
 * is a contradiction for whoever asked.
 */
export function supported(domains: readonly number[], lo: number, hi: number): number[] | null {
  const k = domains.length;
  if (hi < 0 || lo > hi) return null;
  const step = (sums: Uint8Array, dom: number): Uint8Array => {
    const next = new Uint8Array(hi + 1);
    for (let s = 0; s <= hi; s++) {
      if (!sums[s]) continue;
      for (let v = 0; s + v <= hi; v++) if (hasNote(dom, v)) next[s + v] = 1;
    }
    return next;
  };
  const none = new Uint8Array(hi + 1);
  none[0] = 1;
  const forward: Uint8Array[] = [none];
  for (let i = 0; i < k; i++) forward.push(step(forward[i]!, domains[i]!));
  // The suffix sums as running counts, so "any suffix sum in a range" is one subtraction.
  const backward: Uint8Array[] = new Array<Uint8Array>(k + 1);
  backward[k] = none;
  for (let i = k - 1; i >= 0; i--) backward[i] = step(backward[i + 1]!, domains[i]!);
  const counts = backward.map((sums) => {
    const c = new Int32Array(hi + 2);
    for (let s = 0; s <= hi; s++) c[s + 1] = c[s]! + sums[s]!;
    return c;
  });

  const out: number[] = [];
  let any = false;
  for (let i = 0; i < k; i++) {
    let mask = 0;
    const before = forward[i]!;
    const after = counts[i + 1]!;
    for (let v = 0; v <= hi; v++) {
      if (!hasNote(domains[i]!, v)) continue;
      for (let a = 0; a + v <= hi; a++) {
        if (!before[a]) continue;
        const from = Math.max(0, lo - a - v);
        const to = hi - a - v;
        if (from <= to && after[to + 1]! - after[from]! > 0) {
          mask |= noteBit(v);
          break;
        }
      }
    }
    if (mask) any = true;
    out.push(mask);
  }
  return any || k === 0 ? out : null;
}

/** Whether some assignment of the domains sums to exactly `target`. */
export function reachable(domains: readonly number[], target: number): boolean {
  if (target < 0) return false;
  // A bitset of reachable sums, one bit per sum, while the target fits in one word.
  if (target <= 30) {
    const keep = (1 << (target + 1)) - 1;
    let reach = 1;
    for (const d of domains) {
      let next = 0;
      for (let v = 0; v <= target; v++) if (hasNote(d, v)) next |= reach << v;
      reach = next & keep;
      if (!reach) return false;
    }
    return (reach & (1 << target)) !== 0;
  }
  return supported(domains, target, target) !== null;
}
