/**
 * The shapes that are a per-cell predicate of the bounding box. Parameters are in cells: the
 * donut's ring thickness and the cross's arm width. The others take none; they are outlines drawn
 * to fill the box, and each ladder keeps its box at one aspect ratio so the outline plays the same
 * on every board. `design/ladders.py` carries a copy of each predicate (`shape_present`), because
 * it must count a shape's cells before it can apportion creatures; the test that the engine's count
 * matches the ladder's guards the two copies.
 */

import { type ShapeRule, predicateShape } from './rule.js';

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

/**
 * A playing card, in a box kept at a card's 5:7: rounded corners, and four suit-shaped holes where
 * a Four's pips sit, spade and heart above, diamond and club below and upside down, as they are
 * printed. Proportions are shares of the box's width, and each suit is drawn in a pip's own
 * coordinates, `u` across and `v` down, each running -1 to 1 over the pip.
 */
const CARD = { corner: 0.09, pip: 0.11, cols: [0.28, 0.72], rows: [0.25, 0.75] } as const;

/** The classic heart curve, point down, in its own units (about 2.3 across and tall). */
function inHeartCurve(x: number, y: number): boolean {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

/** A spade's or a club's stem: a wedge from `top` to the pip's foot. */
function inStem(u: number, v: number, top: number): boolean {
  return v >= top && v <= 1 && Math.abs(u) <= 0.12 + (0.35 * (v - top)) / (1 - top);
}

/** A club's three lobes and a core between them, without which one cell is left stranded. */
const CLUB_LOBES: ReadonlyArray<readonly [number, number]> = [
  [0, -0.48],
  [-0.48, 0.18],
  [0.48, 0.18],
  [0, 0],
];
const CLUB_LOBE = 0.46;

const SUITS: Record<'spade' | 'heart' | 'diamond' | 'club', (u: number, v: number) => boolean> = {
  spade: (u, v) => inHeartCurve(u * 1.2, (v + 0.275) * 1.545 + 0.12) || inStem(u, v, 0.2),
  heart: (u, v) => inHeartCurve(u * 1.12, -v * 1.12 + 0.12),
  diamond: (u, v) => Math.abs(u) / 0.72 + Math.abs(v) <= 1,
  club: (u, v) =>
    CLUB_LOBES.some(
      ([cx, cy]) => (u - cx) * (u - cx) + (v - cy) * (v - cy) <= CLUB_LOBE * CLUB_LOBE,
    ) || inStem(u, v, 0.1),
};

/** A Four's pips: column, row (the lower row printed upside down), suit. */
const CARD_PIPS = [
  [0, 0, SUITS.spade],
  [1, 0, SUITS.heart],
  [0, 1, SUITS.diamond],
  [1, 1, SUITS.club],
] as const;

export const CARD_SHAPE = predicateShape('card', (_param, w, h, x, y) => {
  const xc = x + 0.5;
  const yc = y + 0.5;
  const corner = CARD.corner * w;
  const nx = Math.min(Math.max(xc, corner), w - corner);
  const ny = Math.min(Math.max(yc, corner), h - corner);
  if ((xc - nx) * (xc - nx) + (yc - ny) * (yc - ny) > corner * corner) return false;
  const size = CARD.pip * w;
  return !CARD_PIPS.some(([col, row, suit]) => {
    const u = (xc - CARD.cols[col] * w) / size;
    const v = (yc - CARD.rows[row] * h) / size;
    const [pu, pv] = row === 1 ? [-u, -v] : [u, v];
    return Math.abs(pu) <= 1.2 && Math.abs(pv) <= 1.2 && suit(pu, pv);
  });
});

/**
 * A heart: the card's heart curve stretched to fill the box, whose extents it reaches exactly
 * (1.135 either side, from -1 at the point to 1.236 atop the lobes).
 */
const HEART = { halfWidth: 1.135, halfHeight: 1.118, lift: 0.118 };

export const HEART_SHAPE = predicateShape('heart', (_param, w, h, x, y) => {
  const { dx, dy } = fromCentre(w, h, x, y);
  return inHeartCurve(
    (dx / (w / 2)) * HEART.halfWidth,
    (-dy / (h / 2)) * HEART.halfHeight + HEART.lift,
  );
});

/**
 * A regular five-pointed star, point up, as large as the box allows. Its ten corners' directions
 * are written out as numbers, the sines and cosines of 18 and 54 degrees, rather than computed, so
 * the two copies of the predicate share them exactly; the inner corners sit at the regular
 * pentagram's ratio, (3 - sqrt 5) / 2 of the outer. Inside is the even-odd crossing test.
 */
const STAR = {
  cos18: 0.9510565162951535,
  sin18: 0.3090169943749474,
  cos54: 0.5877852522924731,
  sin54: 0.8090169943749475,
  inner: 0.3819660112501051,
};

/** From the top point, clockwise: outer and inner corners alternate. */
const STAR_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [STAR.cos54, -STAR.sin54],
  [STAR.cos18, -STAR.sin18],
  [STAR.cos18, STAR.sin18],
  [STAR.cos54, STAR.sin54],
  [0, 1],
  [-STAR.cos54, STAR.sin54],
  [-STAR.cos18, STAR.sin18],
  [-STAR.cos18, -STAR.sin18],
  [-STAR.cos54, -STAR.sin54],
];

export const STAR_SHAPE = predicateShape('star', (_param, w, h, x, y) => {
  // The star is 2 cos 18 of its radius across and 1 + sin 54 tall, its centre below the box's.
  const radius = Math.min(w / (2 * STAR.cos18), h / (1 + STAR.sin54));
  const cx = w / 2;
  const cy = h / 2 + ((1 - STAR.sin54) * radius) / 2;
  const corners = STAR_CORNERS.map(([ux, uy], i) => {
    const r = i % 2 === 0 ? radius : radius * STAR.inner;
    return [cx + ux * r, cy + uy * r] as const;
  });
  const px = x + 0.5;
  const py = y + 0.5;
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, yi] = corners[i]!;
    const [xj, yj] = corners[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
});

/**
 * A regular hexagon of hex cells: every cell within `R` steps of the box's centre, counted as a
 * hex grid counts them, `R` being as large as the box allows, so a box `2R + 1` square holds
 * `3R(R + 1) + 1` cells. The rows are odd-r offset, as `neighbours()` lays them out, so the
 * distance is taken in axial coordinates, whole numbers throughout. It means nothing on a square
 * grid, and a wrapped one would join its empty corners, so both are refused.
 */
/** An odd-r offset column as an axial one: odd rows sit half a hex right (`HEX_DIRS` in grid.ts). */
const axialColumn = (col: number, row: number): number => col - (row - (row & 1)) / 2;

export const HEXAGON_SHAPE: ShapeRule = {
  ...predicateShape('hexagon', (_param, w, h, x, y) => {
    const radius = Math.floor((Math.min(w, h) - 1) / 2);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const dq = axialColumn(x, y) - axialColumn(cx, cy);
    const dr = y - cy;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= radius;
  }),
  validate: (type) => {
    if (type.topology !== 'hex') throw new Error(`${type.typeId}: a hexagon is cut from hex cells`);
    if (type.wrap && type.wrap !== 'none') {
      throw new Error(`${type.typeId}: a hexagon's corners are empty, so wrapping joins nothing`);
    }
  },
};

/** A disc as wide as the box's shorter side: every cell whose centre is inside the circle. */
export const CIRCLE_SHAPE = predicateShape('circle', (_param, w, h, x, y) => {
  const { dx, dy } = fromCentre(w, h, x, y);
  const radius = Math.min(w, h) / 2;
  return dx * dx + dy * dy <= radius * radius;
});
