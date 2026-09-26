/**
 * The shapes that are a per-cell predicate of the bounding box. Parameters are in cells: the
 * donut's ring thickness and the cross's arm width. The others take none; they are outlines drawn
 * to fill the box, and each ladder keeps its box at one aspect ratio so the outline plays the same
 * on every board. `design/ladders.py` carries a copy of each predicate (`shape_present`), because
 * it must count a shape's cells before it can apportion creatures; the test that the engine's count
 * matches the ladder's guards the two copies.
 */

import { predicateShape } from './rule.js';

export const RECT_SHAPE = predicateShape('rect', () => true);

export const DONUT_SHAPE = predicateShape(
  'donut',
  (param, w, h, x, y) => x < param || y < param || x >= w - param || y >= h - param,
);

/**
 * The centre falls between two cells on an even width, so 36 across holds fewer cells than 35;
 * the ladder's continuation refuses a candidate whose C_k went backwards.
 */
export const CROSS_SHAPE = predicateShape(
  'cross',
  (param, w, h, x, y) =>
    Math.abs(x - (w - 1) / 2) <= param / 2 || Math.abs(y - (h - 1) / 2) <= param / 2,
);

export const DIAMOND_SHAPE = predicateShape(
  'diamond',
  (_param, w, h, x, y) =>
    Math.abs(x - (w - 1) / 2) / (w / 2) + Math.abs(y - (h - 1) / 2) / (h / 2) <= 1,
);

/**
 * A stepped pyramid: a two-cell cap, and every row one cell wider on each side than the row above,
 * so row `y` is `2y + 2` cells. It fills a box twice as wide as it is tall; a wider box leaves a
 * margin either side and a narrower one clips the base.
 */
export const PYRAMID_SHAPE = predicateShape(
  'pyramid',
  (_param, w, _h, x, y) => Math.abs(x - (w - 1) / 2) < y + 1,
);
