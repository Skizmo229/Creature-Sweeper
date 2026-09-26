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

/**
 * The outlines below are measured from the box's centre in cells, cell centres at `x + 0.5`, and
 * use nothing but arithmetic and square roots. Those round the same way in JavaScript and in
 * Python; a sine or an arctangent may not, and `ladders.py`'s copy has to leave the same cells to
 * the last one.
 */
const fromCentre = (w: number, h: number, x: number, y: number) => ({
  dx: x + 0.5 - w / 2,
  dy: y + 0.5 - h / 2,
});

/**
 * The gear's proportions, as shares of its tip radius (half the box's shorter side), from the
 * owner's drawing: eight teeth, one pointing straight up, tapering from root to tip, round a hole.
 */
const GEAR = { root: 0.82, hole: 0.33, rootHalfWidth: 0.16, tipHalfWidth: 0.12 };

/** The eight teeth's directions, from straight up, clockwise, as exact unit vectors. */
const GEAR_TEETH: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [1, 0],
  [Math.SQRT1_2, Math.SQRT1_2],
  [0, 1],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

export const GEAR_SHAPE = predicateShape('gear', (_param, w, h, x, y) => {
  const { dx, dy } = fromCentre(w, h, x, y);
  const tip = Math.min(w, h) / 2;
  const hole = GEAR.hole * tip;
  const root = GEAR.root * tip;
  const r2 = dx * dx + dy * dy;
  if (r2 < hole * hole || r2 > tip * tip) return false;
  if (r2 <= root * root) return true;
  // Out among the teeth: inside one if close enough to its centre line, which narrows outward.
  const along = (Math.sqrt(r2) - root) / (tip - root);
  const half = tip * (GEAR.rootHalfWidth + (GEAR.tipHalfWidth - GEAR.rootHalfWidth) * along);
  return GEAR_TEETH.some(
    ([ux, uy]) => dx * ux + dy * uy > 0 && Math.abs(dx * uy - dy * ux) <= half,
  );
});
