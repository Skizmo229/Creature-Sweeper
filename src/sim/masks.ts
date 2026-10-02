/**
 * Tiers as masks, the way the instruments hold a cell's candidates: bit `t` set means tier `t` is
 * possible, and bit 0 is empty ground, as in the engine's pencil (`src/engine/notes.ts`).
 */

import { allNotes } from '../engine/notes.js';

/** The mask of every tier from 0 to `tiers`: the engine's full pencil (`allNotes`). */
export function everyTier(tiers: number): number {
  return allNotes(tiers);
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

/** The highest tier in a mask, -1 for an empty one. */
export function highestTier(mask: number): number {
  return 31 - Math.clz32(mask);
}

/** The lowest tier in a mask, -1 for an empty one (the arithmetic gives it). */
export function lowestTier(mask: number): number {
  return 31 - Math.clz32(mask & -mask);
}

/** Whether a mask holds one tier at most: true for a single tier, and for the empty mask. */
export function isSingle(mask: number): boolean {
  return (mask & (mask - 1)) === 0;
}
