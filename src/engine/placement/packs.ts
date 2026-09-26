/**
 * The pack placement: creatures travel in packs of six, one of every tier, and
 * no two packs touch.
 *
 * PAIRS with the group size raised from two to the tier count, and a rule about
 * what each group holds. That framing is exact rather than loose: "every
 * creature has exactly one creature neighbour" is the same statement as
 * "creatures stand in connected groups of two that may not touch", and this is
 * that statement with six in place of two.
 *
 * "All six touch" means CONNECTED, not "each touches every other". It cannot
 * mean the second: the most cells that are all mutually adjacent is four on a
 * square grid (a 2x2 block) and three on hex. Touching is `neighbours()`, the
 * same adjacency numbers are summed over, so a diagonal counts on a square
 * board and a pack gets hex, wrapped seams and cut-out shapes for nothing.
 *
 * WHAT THAT HANDS THE PLAYER.
 *
 * Packs never touch, so a pack is exactly a connected component of creatures —
 * which pack a creature belongs to is never hidden and needs no link drawn.
 * Everything else follows from that:
 *
 *   A covered cell beside a creature is a packmate or empty ground, never a
 *   creature from anywhere else.
 *
 *   A pack holds each tier exactly once, so the tiers you have found in a pack
 *   say which ones are still out there — and a covered neighbour of the pack
 *   can only be one of THOSE. When the highest tier still missing is at or
 *   below your level, the whole ring around the pack is free.
 *
 *   A pack with all six found has nothing left to be, so its ring is empty
 *   ground at ANY level. That is PAIRS's "met its partner" proof, grown.
 *
 * `missingFrom` is both of those as one number, and neither can run away: a
 * freed ring holds packmates and empty ground and nothing else, because no
 * other pack may touch this one. So a trigger finishes one pack and stops.
 *
 * WHAT THIS DOES NOT TOUCH. Each pack is one of every tier, so `quantity` is
 * FLAT by construction — n packs is n of each tier. That is the DOMINOES and
 * SUDOKU situation: the rule is the distribution. C_k is still a sum over
 * `quantity`, so the tuning identity, the zero-damage guarantee and "EXP is
 * always collected" are exactly where they were, and nothing is removed.
 *
 * AND WHAT IT COSTS — the opposite of PAIRS. Pairing spreads creatures evenly
 * and gives the game its smallest openings. Packs of six are big clusters, and
 * clustering is what makes empty ground: measured on 30x16 at 25% density,
 * cells with nothing around them rise from 9.4% on a uniform board to 23.3%,
 * and the largest opening from 7.3% of the board to 19.8%. So this ladder has
 * to run dense to be a puzzle at all. The packing ceiling is not what binds it
 * the way it bound PAIRS: groups of six have far less rim per creature than
 * dominoes do, and with restarts a lay-down lands 36% on every seed measured,
 * against PAIRS's 26%.
 */

import type { Cell } from '../types.js';
import { noteBit } from '../notes.js';
import { type Rng, randInt, shuffle } from '../rng.js';
import { ONE_POOL, placeDealt, readDealt, shuffledPool } from './deal.js';
import {
  type Deal,
  NOTHING_EMPTIED,
  PLAIN_DISPLAY,
  type PlacementRow,
  type PlacementRule,
  type RingProof,
  type RuleView,
  WHOLE_SUM,
  boardName,
} from './rule.js';

/**
 * What a covered cell could hold by the pack rule alone, as a note mask — or
 * null when no open creature touches it, and the rule says nothing yet.
 *
 * `pairCandidates` grown to packs. Packs never touch, so every creature beside
 * this cell belongs to the one pack this cell would join if it held a creature,
 * and a pack holds one of every tier: the candidates are empty ground and the
 * tiers none of the neighbouring pieces has shown. Two pieces beside it that
 * show the SAME tier are two different packs, and a creature here would join
 * them — so then it is empty ground outright.
 *
 * Sound in the one direction that matters: a piece may be only part of its
 * pack, so it can only ever think MORE is missing, never less. The tier a cell
 * really holds is never taken out, and `test/candidates.test.ts` walks real
 * boards to hold it to that.
 */
function packCandidates(
  cell: Cell,
  neighboursOf: (c: Cell) => readonly Cell[],
  tiers: number,
): number | null {
  const known = (c: Cell): boolean => c.present && c.open && c.tier > 0;
  const seen = new Set<Cell>();
  let shown = 0;
  let touched = false;
  for (const n of neighboursOf(cell)) {
    if (!known(n) || seen.has(n)) continue;
    touched = true;
    const piece = [n];
    seen.add(n);
    let mask = 0;
    for (let i = 0; i < piece.length; i++) {
      const p = piece[i]!;
      mask |= 1 << p.tier;
      for (const m of neighboursOf(p))
        if (known(m) && !seen.has(m)) {
          seen.add(m);
          piece.push(m);
        }
    }
    if (shown & mask) return noteBit(0);
    shown |= mask;
  }
  if (!touched) return null;
  return (((1 << (tiers + 1)) - 1) & ~shown) | noteBit(0);
}

/**
 * Restarts allowed before a board is refused. Same argument as PAIRS's: a
 * greedy lay-down that ends short has spent its early packs badly all over the
 * board, and unwinding the last few would not reach the ones that cost it.
 */
const PACK_ATTEMPTS = 60;

/**
 * The most creatures a pack board may be asked for, as a share of the cells
 * they may stand on — where a random lay-down stops landing the quota
 * reliably. Measured with 40 seeds a point: 36% places on every seed from 24x14
 * to 44x24; 37% starts losing seeds on the biggest board and 38% loses half of
 * them there. The tuned ladder sits well under it — see `ladders.py` — because
 * what limits this mode is where a board stops being a puzzle, not the
 * packing. A hand-edited schedule past it fails at the config boundary with the
 * arithmetic in the message, rather than as an occasional seed that cannot be
 * placed.
 */
export const PACK_MAX_DENSITY = 0.36;

/**
 * Lay down `count` packs of `size` connected cells among `candidates`, no two
 * packs touching.
 *
 * Returns one array per pack. The caller deals the tiers, and keeps the
 * grouping to do it — one of every tier has to land in each pack, which is why
 * this cannot be the shuffle-and-take every other placement uses.
 *
 * A pack GROWS: it starts on a free cell and adds a neighbour of a random
 * member until it has `size`. Picking a random member-and-neighbour edge
 * rather than a random frontier cell weights a cell by how many members it
 * touches, which is a mild pull toward chunky shapes without ruling out an L
 * or a snake — the "loose" shape the mode was asked for. A pack that runs out
 * of room before it is whole is taken back; nothing it touched was closed yet.
 *
 * The invariant holds BY CONSTRUCTION. Placing a pack closes its cells and
 * everything touching them, and growth only ever steps onto cells that are not
 * closed, so no later pack can land beside an earlier one.
 */
export function choosePacks(
  candidates: readonly number[],
  neighboursOf: (flat: number) => readonly number[],
  count: number,
  size: number,
  rng: Rng,
): number[][] {
  if (count === 0) return [];
  if (count * size > candidates.length) {
    throw new Error(`packs: ${count * size} creatures want ${candidates.length} cells`);
  }

  const allowed = new Set(candidates);
  const order = candidates.slice();

  for (let attempt = 0; attempt < PACK_ATTEMPTS; attempt++) {
    shuffle(order, rng);
    const blocked = new Set<number>();
    const packs: number[][] = [];

    for (const start of order) {
      if (packs.length === count) break;
      if (blocked.has(start)) continue;

      const pack = [start];
      const inPack = new Set(pack);
      const open = (n: number): boolean => allowed.has(n) && !blocked.has(n) && !inPack.has(n);
      while (pack.length < size) {
        const edges: number[] = [];
        for (const m of pack) for (const n of neighboursOf(m)) if (open(n)) edges.push(n);
        if (!edges.length) break;
        const next = edges[randInt(rng, edges.length)]!;
        pack.push(next);
        inPack.add(next);
      }
      if (pack.length < size) continue;

      packs.push(pack);
      // Close the pack and everything around it. This is the whole invariant.
      for (const c of pack) {
        blocked.add(c);
        for (const n of neighboursOf(c)) blocked.add(n);
      }
    }

    if (packs.length === count) return packs;
  }

  throw new Error(
    `packs: could not place ${count} packs of ${size} in ${candidates.length} cells ` +
      `in ${PACK_ATTEMPTS} attempts (${((100 * count * size) / candidates.length).toFixed(1)}% ` +
      `density)`,
  );
}

/**
 * One of every tier into each pack, in a random order per pack — so which
 * member of a pack is the tier 6 is a fact about the seed, not about the order
 * the pack happened to grow in.
 */
export function dealPacks(
  packs: readonly (readonly number[])[],
  tiers: number,
  rng: Rng,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const pack of packs) {
    if (pack.length !== tiers) {
      throw new Error(
        `pack deal: a pack of ${pack.length} cannot hold one of each of ${tiers} tiers`,
      );
    }
    const hand = shuffle(
      Array.from({ length: tiers }, (_, i) => i + 1),
      rng,
    );
    pack.forEach((flat, i) => out.set(flat, hand[i]!));
  }
  return out;
}

/**
 * How many packs a board's `quantity` describes, or null if it is not a pack
 * board's quantity at all. Recovered rather than stored, for DOMINOES's
 * reason: `quantity` is already the one place the ladder says how many
 * creatures there are.
 */
export function packsIn(tiers: number, quantity: readonly number[]): number | null {
  if (tiers < 2 || quantity.length !== tiers) return null;
  const per = quantity[0]!;
  if (per < 1 || quantity.some((n) => n !== per)) return null;
  return per;
}

/**
 * For every open creature, the highest tier its pack could still be hiding:
 * 0 once the pack is whole. A covered neighbour of that creature is a packmate
 * or empty ground, and a packmate is one of the missing tiers, so this is the
 * cap on what the whole ring can hold.
 *
 * Read off the component of OPEN creatures, which may be only part of a pack —
 * two pieces of one pack can be joined through a cell still covered. That
 * errs in the safe direction: a piece knows fewer of its pack's tiers than the
 * whole pack does, so it can only think more is missing, never less.
 *
 * Answers for the whole board at once because the components are shared, and
 * `safeCells` asks about every open creature on every pass of its loop.
 */
export function missingFrom(
  cells: readonly Cell[],
  neighboursOf: (cell: Cell) => readonly Cell[],
  tiers: number,
): Map<Cell, number> {
  const out = new Map<Cell, number>();
  const known = (c: Cell): boolean => c.present && c.open && c.tier > 0;

  for (const seed of cells) {
    if (!known(seed) || out.has(seed)) continue;
    const piece: Cell[] = [seed];
    const seen = new Set<Cell>(piece);
    for (let i = 0; i < piece.length; i++) {
      for (const n of neighboursOf(piece[i]!)) {
        if (known(n) && !seen.has(n)) {
          seen.add(n);
          piece.push(n);
        }
      }
    }
    const found = new Set(piece.map((c) => c.tier));
    let top = 0;
    for (let t = tiers; t >= 1; t--)
      if (!found.has(t)) {
        top = t;
        break;
      }
    for (const c of piece) out.set(c, top);
  }
  return out;
}

/**
 * What is wrong with a pack board, or null if nothing is. For the tests rather
 * than for play, like `pairingFault`: the generator cannot produce a bad
 * board, and this is here to prove that on real ones.
 */
export function packFault(
  tierAt: ReadonlyMap<number, number>,
  neighboursOf: (flat: number) => readonly number[],
  tiers: number,
): string | null {
  const seen = new Set<number>();
  for (const start of tierAt.keys()) {
    if (seen.has(start)) continue;
    const comp = [start];
    seen.add(start);
    for (let i = 0; i < comp.length; i++) {
      for (const n of neighboursOf(comp[i]!)) {
        if (tierAt.has(n) && !seen.has(n)) {
          seen.add(n);
          comp.push(n);
        }
      }
    }
    if (comp.length !== tiers) {
      return `a pack at cell ${start} has ${comp.length} creatures, not ${tiers}`;
    }
    const held = new Set(comp.map((c) => tierAt.get(c)!));
    if (held.size !== tiers) {
      return `the pack at cell ${start} repeats a tier: ${comp.map((c) => tierAt.get(c)).join(',')}`;
    }
  }
  return null;
}

/**
 * The pack rule's structural requirements. `quantity` must be flat, n of every tier for n packs;
 * a quantity merely close to whole packs would still generate and be tuned correctly, and would
 * not be the mode. And the density must be one the packing can reach, because the quota has to
 * land exactly.
 */
function validatePacks(row: PlacementRow): void {
  const where = boardName(row);
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
}

/**
 * The spawnable cells shuffled, and how many packs (or congo lines) the board's quantity is. A
 * pack board deals its own tiers, for DOMINOES's reason: one of every tier has to land in each
 * pack, so the grouping must reach the deal intact, and the shuffle-and-take would scatter it.
 */
export function packPoolAndCount(d: Deal): { pool: number[]; count: number } {
  const { cfg } = d;
  const pool = shuffledPool(d);
  const count = packsIn(cfg.tiers, cfg.quantity);
  if (count === null) {
    throw new Error(
      `board ${cfg.typeId}#${cfg.board}: quantity [${cfg.quantity.join(',')}] is not ` +
        `a whole number of packs — a pack is one of each of the ${cfg.tiers} tiers`,
    );
  }
  return { pool, count };
}

/**
 * The pack ring: every covered neighbour of an open creature is a packmate or empty ground, and a
 * packmate is a tier its pack has not shown, so the ring is free once the strongest of those is
 * within `level`, and at any level once nothing is missing. Worked out once per sweep, because a
 * pack's piece is shared by every creature in it.
 */
function packRingProof(view: RuleView, level: number): RingProof {
  const gaps = missingFrom(view.grid.flat(), (c) => view.neighboursOf(c), view.config.tiers);
  return (cell) => {
    const gap = gaps.get(cell);
    return gap !== undefined && gap <= level;
  };
}

function dealPackBoard(d: Deal): void {
  const { pool, count } = packPoolAndCount(d);
  const packs = choosePacks(pool, (flat) => d.neighboursOf(flat), count, d.cfg.tiers, d.rng);
  placeDealt(d, dealPacks(packs, d.cfg.tiers, d.rng));
}

export const PACKS_RULE: PlacementRule = {
  id: 'packs',
  validate: validatePacks,
  opening: 'auto',
  deal: dealPackBoard,
  patrols: false,
  coveredCanBeEmpty: true,
  candidates: (cell, view) => packCandidates(cell, (c) => view.neighboursOf(c), view.config.tiers),
  guessFree: false,
  cap: WHOLE_SUM,
  ringProof: packRingProof,
  emptied: NOTHING_EMPTIED,
  // Packs never touch, so which pack a creature belongs to is never hidden and needs no bond.
  display: PLAIN_DISPLAY,
  pools: ONE_POOL,
  groups: 'packs',
  fault: (grid, cfg) => {
    const { tierAt, neighboursOf } = readDealt(grid, cfg);
    return packFault(tierAt, neighboursOf, cfg.tiers);
  },
};
