/**
 * Seeded, deterministic random numbers.
 *
 * Every board in Creature Sweeper is a pure function of (config, seed). That
 * buys three things: shareable board seeds, reproducible bug reports, and
 * regression tests that do not flake. `Math.random` gives none of them, so it
 * is never used in the engine.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, and good enough for board layout. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a board nobody asked to replay. */
export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/** Integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Fisher-Yates, in place. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}
