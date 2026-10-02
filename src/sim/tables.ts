/**
 * What the measurements in `cli/` share to print their tables: the seed of each board, the
 * average over runs, a share as a percentage, and the board range a command line names.
 */

/** The seed of a measurement's `s`-th board, the same in every command so their rows line up. */
export const seedAt = (s: number): number => s * 2654435761 + 11;

/** The average of `pick` over the items; 0 for none. */
export function mean<T>(items: readonly T[], pick: (item: T) => number): number {
  return items.reduce((a, item) => a + pick(item), 0) / Math.max(1, items.length);
}

/** A share from 0 to 1 as a whole percentage, "37%". */
export const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

/** The boards a command line names, `7-10` or one board `7`; undefined when it names none. */
export function boardRange(arg: string | undefined): [number, number] | undefined {
  const range = arg?.split('-').map(Number);
  return range ? [range[0]!, range[1] ?? range[0]!] : undefined;
}
