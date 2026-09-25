/**
 * The checkerboard placement: a cell's colour decides a creature's parity.
 *
 * Light squares hold EVEN tiers, dark squares hold ODD ones, and either colour
 * may be empty ground. That one sentence is the whole mode, and it is worth
 * being precise about what it does and does not say.
 *
 * It does NOT say a cell's colour tells you whether there is a creature there.
 * Tier 0 is allowed on both colours, which is what keeps the mode a sweeper
 * rather than a colouring puzzle — otherwise every light cell on an odd board
 * would be provably empty and the board would solve itself.
 *
 * What it says is that the tiers behind a number come from a known half of the
 * alphabet, and that is a real and compounding deduction, because a cell's
 * number is a SUM. The sum of the covered LIGHT neighbours is always even, so
 * the covered DARK ones carry the whole of the number's parity:
 *
 *     hidden ≡ (how many dark neighbours hold a creature)   (mod 2)
 *
 * Everything the player gets out of this board comes off that line. It is
 * strongest where it is cheapest: a number with exactly one covered dark
 * neighbour and an even hidden sum has proven that cell is empty ground, at
 * any level, without knowing anything else about the board.
 *
 * `hiddenCap` is that reasoning written as the one thing Sweep needs — the
 * most tier a single covered cell could be hiding — so the engine can act on
 * the rule instead of leaving the player to translate it into marks by hand.
 * That was Census's whole problem, and it is not worth having twice.
 *
 * WHAT THIS DOES NOT TOUCH. The four load-bearing facts are all statements
 * about EXP and levels, and nothing here changes which creatures a board
 * carries or what they are worth — only which cells they may stand on. C_k is
 * a sum over `quantity`, so it is untouched; the zero-damage guarantee follows
 * from C_k as it always did; no creature is removed. The balance rule below is
 * about where they go, never how many there are.
 */

import type { Cell } from '../types.js';
import { dealByPool } from './deal.js';
import {
  NOTHING_EMPTIED,
  NO_RING_PROOF,
  PLAIN_DISPLAY,
  type PlacementRow,
  type PlacementRule,
  type Pools,
  boardName,
} from './rule.js';

/**
 * A cell's colour. Light squares take even tiers, dark squares take odd.
 *
 * `(x + y) % 2` and nothing else, so it is a fact about the coordinates rather
 * than about the board, and the renderer, the generator and the proof all get
 * the same answer without passing state around.
 */
export type Shade = 'light' | 'dark';

function shadeAt(x: number, y: number): Shade {
  return (x + y) % 2 === 0 ? 'light' : 'dark';
}

export function shadeOf(cell: Cell): Shade {
  return shadeAt(cell.x, cell.y);
}

/** Which colour a tier belongs on. Tier 0 is empty ground and belongs on both. */
export function shadeForTier(tier: number): Shade {
  return tier % 2 === 0 ? 'light' : 'dark';
}

/** Could this cell be holding this tier, by the colour rule alone? */
function allowsTier(x: number, y: number, tier: number): boolean {
  return tier === 0 || shadeForTier(tier) === shadeAt(x, y);
}

/**
 * The most tier a single covered cell could be hiding, given the sum hidden
 * behind a number and how many of that number's covered neighbours are dark.
 *
 * This is a PROOF, not a heuristic — it is the largest value that survives
 * the parity argument above — so Sweep may act on it exactly as it acts on
 * `hidden <= level`, which it strictly generalises (the cap is never larger
 * than the hidden sum).
 *
 * The three cases, all from `hidden ≡ nonzero dark neighbours (mod 2)`:
 *
 *   light cell   — its tier is even, so the most it can be is the largest
 *                  even number that fits under the hidden sum.
 *   dark, odd    — the hidden sum is odd, so some dark cell holds a creature
 *                  and it may as well be this one: the whole sum, which is
 *                  itself odd and so a legal tier for a dark square.
 *   dark, even   — an EVEN number of dark cells hold creatures. With two or
 *                  more to pair up, this one can hold everything but the 1 its
 *                  partner must carry. With only one dark cell in sight there
 *                  is nothing to pair with, so the count must be zero and the
 *                  cell is PROVEN EMPTY GROUND — the cheap, frequent deduction
 *                  that makes this board play differently from a rectangle.
 *
 * `darkCovered` counts every covered dark neighbour, marked ones included: a
 * mark is the player's claim about a cell, and the cell is still there holding
 * whatever it holds. Counting only the unmarked ones would turn a proof into
 * something that quietly depends on annotation.
 */
export function hiddenCap(shade: Shade, hidden: number, darkCovered: number): number {
  if (hidden <= 0) return 0;
  if (shade === 'light') return hidden - (hidden % 2);
  if (hidden % 2 === 1) return hidden;
  return darkCovered <= 1 ? 0 : hidden - 1;
}

/**
 * How the ladder must split a board's creatures between the two colours.
 *
 * The mode promises as near as possible the same number of enemies per side,
 * and since odd tiers have nowhere to go but dark squares that promise is a
 * constraint on `quantity` rather than on placement: the odd tiers must total
 * within one of the even tiers. `ladders.py` apportions each half separately
 * to hit it, and `config.ts` refuses a board that does not — a board a point
 * out of balance would still generate, it would just quietly be a different
 * mode from the one that was tuned.
 */
function sideTotals(quantity: readonly number[]): { light: number; dark: number } {
  let light = 0;
  let dark = 0;
  for (let i = 0; i < quantity.length; i++) {
    // quantity[i] is tier i + 1.
    if ((i + 1) % 2 === 0) light += quantity[i]!;
    else dark += quantity[i]!;
  }
  return { light, dark };
}

/**
 * The checkerboard's structural requirements. Two colours, so a hex grid is out on arithmetic
 * rather than taste: a hexagonal tiling cannot be two-coloured. A cut-out shape is out because a
 * mask splits between the colours by its silhouette, which for a cave depends on the seed, and the
 * mode promises an even split. An even cell count makes the two colours exactly equal, so the
 * balance is a statement about the creatures alone. A wrapped axis must be even, or the seam
 * joins two squares of one colour. And the balance promise itself, checked rather than assumed:
 * `ladders.py` apportions each parity its own half of the budget (`sideTotals`).
 */
function validateChecker(row: PlacementRow): void {
  const where = boardName(row);
  if (row.topology === 'hex') {
    throw new Error(
      `${row.typeId}: a hex tiling has no two-colouring, so there is no checkerboard`,
    );
  }
  if (row.shape && row.shape !== 'rect') {
    throw new Error(
      `${row.typeId}: the checkerboard needs a rectangle — a "${row.shape}" mask splits ` +
        `between the colours by its silhouette, and the mode promises an even split`,
    );
  }
  if ((row.width * row.height) % 2 !== 0) {
    throw new Error(
      `${where}: ${row.width}x${row.height} is an odd number of cells, so one colour has ` +
        `a square more than the other`,
    );
  }
  const wrap = row.wrap ?? 'none';
  if (wrap !== 'none' && row.width % 2 !== 0) {
    throw new Error(`${where}: joining left to right across an odd width meets two light squares`);
  }
  if (wrap === 'both' && row.height % 2 !== 0) {
    throw new Error(`${where}: joining top to bottom across an odd height meets two light squares`);
  }

  const { light, dark } = sideTotals(row.quantity);
  if (Math.abs(light - dark) > 1) {
    throw new Error(
      `${where}: ${dark} odd-tier creatures against ${light} even-tier ones. ` +
        `The colours must carry within one of each other`,
    );
  }
  const half = (row.width * row.height) / 2;
  if (dark > half || light > half) {
    throw new Error(
      `${where}: ${Math.max(light, dark)} creatures of one parity want ` +
        `${half} squares of that colour`,
    );
  }
}

/** One pool per colour: a tier is dealt only onto squares of its own parity. */
const COLOURS: Pools = { of: shadeAt, forTier: shadeForTier };

export const CHECKER_RULE: PlacementRule = {
  id: 'checker',
  validate: validateChecker,
  opening: 'auto',
  deal: (d) =>
    dealByPool(
      d,
      COLOURS,
      (shade) => ` on the ${shade} squares, which is every tier of that parity`,
    ),
  coveredCanBeEmpty: true,
  // The square's colour: the pencil refuses the other parity. Marks are not refused, by decision.
  candidates: (cell, view) => {
    let mask = 0;
    for (let t = 0; t <= view.config.tiers; t++) if (allowsTier(cell.x, cell.y, t)) mask |= 1 << t;
    return mask;
  },
  guessFree: false,
  // Counted over every cell sharing the sum, marked or not: the parity argument is about what the
  // cells are, and leaving the marked ones out would make a proof depend on annotation.
  cap: (cell, hidden, among) =>
    hiddenCap(shadeOf(cell), hidden, among.filter((c) => shadeOf(c) === 'dark').length),
  ringProof: NO_RING_PROOF,
  emptied: NOTHING_EMPTIED,
  // The light squares are washed, which is also the half that holds the even tiers.
  display: { ...PLAIN_DISPLAY, washes: (cell) => shadeOf(cell) === 'light' },
};
