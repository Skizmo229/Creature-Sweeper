/**
 * Dealing creatures into a board: the shape, then the placement rule, then the numbers.
 */

import type { BoardConfig, Cell } from './types.js';
import { type Rng, mulberry32 } from './rng.js';
import { placementRule } from './placement/registry.js';
import { type Grid, computeNumbers, makeCell, neighbours } from './grid.js';
import { shapeRule } from './shape/registry.js';

/**
 * Build a board: cut the shape, hand the cells a creature may stand on to the placement rule to
 * deal `quantity` into, then write every cell's number.
 *
 * Those cells are every present cell on most boards and room floor only in a dungeon. The rule
 * decides where the creatures stand and never how many (`PlacementRule.deal`).
 */
export function generateGrid(cfg: BoardConfig, rng: Rng): Grid {
  const grid: Grid = [];
  for (let y = 0; y < cfg.height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < cfg.width; x++) row.push(makeCell(x, y));
    grid.push(row);
  }

  // Everywhere but the dungeon these are the same mask.
  const { present, spawnable } = shapeRule(cfg.shape).build(
    cfg.shapeParam,
    cfg.width,
    cfg.height,
    rng,
  );
  const cells: number[] = [];
  for (let i = 0; i < cfg.width * cfg.height; i++) {
    const y = Math.floor(i / cfg.width);
    const x = i % cfg.width;
    grid[y]![x]!.present = present[y]![x]!;
    if (present[y]![x] && spawnable[y]![x]) cells.push(i);
  }

  placementRule(cfg.placement).deal({
    grid,
    cfg,
    spawnable: cells,
    rng,
    neighboursOf: (flat) =>
      neighbours(grid, flat % cfg.width, Math.floor(flat / cfg.width), cfg.topology, cfg.wrap).map(
        (n) => n.y * cfg.width + n.x,
      ),
  });
  computeNumbers(grid, cfg.topology, cfg.wrap);
  return grid;
}

/** How many seeds a deal tries, the one asked for first, before a refusal is let through. */
const DEAL_SEEDS = 5;

/**
 * The grid from a seed, or from the nearest seed after it that the placement rule accepts. A rule
 * can refuse a seed, and SUDOKU's refuses one in a few hundred at the hard end of its ladder, so
 * the seed after it is tried, and the one after, up to `DEAL_SEEDS` in all, before the refusal
 * is let through (decision 0081). The seed asked for is tried untouched, so every board dealt
 * before this existed is dealt the same; and the same seeds are tried in the same order, so a
 * board is still a function of the seed it was asked for. `deal` is the dealer, for a test that
 * refuses.
 */
export function dealGrid(cfg: BoardConfig, seed: number, deal = generateGrid): Grid {
  let refused: unknown;
  for (let k = 0; k < DEAL_SEEDS; k++) {
    try {
      return deal(cfg, mulberry32(k === 0 ? seed : (seed + k) >>> 0));
    } catch (e) {
      refused = e;
    }
  }
  throw refused;
}
