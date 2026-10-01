/**
 * Augur's answer: the tiers of the creatures a ring hides, strongest first. In a module of its own
 * because the spell writes it and Sweep, the players and the board read it.
 */

import type { Cell } from './types.js';

/**
 * An Augur's answer over a ring: the covered creatures' tiers, strongest first. Open neighbours
 * are left out because the board already shows them (decision 0062).
 */
export function hiddenTiers(ring: readonly Cell[]): number[] {
  return ring
    .filter((n) => !n.open && n.tier > 0)
    .map((n) => n.tier)
    .sort((a, b) => b - a);
}

/**
 * What an Augur cast on this cell says now: the answer less every creature opened since, which is
 * the ring's covered creatures as it stands. A ring only loses covered cells, and each one it loses
 * shows its tier, so reading it afresh tells nothing the board does not. Null where none was cast.
 */
export function augurNow(cell: Cell, ring: readonly Cell[]): number[] | null {
  return cell.augur === null ? null : hiddenTiers(ring);
}
