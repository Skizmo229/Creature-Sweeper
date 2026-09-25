/**
 * Which cells of the bounding box exist for a board's shape, and which of those may hold a
 * creature. Every shape but the cave and the dungeon is a per-cell predicate; those two are grown
 * from the seed to an exact cell count (`docs/modes.md`).
 */

import type { BoardShape } from './types.js';
import type { Rng } from './rng.js';
import { type Mask, blankMask } from './grid.js';
import { caveMask } from './shape/cave.js';
import { dungeonMap } from './shape/dungeon.js';

/**
 * Does this cell of the bounding box exist, for the given shape?
 *
 * Shape parameters are in cells: `param` is the donut's ring thickness and the
 * cross's arm width. Diamond takes none — it is the inscribed rhombus.
 *
 * Cave and dungeon are deliberately absent here: their masks depend on the
 * seed, so they are not per-cell predicates at all. Everything that needs a
 * mask goes through `buildMask`, which is the only caller of this function.
 */
function isPresent(
  shape: BoardShape,
  param: number,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  switch (shape) {
    case 'donut':
      return x < param || y < param || x >= w - param || y >= h - param;
    case 'cross':
      return Math.abs(x - cx) <= param / 2 || Math.abs(y - cy) <= param / 2;
    case 'diamond':
      return Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2) <= 1;
    case 'cave':
    case 'dungeon':
      throw new Error(`${shape} has no per-cell predicate — it is seeded, use buildMask`);
    case 'rect':
    default:
      return true;
  }
}

/**
 * How many cells a shape actually leaves. The ladder data must agree.
 *
 * For cave and dungeon this is the parameter itself rather than a count of
 * anything: the mask is built to hit that number exactly, on every seed. See
 * `caveMask` and `dungeonMask`.
 */
export function presentCellCount(shape: BoardShape, param: number, w: number, h: number): number {
  if (shape === 'cave' || shape === 'dungeon') return param;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (isPresent(shape, param, w, h, x, y)) n++;
    }
  return n;
}

/**
 * Which cells exist, and which of those a creature may be dealt into.
 *
 * The two are the same thing on every shape but the dungeon, where hallways
 * and doorways are map you can walk but never map a creature stands on. That
 * is the one place the distinction exists, so it is carried here rather than
 * on the cell: a `Cell` would then have a field that is a copy of `present` on
 * sixteen of seventeen ladders.
 */
export function buildShape(
  shape: BoardShape,
  param: number,
  w: number,
  h: number,
  rng: Rng,
): { present: Mask; spawnable: Mask; hall: Mask } {
  if (shape === 'dungeon') return dungeonMap(w, h, param, rng);
  const present = shape === 'cave' ? caveMask(w, h, param, rng) : blankMask(w, h);
  if (shape !== 'cave') {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        present[y]![x] = isPresent(shape, param, w, h, x, y);
      }
  }
  return { present, spawnable: present, hall: blankMask(w, h) };
}
