/**
 * The pairing placement: every creature has exactly one creature neighbour.
 *
 * One sentence, and almost nothing about it is what it first looks like. It
 * sounds like a rule about couples; it is a rule about PACKING. If every
 * creature has exactly one creature beside it, the occupied cells are
 * dominoes — and no two dominoes may touch, because a contact would give the
 * two creatures either side of it a second creature neighbour. So the board is
 * a scattering of adjacent pairs, each sitting alone inside a ring of empty
 * ground.
 *
 * WHAT THAT HANDS THE PLAYER, and it is a great deal more than it sounds.
 *
 * A creature's neighbours are its partner and nothing else. A cell's number is
 * the SUM of its neighbours' tiers. Put those together and a creature's own
 * number IS ITS PARTNER'S TIER, exactly — no arithmetic, no ambiguity, no
 * subtraction. The game already computes a number for every cell including
 * creatures, and already lets a defeated one show it, so the single most
 * valuable deduction on this board falls out of machinery that was built for
 * something else. Kill anything and it names its partner.
 *
 * Two proofs come off that, and `ringIsFree` is both of them:
 *
 *   A. A defeated creature whose number is at or below your level has a
 *      partner you can kill for free, and every other neighbour is empty
 *      ground. So the whole ring is free to open, whatever else is unknown.
 *
 *   B. A defeated creature with a defeated creature beside it has already MET
 *      its partner — that neighbour is it, by the rule — so every other
 *      neighbour is empty ground and the ring is free at ANY level.
 *
 * Neither can run away, and the reason is the packing rather than anything
 * about levels: a freed ring contains the partner and otherwise empty ground,
 * because no second domino may touch the first. So a trigger clears one
 * domino and stops. The chain cannot jump to the next pair, and the cascade it
 * sets off opens blank ground, which kills nothing and so triggers nothing.
 * Compare the Sudoku rule, which had to be kept out of `safeCells` entirely
 * because it could iterate its way to a whole solved board.
 *
 * WHAT THIS DOES NOT TOUCH. The four load-bearing facts are statements about
 * EXP and levels. Pairing ignores tiers completely — a tier 2 may partner a
 * tier 7 — so `quantity` is untouched, C_k is untouched, the zero-damage
 * guarantee follows from C_k as it always did, and no creature is removed.
 * The single constraint it adds is that a board's creatures must number an
 * EVEN total, which is a question for `ladders.py` and not for the board.
 *
 * AND WHAT IT COSTS. The packing has a hard ceiling: the densest legal
 * arrangement is two cells of every six (dominoes on every other row, two
 * columns in three), which is 33.3%, and a random lay-down jams well below
 * that — measured at 24.8-25.6% over 200 seeds on the board sizes this ladder
 * uses. That is why `choosePairs` restarts instead of backtracking, and why
 * the schedule stops at 25%: the quota must be hit EXACTLY, because C_k
 * assumed it. A board two creatures light would not throw. It would simply
 * have its top gate one kill out of reach, on that seed only. Same failure
 * shape as the ragged cave's cell count, and the same answer — land on the
 * number or refuse the board.
 */

import type { Cell, Placement } from '../types.js';
import { noteBit } from '../notes.js';
import { type Rng, randInt, shuffle } from '../rng.js';

/**
 * Does the pairing rule hold on a board with this placement?
 *
 * The one question every reader of the rule has to ask — the generator, both
 * of Sweep's proofs, the honest player in `sim:spells`, and the renderer's
 * bonds — and the reason it is asked HERE rather than spelled out at each of
 * them. DOMINOES is PAIRS with a different deal, so it inherits every one of
 * those, and each site that tested `=== 'pairs'` directly was a place that
 * would have quietly handed a domino board none of the mode's deduction. That
 * is the "anything classifying ladders by X" failure this codebase has already
 * met twice, so it gets one answer instead of five.
 */
export function isPaired(placement: Placement): boolean {
  return placement === 'pairs' || placement === 'dominoes';
}

/**
 * Restarts allowed before a board is refused.
 *
 * A restart rather than a backtrack, because the failure is a jam rather than
 * a dead end: a greedy lay-down that ends short has usually spent its early
 * dominoes badly all over the board, and unwinding the last few would not
 * reach the ones that cost it. Measured on 30x16, 200 seeds a point: 40
 * restarts place an exact quota on every seed up to 26% density and on one
 * seed in four at 28%. Sixty buys margin on the bigger boards without being a
 * number anyone waits for — a board that needs more than this is a board the
 * schedule should not have asked for, and the ceiling below is where that is
 * said.
 */
const PAIR_ATTEMPTS = 60;

/**
 * The most creatures a pairing board may be asked for, as a share of the
 * cells they may stand on.
 *
 * Not a taste call and not the theoretical maximum: it is where a random
 * lay-down stops landing the quota reliably. The tuned ladder finishes at 25%
 * and this sits one point above it so that a schedule edited by hand fails
 * HERE, at the config boundary with the arithmetic in the message, rather than
 * as an occasional seed that cannot be placed.
 */
export const PAIR_MAX_DENSITY = 0.26;

/**
 * Lay down `total / 2` dominoes among `candidates`, no two touching.
 *
 * Adjacency arrives as a callback rather than being imported, which keeps this
 * module clear of `board.ts` — the same reason `checker.ts` is pure coordinate
 * arithmetic. It also means the rule gets hex, wrapped seams and cut-out
 * shapes for nothing, because `neighbours()` already knows about all three.
 *
 * Returns the occupied cells as flat indices, in no particular order; the
 * caller deals tiers into them. Pairing is tier-blind, so that deal is the
 * same shuffle-and-take every other placement uses, and the partner of a
 * tier 1 is as likely to be a tier 5 as anything else.
 *
 * The invariant holds BY CONSTRUCTION rather than by inspection. Placing a
 * domino closes both its cells and everything touching either of them, so a
 * later creature can never land beside an earlier one — and the cell a domino
 * starts from was itself required to be open, so it had no creature beside it
 * either. There is nothing to repair afterwards and nothing to verify, which
 * is the same reason the cave grows rather than being trimmed.
 */
export function choosePairs(
  candidates: readonly number[],
  neighboursOf: (flat: number) => readonly number[],
  total: number,
  rng: Rng,
): number[] {
  if (total % 2 !== 0) {
    throw new Error(
      `pairing needs an even number of creatures, asked for ${total} — ` +
        `every creature has exactly one partner, so an odd one has nobody`,
    );
  }
  if (total === 0) return [];
  if (total > candidates.length) {
    throw new Error(`pairing: ${total} creatures want ${candidates.length} cells`);
  }

  const allowed = new Set(candidates);
  const order = candidates.slice();

  for (let attempt = 0; attempt < PAIR_ATTEMPTS; attempt++) {
    shuffle(order, rng);
    const blocked = new Set<number>();
    const taken: number[] = [];

    for (const flat of order) {
      if (taken.length === total) break;
      if (blocked.has(flat)) continue;
      // A partner must be adjacent, must be somewhere a creature may stand,
      // and must not already be touching one.
      const free = neighboursOf(flat).filter((n) => allowed.has(n) && !blocked.has(n));
      if (free.length === 0) continue;
      const partner = free[randInt(rng, free.length)]!;

      taken.push(flat, partner);
      // Close the pair and everything around it. This is the whole invariant.
      for (const c of [flat, partner]) {
        blocked.add(c);
        for (const n of neighboursOf(c)) blocked.add(n);
      }
    }

    if (taken.length === total) return taken;
  }

  throw new Error(
    `pairing: could not place ${total} creatures in ${candidates.length} cells ` +
      `in ${PAIR_ATTEMPTS} attempts (${((100 * total) / candidates.length).toFixed(1)}% ` +
      `density; a random lay-down jams around 25%)`,
  );
}

/**
 * Every covered neighbour of this open cell is free to open — proven by the
 * pairing rule alone, without reading a single number off the board.
 *
 * `cell` must be an open creature; the two proofs are A and B at the top of
 * this file. It answers for the whole ring at once rather than per neighbour,
 * which is why `safeCells` can fold it straight into `proven`: on this board
 * "the ring is free" is exactly what that flag already means.
 *
 * It reads `level` and NOT `level + exerciseCharge`, for the same reason
 * nothing else in `safeCells` does — a borrowed level covers one fight, and a
 * proof handed to a whole ring would spend it several times over.
 */
export function ringIsFree(cell: Cell, ns: readonly Cell[], level: number): boolean {
  // Empty ground has no partner and proves nothing; its number is an ordinary
  // sum of up to four tiers and is read the ordinary way.
  if (cell.tier === 0) return false;

  // B. A creature beside a creature has met its partner, so everything else
  //    around it is empty ground. True at any level, which is what makes
  //    clearing one pair worth a crater of certainty rather than a foothold.
  //    An open cell with a tier is a known creature whether or not the player
  //    beat it, so this does not care about `alive`.
  if (ns.some((n) => n.open && n.tier > 0)) return true;

  // A. Otherwise the partner is still out there, and this cell's own number is
  //    its tier — nothing else borders a creature. Every covered neighbour is
  //    therefore either that partner or empty ground, and if the partner is
  //    within your level then all of them are free.
  return cell.num <= level;
}

/**
 * What a covered cell could hold by the pairing rule alone, as a note mask —
 * or null when no open creature touches it, and the rule says nothing yet.
 *
 * The same reading as `ringIsFree`, asked of one cell instead of a ring, and
 * it is what keeps the pencil from offering a hypothesis the board has already
 * refused. Beside an open creature, a covered cell is either that creature's
 * partner or empty ground, and the creature's own number IS the partner's
 * tier — so the candidates are {0, that number}. Two things narrow it to {0}:
 * the creature has already met its partner (proof B), or two open creatures
 * touch the cell, because a creature standing there would have two creature
 * neighbours.
 *
 * Sound in the only direction that matters: it may leave a tier in that the
 * numbers could rule out, but it never takes out the tier a cell really holds.
 * `test/pairs.test.ts` checks that on every covered cell of real boards played
 * part-way.
 */
export function pairCandidates(
  cell: Cell,
  neighboursOf: (c: Cell) => readonly Cell[],
): number | null {
  const mates = neighboursOf(cell).filter((n) => n.open && n.tier > 0);
  if (mates.length === 0) return null;
  if (mates.length > 1) return noteBit(0);
  const mate = mates[0]!;
  if (neighboursOf(mate).some((n) => n.open && n.tier > 0)) return noteBit(0);
  return noteBit(0) | noteBit(mate.num);
}

/**
 * What is wrong with a pairing, or null if nothing is.
 *
 * Exists for the tests rather than for play — the generator cannot produce a
 * bad pairing, so this is here to prove that claim on real boards rather than
 * to catch one. Kept beside the rule so the check and the thing it checks
 * cannot drift apart.
 */
export function pairingFault(
  occupied: readonly number[],
  neighboursOf: (flat: number) => readonly number[],
): string | null {
  const set = new Set(occupied);
  if (occupied.length !== set.size) return 'a cell was placed twice';
  if (set.size % 2 !== 0) return `${set.size} creatures cannot pair up`;
  for (const flat of set) {
    const mates = neighboursOf(flat).filter((n) => set.has(n));
    if (mates.length !== 1) {
      return `cell ${flat} has ${mates.length} creature neighbours, not 1`;
    }
  }
  return null;
}
