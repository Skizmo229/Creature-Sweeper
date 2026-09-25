/**
 * The domino placement: the board's creatures ARE a full domino set.
 *
 * PAIRS puts creatures in non-touching adjacent pairs and says nothing about
 * what tiers those pairs carry — a tier 2 may partner a tier 7, and which
 * pairings turn up is a fact about the seed. This says the rest of it: the
 * multiset of pairings is exactly a double-T set, every unordered pair {a,b}
 * with 1 <= a <= b <= T, each appearing once.
 *
 * WHAT THAT DECIDES, and it is nearly everything. A double-T set holds
 * T(T+1)/2 tiles and therefore T(T+1) creatures, and every tier appears in it
 * exactly T+1 times — T-1 tiles pairing it with each other tier, plus its own
 * double, which carries two. So `quantity` is FLAT by construction and is not
 * a dial at all. This is the Sudoku situation rather than the Checkerboard
 * one: the rule IS the distribution, so density, tier count and set count are
 * the only levers left, and `ladders.py` branches around its own distribution
 * path for this type exactly as it does for Sudoku.
 *
 * A flat curve is not a small thing to inherit. It is EXTREME's whole lever —
 * a tier 6 turns up as often as a tier 1 — and PAIRS's characteristic gamble
 * is "exactly one of these k cells holds a tier T, the rest are empty", read
 * off a dead creature's number. Flattening the curve makes the T in that
 * sentence uniform over the whole alphabet, which is a far more dangerous
 * guess than the descending curve PAIRS is tuned against.
 *
 * WHAT IT HANDS THE PLAYER. One open creature identifies a whole TILE, not
 * half of one: its own tier you know because you fought it, and its partner's
 * tier is its number, because nothing but the partner borders a creature. So
 * every kill crosses a tile off a list the player can hold — and the list is
 * finite, known from the first move, and printed on the board as you go. The
 * doubles are the legible end of it: there is exactly one [a|a] in a set, so a
 * pair reading "5 — 5" is THE five-double and no other 5 stands beside a 5.
 *
 * NO BLANKS, and the reason is structural rather than a matter of taste.
 * A [0|x] tile is a creature whose partner is empty ground, which breaks the
 * one-creature-neighbour rule that `ringIsFree` and both of PAIRS's Sweep
 * proofs are built on. It is worse than that, though: a blank half is drawn as
 * ordinary empty ground and there is nothing to tell it from the rest of the
 * floor, so a quarter of a double-six set would be tiles the player cannot
 * verify — and [0|0] is two blank cells, which is invisible in principle. The
 * set bookkeeping is the entire point of the mode, so a set with holes in it
 * is the one thing it cannot have. Tiers 1..T only.
 */

import { type Rng, randInt, shuffle } from '../rng.js';
import { placeDealt } from './deal.js';
import { type Deal, type PlacementRow, type PlacementRule, boardName } from './rule.js';
import { PAIRS_RULE, layPairs } from './pairs.js';

/** One tile: two tiers, in no particular order. */
export type Tile = readonly [number, number];

/**
 * Every tile of `sets` copies of a double-`tiers` set.
 *
 * Copies exist because a set is a fixed size and a board is not. One
 * double-six set is 42 creatures, which is a sparse board past about two
 * hundred cells — so the ladder deals several sets rather than inventing a
 * distribution the set does not have, and that is also what keeps every board
 * at exactly six tiers. Every copy keeps the property that matters: the tiers
 * stay exactly balanced.
 */
export function dominoSet(tiers: number, sets = 1): Tile[] {
  if (!Number.isInteger(tiers) || tiers < 1) {
    throw new Error(`a domino set needs at least one tier, got ${tiers}`);
  }
  if (!Number.isInteger(sets) || sets < 1) {
    throw new Error(`a domino ladder needs at least one set, got ${sets}`);
  }
  const out: Tile[] = [];
  for (let n = 0; n < sets; n++) {
    for (let a = 1; a <= tiers; a++) {
      for (let b = a; b <= tiers; b++) out.push([a, b]);
    }
  }
  return out;
}

/** Creatures of each tier in that set — flat, and that is the whole point. */
export function dominoQuantity(tiers: number, sets = 1): number[] {
  return Array.from({ length: tiers }, () => (tiers + 1) * sets);
}

/**
 * How many copies of the set a board's `quantity` describes, or null if it
 * does not describe a set at all.
 *
 * Recovered from the quantity rather than carried as a field of its own,
 * because `quantity` is already the single place the ladder says how many
 * creatures there are, and a second field saying the same thing is a second
 * place for it to be wrong. A flat quantity of (T+1)·n IS n sets; anything
 * else is not a domino board, whatever the placement says.
 */
export function setsIn(tiers: number, quantity: readonly number[]): number | null {
  if (quantity.length !== tiers || tiers < 1) return null;
  const per = quantity[0]!;
  if (quantity.some((n) => n !== per)) return null;
  if (per % (tiers + 1) !== 0) return null;
  const sets = per / (tiers + 1);
  return sets >= 1 ? sets : null;
}

/** How many creatures `sets` copies of a double-`tiers` set put on the board. */
export function dominoCreatures(tiers: number, sets = 1): number {
  return tiers * (tiers + 1) * sets;
}

/**
 * Deal the set's tiles onto pairs of cells.
 *
 * `pairs` arrives as `choosePairs` returns it — partner-adjacent, so
 * `pairs[2i]` and `pairs[2i+1]` are the two halves of one domino. That
 * ordering is the reason this is a separate path rather than the ordinary
 * shuffle-and-take: every other placement may shuffle its pool freely because
 * a tier lands where it lands, and here the two halves of a TILE have to land
 * on the two halves of a DOMINO.
 *
 * The tiles are shuffled, and each tile's two ends are swapped at random, so
 * neither "which tile is where" nor "which way round it lies" is fixed by the
 * set's own order.
 */
export function dealTiles(
  pairs: readonly number[],
  tiers: number,
  sets: number,
  rng: Rng,
): Map<number, number> {
  const tiles = dominoSet(tiers, sets);
  if (pairs.length !== tiles.length * 2) {
    throw new Error(
      `domino deal: ${tiles.length} tiles want ${tiles.length * 2} cells, got ${pairs.length}`,
    );
  }
  shuffle(tiles, rng);

  const out = new Map<number, number>();
  for (let i = 0; i < tiles.length; i++) {
    const [a, b] = tiles[i]!;
    // Which end lies where is a coin flip, or every tile would put its smaller
    // tier on whichever cell `choosePairs` happened to pick first.
    const flip = randInt(rng, 2) === 1;
    out.set(pairs[i * 2]!, flip ? b : a);
    out.set(pairs[i * 2 + 1]!, flip ? a : b);
  }
  return out;
}

/**
 * What is wrong with a dealt set, or null if nothing is.
 *
 * For the tests rather than for play, like `pairingFault`: the dealer cannot
 * produce a wrong set, and this is here to prove that on real boards. It
 * checks the thing that actually matters — that the multiset of TILES is the
 * set, not merely that the tier counts come out flat, which a wrong deal could
 * manage while dealing the same tile twice.
 */
export function dominoFault(
  dealt: ReadonlyArray<Tile>,
  tiers: number,
  sets: number,
): string | null {
  const key = (t: Tile): string => {
    const [a, b] = t;
    return a <= b ? `${a}|${b}` : `${b}|${a}`;
  };
  const want = new Map<string, number>();
  for (const tile of dominoSet(tiers, sets)) {
    want.set(key(tile), (want.get(key(tile)) ?? 0) + 1);
  }
  const got = new Map<string, number>();
  for (const tile of dealt) got.set(key(tile), (got.get(key(tile)) ?? 0) + 1);

  for (const [k, n] of want) {
    const had = got.get(k) ?? 0;
    if (had !== n) return `tile [${k}] appears ${had} times, expected ${n}`;
  }
  for (const [k, n] of got) {
    if (!want.has(k)) return `tile [${k}] is not in a double-${tiers} set (${n} of them)`;
  }
  return null;
}

/**
 * The domino rule's structural requirements: everything PAIRS requires, checked by the pairing
 * rule itself so the two cannot drift, plus the set. `quantity` must be exactly a whole number of
 * double-T sets, flat at T+1 of each tier per set; a quantity merely close to one would generate
 * and be tuned correctly, and would not be the mode, because the dealer could not lay a full set.
 */
function validateDominoes(row: PlacementRow): void {
  if (setsIn(row.tiers, row.quantity) === null) {
    const per = row.tiers + 1;
    throw new Error(
      `${boardName(row)}: quantity [${row.quantity.join(',')}] is not a whole number of ` +
        `double-${row.tiers} domino sets — a set is ${per} of every tier, so the ` +
        `quantity has to be flat and a multiple of ${per}`,
    );
  }
  PAIRS_RULE.validate(row);
}

/**
 * Tiles, not tiers: the pair order `layPairs` returns must survive, because the two ends of a tile
 * have to land on the two halves of one domino. So this writes the tiers itself rather than
 * handing the cells to the shuffle-and-take, which would scatter the pairs.
 */
function dealDominoes(d: Deal): void {
  const { cfg } = d;
  const pairs = layPairs(d);
  const sets = setsIn(cfg.tiers, cfg.quantity);
  if (sets === null) {
    throw new Error(
      `board ${cfg.typeId}#${cfg.board}: quantity [${cfg.quantity.join(',')}] is not ` +
        `a whole number of double-${cfg.tiers} domino sets`,
    );
  }
  placeDealt(d, dealTiles(pairs, cfg.tiers, sets, d.rng));
}

export const DOMINOES_RULE: PlacementRule = {
  id: 'dominoes',
  validate: validateDominoes,
  opening: 'auto',
  deal: dealDominoes,
  // A domino board is a pairing board: everything the pairing rule reads, it reads here.
  coveredCanBeEmpty: PAIRS_RULE.coveredCanBeEmpty,
  candidates: PAIRS_RULE.candidates,
  guessFree: PAIRS_RULE.guessFree,
  cap: PAIRS_RULE.cap,
  ringProof: PAIRS_RULE.ringProof,
  emptied: PAIRS_RULE.emptied,
  display: PAIRS_RULE.display,
};
