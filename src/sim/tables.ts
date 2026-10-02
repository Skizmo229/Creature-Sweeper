/**
 * What the measurements in `cli/` share to read their command lines and print their tables: how
 * many seeds a command asks for, the seed of each board, the average over runs, a share as a
 * percentage, and the board range a command line names.
 */

/**
 * How many seeds (boards, runs or trials) a command line asks for: `arg`, or `fallback` when it
 * names none. A table of averages over no boards measures nothing, so anything but a whole
 * number from 1 stops the command with its `usage` line and exit code 2.
 */
export function seedCount(arg: string | undefined, fallback: number, usage: string): number {
  const n = arg === undefined ? fallback : Number(arg);
  if (Number.isInteger(n) && n >= 1) return n;
  console.error(`usage: ${usage}`);
  return process.exit(2);
}

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
