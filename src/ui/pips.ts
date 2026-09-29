/**
 * The drawn pip shapes: what each is called, and the path each traces. Which shape a ladder's
 * creatures wear is its look's (`looks.ts`); the pips' colour is the tier's (`tiercolors.ts`);
 * a symbol from the pip font is drawn by `theme.ts` instead.
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
];

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
  const tracers: Partial<Record<string, Tracer>> = TRACERS;
  (tracers[shape] ?? disc)(ctx, cx, cy, r);
}
