/**
 * Dealing creatures into a board: the shape, then the placement rule, then the numbers.
 */

import type { BoardConfig, Cell } from './types.js';
import type { Rng } from './rng.js';
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
