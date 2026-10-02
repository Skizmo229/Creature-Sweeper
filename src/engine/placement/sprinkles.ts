/**
 * The sprinkle placement: creatures stand in pairs, each beside its partner, pairs free to touch,
 * and the board shows where every one of them stands.
 *
 * SPRINKLE DONUT's rule. It is PAIRS with two things changed. Pairs may touch, so the occupied
 * cells are dominoes laid down anyhow rather than dominoes each alone in a ring of empty ground.
 * And every creature's place is shown, each pair drawn as one sprinkle across its two cells, so
 * the player knows where every creature is and has only its tier to find. Pairing is tier-blind,
 * as on PAIRS: a tier 1 may partner a tier 5, so the rule decides where and never what, and
 * `quantity` and C_k are untouched (docs/invariants.md).
 *
 * WHAT SHOWING THE PLACES HANDS THE PLAYER. A cell with no sprinkle is empty ground, free at any
 * level; a sprinkle is a creature, worth at least 1. So every number says both how much tier is
 * hidden behind it and how many creatures share it, which is what a Census says on ARCANE, here
 * for nothing: the biggest of k creatures behind a hidden sum s is at most s - (k - 1). That is
 * the rule's `cap`, and with `emptied`, the plain ground, it is all Sweep, the pencil and the
 * instruments need.
 *
 * WHAT THE PAIRING NO LONGER DOES. On PAIRS a creature's number is its partner's tier, because
 * nothing else it touches is a creature. Once pairs may touch that is gone: a creature's number
 * is the sum of its partner and of any pair beside it, an ordinary sum, so hovering a beaten one
 * shows it as on any board, and none of PAIRS's proofs apply (`groups` is null). The sprinkle is
 * what the pairing is for here: it is how the board looks, and it tells two touching pairs apart.
 */

import type { BoardConfig, Cell } from '../types.js';
import type { Grid } from '../grid.js';
import { noteBit } from '../notes.js';
import { type Rng, randInt, shuffle } from '../rng.js';
import { ONE_POOL, readDealt, shapeLeftTooFew, shuffledPool, takeInOrder } from './deal.js';
import {
  type Deal,
  NO_RING_PROOF,
  PLAIN_DISPLAY,
  type PlacementRow,
  type PlacementRule,
  type RuleView,
  boardName,
} from './rule.js';

/**
 * Restarts allowed before a board is refused. With pairs free to touch, a lay-down jams only where
 * a free cell is left with every neighbour taken, which never happened below
 * `SPRINKLE_MAX_DENSITY`, so this is margin rather than a working budget; `choosePairs` needs its
 * sixty.
 */
const SPRINKLE_ATTEMPTS = 20;

/**
 * The most creatures a sprinkle board may be asked for, as a share of the cells they may stand
 * on. Measured on the donut's five box sizes, 300 seeds each (26 September 2026): a random
 * lay-down landed the quota on its first attempt on every seed up to 90%; at 92% one seed in ten
 * needed a second or third, and at 94% most needed several, up to 37. The ladder runs far below
 * this, which is here so that a schedule edited by hand fails at the config boundary rather than
 * as a seed that cannot be placed.
 */
const SPRINKLE_MAX_DENSITY = 0.9;

/**
 * Lay `total / 2` pairs among `candidates`, each a cell and one of its neighbours, pairs free to
 * touch. Returns them as `[cell, partner]` flat indices.
 *
 * Greedy and restarted rather than backtracked, as `choosePairs` is: the cells are visited in a
 * random order and each one still free is given a random free neighbour. A partner is any
 * neighbour through `neighbours()`, a diagonal one included, so a sprinkle lies at any of four
 * angles, as PAIRS's pairs do.
 */
export function layTouchingPairs(
  candidates: readonly number[],
  neighboursOf: (flat: number) => readonly number[],
  total: number,
  rng: Rng,
): Array<[number, number]> {
  if (total % 2 !== 0) {
    throw new Error(
      `sprinkles need an even number of creatures, asked for ${total}: every creature has ` +
        `exactly one partner, so an odd one has nobody`,
    );
  }
  if (total > candidates.length) {
    throw new Error(`sprinkles: ${total} creatures want ${candidates.length} cells`);
  }
  const allowed = new Set(candidates);
  const order = candidates.slice();

  for (let attempt = 0; attempt < SPRINKLE_ATTEMPTS; attempt++) {
    shuffle(order, rng);
    const taken = new Set<number>();
    const pairs: Array<[number, number]> = [];
    for (const flat of order) {
      if (pairs.length * 2 === total) break;
      if (taken.has(flat)) continue;
      const free = neighboursOf(flat).filter((n) => allowed.has(n) && !taken.has(n));
      if (free.length === 0) continue;
      const partner = free[randInt(rng, free.length)]!;
      taken.add(flat);
      taken.add(partner);
      pairs.push([flat, partner]);
    }
    if (pairs.length * 2 === total) return pairs;
  }

  throw new Error(
    `sprinkles: could not pair ${total} creatures in ${candidates.length} cells in ` +
      `${SPRINKLE_ATTEMPTS} attempts (${((100 * total) / candidates.length).toFixed(1)}% density)`,
  );
}

/**
 * Where before what, as on PAIRS: the pairs are laid first, each cell told where its partner
 * stands, and the ordinary shuffle-and-take deals the tiers into exactly their cells, so the rule
 * never learns what a tier is. The cells are shuffled again before the deal, or tier 1 would go to
 * the pairs that happened to be laid first.
 */
function dealSprinkles(d: Deal): void {
  const { width } = d.cfg;
  const total = d.cfg.quantity.reduce((a, b) => a + b, 0);
  const pairs = layTouchingPairs(shuffledPool(d), (flat) => d.neighboursOf(flat), total, d.rng);
  const at = (flat: number): Cell => d.grid[Math.floor(flat / width)]![flat % width]!;
  for (const [a, b] of pairs) {
    const cellA = at(a);
    const cellB = at(b);
    cellA.partner = { x: cellB.x, y: cellB.y };
    cellB.partner = { x: cellA.x, y: cellA.y };
  }
  const cells = shuffle(pairs.flat(), d.rng);
  takeInOrder(d, new Map([['any', cells]]), ONE_POOL.forTier, shapeLeftTooFew(d.cfg));
}

/**
 * The most tier `cell` can hold when the covered cells `among` together hide `hidden`: nothing on
 * plain ground, and on a sprinkle the whole sum less one for every other creature sharing it, each
 * of which is worth at least 1. Sweep's Census bound, read off the sprinkles.
 */
export function shownCap(cell: Cell, hidden: number, among: readonly Cell[]): number {
  if (cell.tier === 0) return 0;
  let others = 0;
  for (const n of among) if (n !== cell && n.tier > 0) others++;
  return hidden - others;
}

/** Every covered cell with no sprinkle: empty ground, shown as such. */
function plainGround(view: RuleView): ReadonlySet<Cell> {
  const out = new Set<Cell>();
  for (const row of view.grid) {
    for (const cell of row) if (cell.present && !cell.open && cell.tier === 0) out.add(cell);
  }
  return out;
}

/**
 * What the pencil offers on a covered cell: what the board shows it is. Empty ground on plain
 * glaze, and any tier but empty ground on a sprinkle. Not the player's deduction (decision 0010):
 * the rule refuses these, because the board has drawn the answer.
 */
function shownCandidates(cell: Cell, view: RuleView): number {
  const everyTier = (1 << (view.config.tiers + 1)) - 1;
  return cell.tier === 0 ? noteBit(0) : everyTier & ~noteBit(0);
}

/**
 * The rule's structural requirements: an even total, because every creature has a partner, and a
 * density the lay-down lands reliably. And no wrapped edge, because a pair across a seam would be
 * a sprinkle drawn a board apart.
 */
function validateSprinkles(row: PlacementRow): void {
  const where = boardName(row);
  const total = row.quantity.reduce((a, b) => a + b, 0);
  if (total % 2 !== 0) {
    throw new Error(
      `${where}: ${total} creatures cannot pair up — every creature has a partner, ` +
        `so the total must be even`,
    );
  }
  const share = total / row.cells;
  if (share > SPRINKLE_MAX_DENSITY) {
    throw new Error(
      `${where}: ${total} creatures on ${row.cells} cells is ${(100 * share).toFixed(1)}%, ` +
        `past the ${(100 * SPRINKLE_MAX_DENSITY).toFixed(0)}% the pairs are laid down reliably at`,
    );
  }
  if (row.wrap !== undefined && row.wrap !== 'none') {
    throw new Error(`${where}: a pair across a wrapped seam would be a sprinkle a board apart`);
  }
}

/**
 * What is wrong with a sprinkle board, or null if nothing is: a creature without a partner, a
 * partner that is not a creature beside it and paired back, or empty ground with a partner.
 */
function sprinkleFault(grid: Grid, cfg: BoardConfig): string | null {
  const { tierAt, neighboursOf } = readDealt(grid, cfg);
  if (tierAt.size % 2 !== 0) return `${tierAt.size} creatures cannot pair up`;
  const flat = (p: { x: number; y: number }): number => p.y * cfg.width + p.x;
  for (const cell of grid.flat()) {
    if (!cell.present) continue;
    const at = `(${cell.x},${cell.y})`;
    const partner = cell.partner;
    if (cell.tier === 0) {
      if (partner) return `empty ground at ${at} has a partner`;
      continue;
    }
    if (!partner) return `the creature at ${at} has no partner`;
    const mate = grid[partner.y]?.[partner.x];
    if (!mate?.present || mate.tier === 0) return `the creature at ${at} is paired with nothing`;
    if (!mate.partner || flat(mate.partner) !== flat(cell)) {
      return `the creature at ${at} is not its partner's partner`;
    }
    if (!neighboursOf(flat(cell)).includes(flat(partner))) {
      return `the creature at ${at} is not beside its partner`;
    }
  }
  return null;
}

/** The sprinkle placement: pairs free to touch, every creature's place shown. */
export const SPRINKLES_RULE: PlacementRule = {
  id: 'sprinkles',
  validate: validateSprinkles,
  opening: 'auto',
  deal: dealSprinkles,
  patrols: false,
  coveredCanBeEmpty: true,
  candidates: shownCandidates,
  guessFree: false,
  cap: shownCap,
  ringProof: NO_RING_PROOF,
  emptied: plainGround,
  display: { ...PLAIN_DISPLAY, showsCreatures: true },
  pools: ONE_POOL,
  groups: null,
  fault: sprinkleFault,
};
