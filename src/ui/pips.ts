/**
 * The drawn pip shapes: what each is called, and the path each traces. Which shape a ladder's
 * creatures wear is its look's (`looks.ts`); the pips' colour is the tier's (`tiercolors.ts`);
 * a symbol from the pip font is drawn by `creature.ts` instead.
 *
 * A shape is a tracer: it adds its outline to the path in hand, centred on (cx, cy) and reaching
 * r from it. Whatever is drawn the same way round is filled; a hole is cut the other way round, so
 * a plain fill leaves it empty (the gear's). A gilded tier's halo strokes the same path under the
 * fill, so an edge inside the shape never shows.
 */

import type { PipShape } from './looktypes.js';

/** Every creature-icon shape, in the order the picker shows them. */
export const PIP_SHAPES: readonly PipShape[] = [
  'circle',
  'square',
  'diamond',
  'hex',
  'cross',
  'ring',
  'ringDiamond',
  'triangle',
  'gear',
  'heart',
  'star',
  'bolt',
  'crescent',
  'drop',
  'chevron',
  'club',
];

/** Each shape as the icon picker names it. */
export const PIP_NAMES: Record<PipShape, string> = {
  circle: 'Dots',
  square: 'Blocks',
  diamond: 'Gems',
  hex: 'Cells',
  cross: 'Crosses',
  ring: 'Rings',
  ringDiamond: 'Hollow gems',
  triangle: 'Pyramids',
  gear: 'Gears',
  heart: 'Hearts',
  star: 'Stars',
  bolt: 'Bolts',
  crescent: 'Moons',
  drop: 'Drops',
  chevron: 'Chevrons',
  club: 'Clubs',
};

type Tracer = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void;

/** A straight-edged shape from its corners, each an (x, y) share of the radius from the centre. */
function polygon(corners: ReadonlyArray<readonly [number, number]>): Tracer {
  return (ctx, cx, cy, r) => {
    corners.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(cx + x * r, cy + y * r);
      else ctx.lineTo(cx + x * r, cy + y * r);
    });
    ctx.closePath();
  };
}

const disc: Tracer = (ctx, cx, cy, r) => ctx.arc(cx, cy, r, 0, Math.PI * 2);

const diamond = polygon([
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]);

/** The cross's arms: their half-width, as a share of the radius. */
const ARM = 0.42;

/** The gear pip: its teeth, one tooth's outline as (share of the radius, share of a tooth's pitch),
 *  and the hole. */
const GEAR_PIP_TEETH = 6;
const GEAR_PIP_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0.72, -0.32],
  [1, -0.17],
  [1, 0.17],
  [0.72, 0.32],
];
const GEAR_PIP_HOLE = 0.34;

const gear: Tracer = (ctx, cx, cy, r) => {
  // Six teeth rather than the board's eight, which is as many as a pip a few pixels across can
  // show, round a hole cut the other way so a plain fill leaves it empty.
  const step = (Math.PI * 2) / GEAR_PIP_TEETH;
  for (let k = 0; k < GEAR_PIP_TEETH; k++) {
    for (const [radius, offset] of GEAR_PIP_OUTLINE) {
      const angle = (k + offset) * step - Math.PI / 2;
      ctx.lineTo(cx + radius * r * Math.cos(angle), cy + radius * r * Math.sin(angle));
    }
  }
  ctx.closePath();
  ctx.moveTo(cx + r * GEAR_PIP_HOLE, cy);
  ctx.arc(cx, cy, r * GEAR_PIP_HOLE, 0, Math.PI * 2, true);
};

const heart: Tracer = (ctx, cx, cy, r) => {
  // Two lobes over a point, drawn from the point round to it again.
  ctx.moveTo(cx, cy + r * 0.9);
  ctx.bezierCurveTo(cx - r * 1.3, cy, cx - r * 0.95, cy - r * 1.2, cx, cy - r * 0.5);
  ctx.bezierCurveTo(cx + r * 0.95, cy - r * 1.2, cx + r * 1.3, cy, cx, cy + r * 0.9);
  ctx.closePath();
};

const star: Tracer = (ctx, cx, cy, r) => {
  // Five points, the inner corners at the regular pentagram's ratio, nudged down so it sits
  // centred in the pip's box rather than on its own centre.
  for (let k = 0; k < 10; k++) {
    const angle = (k * Math.PI) / 5 - Math.PI / 2;
    const reach = k % 2 === 0 ? r * 1.1 : r * 0.42;
    ctx.lineTo(cx + reach * Math.cos(angle), cy + r * 0.1 + reach * Math.sin(angle));
  }
  ctx.closePath();
};

/** The moon's bite: how far right of the disc the disc cut from it sits, as a share of the radius. */
const BITE = 0.75;

const crescent: Tracer = (ctx, cx, cy, r) => {
  // The disc less a second disc of the same size, drawn as the two arcs that meet at the horns:
  // round the outside from horn to horn, then back along the bite the other way.
  const horn = Math.acos(BITE / 2);
  ctx.arc(cx, cy, r, horn, Math.PI * 2 - horn);
  ctx.arc(cx + r * BITE, cy, r, Math.PI + horn, Math.PI - horn, true);
  ctx.closePath();
};

const drop: Tracer = (ctx, cx, cy, r) => {
  // A point over a round bottom.
  ctx.moveTo(cx, cy - r);
  ctx.bezierCurveTo(
    cx + r * 0.1,
    cy - r * 0.5,
    cx + r * 0.72,
    cy - r * 0.1,
    cx + r * 0.72,
    cy + r * 0.3,
  );
  ctx.arc(cx, cy + r * 0.3, r * 0.72, 0, Math.PI);
  ctx.bezierCurveTo(cx - r * 0.72, cy - r * 0.1, cx - r * 0.1, cy - r * 0.5, cx, cy - r);
  ctx.closePath();
};

/** The club's three lobes, as (x, y) shares of the radius from the centre, and their size. */
const CLUB_LOBES: ReadonlyArray<readonly [number, number]> = [
  [0, -0.5],
  [-0.5, 0.15],
  [0.5, 0.15],
];
const CLUB_LOBE = 0.46;

const club: Tracer = (ctx, cx, cy, r) => {
  // Three lobes on a stem, every part drawn the same way round so a plain fill joins them.
  for (const [x, y] of CLUB_LOBES) {
    ctx.moveTo(cx + x * r + CLUB_LOBE * r, cy + y * r);
    ctx.arc(cx + x * r, cy + y * r, CLUB_LOBE * r, 0, Math.PI * 2);
  }
  polygon([
    [-0.14, 0.1],
    [0.14, 0.1],
    [0.4, 1],
    [-0.4, 1],
  ])(ctx, cx, cy, r);
};

const TRACERS: Record<PipShape, Tracer> = {
  circle: disc,
  ring: disc,
  square: (ctx, cx, cy, r) => ctx.rect(cx - r, cy - r, r * 2, r * 2),
  diamond,
  ringDiamond: diamond,
  hex: polygon([
    [-1, -0.6],
    [0, -1],
    [1, -0.6],
    [1, 0.6],
    [0, 1],
    [-1, 0.6],
  ]),
  cross: polygon([
    [-ARM, -1],
    [ARM, -1],
    [ARM, -ARM],
    [1, -ARM],
    [1, ARM],
    [ARM, ARM],
    [ARM, 1],
    [-ARM, 1],
    [-ARM, ARM],
    [-1, ARM],
    [-1, -ARM],
    [-ARM, -ARM],
  ]),
  // Wider than it is tall, as a pyramid is, so it fills the pip's box rather than a third of it.
  triangle: polygon([
    [0, -0.9],
    [1, 0.85],
    [-1, 0.85],
  ]),
  gear,
  heart,
  star,
  // A zigzag band, wide enough to survive at a few pixels.
  bolt: polygon([
    [-0.1, -1],
    [0.65, -1],
    [0.15, -0.15],
    [0.7, -0.15],
    [-0.4, 1],
    [0.05, 0.2],
    [-0.7, 0.2],
  ]),
  crescent,
  drop,
  // A sergeant's stripe: a band bent to a point, pointing up.
  chevron: polygon([
    [-1, 0.1],
    [0, -0.9],
    [1, 0.1],
    [1, 0.9],
    [0, -0.1],
    [-1, 0.9],
  ]),
  club,
};

/** Begin a path and trace `shape` on it. A shape this build does not know is drawn as a disc. */
export function pipPath(
  ctx: CanvasRenderingContext2D,
  shape: PipShape,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  // An own key only: a saved pip id from a newer build, or a hand-edited one, draws a disc.
  (Object.hasOwn(TRACERS, shape) ? TRACERS[shape] : disc)(ctx, cx, cy, r);
}
