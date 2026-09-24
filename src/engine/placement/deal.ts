/**
 * The pieces of a deal the rules share: the shuffle-and-take and writing a dealt layout onto the
 * grid.
 */

import type { BoardConfig } from '../types.js';
import { shuffle } from '../rng.js';
import type { Deal, Pools } from './rule.js';

/** Every rule but the checkerboard: one pool, every cell and every tier in it. */
export const ONE_POOL: Pools = { of: () => 'any', forTier: () => 'any' };

/** The spawnable cells in a random order, which is where every rule's lay-down starts. */
export function shuffledPool(d: Deal): number[] {
  return shuffle(d.spawnable.slice(), d.rng);
}

/**
 * The shuffle-and-take: split the spawnable cells into the rule's pools, shuffle each in the order
 * the board first meets it, and deal `quantity` tier by tier from the front of the tier's pool.
 * `where` finishes the message for a pool too small for its tiers.
 */
export function dealByPool(d: Deal, pools: Pools, where: (pool: string) => string): void {
  const { width } = d.cfg;
  const byPool = new Map<string, number[]>();
  for (const flat of d.spawnable) {
    const key = pools.of(flat % width, Math.floor(flat / width));
    const pool = byPool.get(key);
    if (pool) pool.push(flat);
    else byPool.set(key, [flat]);
  }
  for (const pool of byPool.values()) shuffle(pool, d.rng);
  takeInOrder(d, byPool, (tier) => pools.forTier(tier), where);
}

/** Deal `quantity` tier by tier from the front of each tier's pool, which is already shuffled. */
export function takeInOrder(
  d: Deal,
  byPool: ReadonlyMap<string, readonly number[]>,
  poolOf: (tier: number) => string,
  where: (pool: string) => string,
): void {
  const { cfg } = d;
  const taken = new Map<string, number>();
  for (let t = 0; t < cfg.quantity.length; t++) {
    const count = cfg.quantity[t]!;
    const tier = t + 1;
    const key = poolOf(tier);
    const pool = byPool.get(key) ?? [];
    const at = taken.get(key) ?? 0;
    if (at + count > pool.length) {
      throw new Error(
        `board ${cfg.typeId}#${cfg.board}: tier ${tier} does not fit — ` +
          `${at + count} creatures want ${pool.length} cells` +
          where(key),
      );
    }
    for (let k = 0; k < count; k++) place(d, pool[at + k]!, tier);
    taken.set(key, at + count);
  }
}

/** The end of a too-small-pool message on a board with one pool: the shape left too few cells. */
export function shapeLeftTooFew(cfg: BoardConfig): () => string {
  return () =>
    ` shape "${cfg.shape}" leaves them, and a dungeon keeps its hallways and doorways clear`;
}

/** Write a layout a rule dealt itself (flat index to tier) onto the grid. */
export function placeDealt(d: Deal, dealt: ReadonlyMap<number, number>): void {
  for (const [flat, tier] of dealt) place(d, flat, tier);
}

function place(d: Deal, flat: number, tier: number): void {
  const cell = d.grid[Math.floor(flat / d.cfg.width)]![flat % d.cfg.width]!;
  cell.tier = tier;
  cell.alive = true;
}
