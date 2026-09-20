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

import type { Cell } from './types.js';

/**
 * A cell's colour. Light squares take even tiers, dark squares take odd.
 *
 * `(x + y) % 2` and nothing else, so it is a fact about the coordinates rather
 * than about the board, and the renderer, the generator and the proof all get
 * the same answer without passing state around.
 */
export type Shade = 'light' | 'dark';

export function shadeAt(x: number, y: number): Shade {
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
export function allowsTier(x: number, y: number, tier: number): boolean {
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
export function sideTotals(quantity: readonly number[]): { light: number; dark: number } {
  let light = 0;
  let dark = 0;
  for (let i = 0; i < quantity.length; i++) {
    // quantity[i] is tier i + 1.
    if ((i + 1) % 2 === 0) light += quantity[i]!;
    else dark += quantity[i]!;
  }
  return { light, dark };
}
