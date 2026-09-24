/**
 * Dealing creatures into a board: the shape, then the placement rule, then the numbers.
 */

import type { BoardConfig, Cell } from './types.js';
import type { Rng } from './rng.js';
import { placementRule } from './placement/registry.js';
import { type Grid, type Mask, computeNumbers, makeCell, neighbours } from './grid.js';
import { buildShape } from './shape.js';

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
  let spawnable: Mask | null = null;
  if (cfg.shape !== 'rect') {
    const shape = buildShape(cfg.shape, cfg.shapeParam, cfg.width, cfg.height, rng);
    for (let y = 0; y < cfg.height; y++)
      for (let x = 0; x < cfg.width; x++) {
        grid[y]![x]!.present = shape.present[y]![x]!;
      }
    spawnable = shape.spawnable;
  }

  const cells: number[] = [];
  for (let i = 0; i < cfg.width * cfg.height; i++) {
    const y = Math.floor(i / cfg.width);
    const x = i % cfg.width;
    if (!grid[y]![x]!.present) continue;
    if (spawnable && !spawnable[y]![x]) continue;
    cells.push(i);
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
