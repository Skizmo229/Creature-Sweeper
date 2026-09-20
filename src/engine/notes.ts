/**
 * Pencil marks — a cell's candidate tiers, held as a bitmask.
 *
 * A mark says what a cell *is*; notes say what it could still be. That is a
 * different kind of claim and it needs different arithmetic, which is why it
 * is a set rather than another number.
 *
 * Bit `t` means tier `t` is a candidate, and **bit 0 is empty ground** — a
 * perfectly ordinary candidate, and the reason the mask is indexed from 0
 * rather than from tier 1 the way `marksPlaced` is. Tiers never exceed a
 * handful, so a single number holds the set with room to spare.
 *
 * The empty mask means "no notes here", NOT "nothing is possible". Every
 * reader has to test for it first, because treating an empty set as a bound
 * would say the cell is both provably safe (no candidate exceeds your level)
 * and certainly fatal (no candidate is at or below it). Hence `hasNotes`.
 */

/** The mask for a single tier. Tier 0 is empty ground and gets bit 0. */
export function noteBit(tier: number): number {
  return 1 << tier;
}

/** True when the player has actually pencilled something in. */
export function hasNotes(mask: number): boolean {
  return mask !== 0;
}

export function hasNote(mask: number, tier: number): boolean {
  return (mask & noteBit(tier)) !== 0;
}

export function withNote(mask: number, tier: number): number {
  return mask | noteBit(tier);
}

export function withoutNote(mask: number, tier: number): number {
  return mask & ~noteBit(tier);
}

export function toggleNote(mask: number, tier: number): number {
  return mask ^ noteBit(tier);
}

/** Every tier in the mask, ascending. */
export function noteTiers(mask: number): number[] {
  const out: number[] = [];
  for (let t = 0; mask >>> t; t++) if (hasNote(mask, t)) out.push(t);
  return out;
}

export function noteCount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m >>>= 1) n += m & 1;
  return n;
}

/**
 * The strongest tier the player thinks this cell might hold — the bound that
 * decides whether the cell is safe. Returns -1 for an empty mask, which is
 * never a valid tier, so a caller that forgets `hasNotes` fails closed.
 */
export function highestNote(mask: number): number {
  let hi = -1;
  for (let t = 0; mask >>> t; t++) if (hasNote(mask, t)) hi = t;
  return hi;
}

/**
 * The weakest tier the player thinks this cell might hold — the bound that
 * decides whether the cell is certainly dangerous. Returns -1 for an empty
 * mask, for the same fail-closed reason.
 */
export function lowestNote(mask: number): number {
  for (let t = 0; mask >>> t; t++) if (hasNote(mask, t)) return t;
  return -1;
}

/** Exactly one candidate left, which is a claim in all but name. */
export function soleNote(mask: number): number | null {
  return mask !== 0 && (mask & (mask - 1)) === 0 ? lowestNote(mask) : null;
}
