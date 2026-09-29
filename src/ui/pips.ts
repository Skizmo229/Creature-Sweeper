/**
 * The drawn pip shapes: what each is called, and the path each traces, one case per shape. Which
 * shape a ladder's creatures wear is its look's (`looks.ts`); the pips' colour is the tier's
 * (`tiercolors.ts`); a symbol from the pip font is drawn by `theme.ts` instead.
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

export function pipPath(
  ctx: CanvasRenderingContext2D,
  shape: PipShape,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case 'square':
      ctx.rect(cx - r, cy - r, r * 2, r * 2);
      break;
    case 'diamond':
    case 'ringDiamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
    case 'hex':
      ctx.moveTo(cx - r, cy - r * 0.6);
      ctx.lineTo(cx, cy - r);
      ctx.lineTo(cx + r, cy - r * 0.6);
      ctx.lineTo(cx + r, cy + r * 0.6);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy + r * 0.6);
      ctx.closePath();
      break;
    case 'cross': {
      const a = r * 0.42;
      ctx.moveTo(cx - a, cy - r);
      ctx.lineTo(cx + a, cy - r);
      ctx.lineTo(cx + a, cy - a);
      ctx.lineTo(cx + r, cy - a);
      ctx.lineTo(cx + r, cy + a);
      ctx.lineTo(cx + a, cy + a);
      ctx.lineTo(cx + a, cy + r);
      ctx.lineTo(cx - a, cy + r);
      ctx.lineTo(cx - a, cy + a);
      ctx.lineTo(cx - r, cy + a);
      ctx.lineTo(cx - r, cy - a);
      ctx.lineTo(cx - a, cy - a);
      ctx.closePath();
      break;
    }
    case 'triangle':
      // Wider than it is tall, as a pyramid is, so it fills the pip's box rather than a third of it.
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r, cy + r * 0.85);
      ctx.lineTo(cx - r, cy + r * 0.85);
      ctx.closePath();
      break;
    case 'gear': {
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
      break;
    }
    case 'heart':
      // Two lobes over a point, drawn from the point round to it again.
      ctx.moveTo(cx, cy + r * 0.9);
      ctx.bezierCurveTo(cx - r * 1.3, cy, cx - r * 0.95, cy - r * 1.2, cx, cy - r * 0.5);
      ctx.bezierCurveTo(cx + r * 0.95, cy - r * 1.2, cx + r * 1.3, cy, cx, cy + r * 0.9);
      ctx.closePath();
      break;
    case 'star':
      // Five points, the inner corners at the regular pentagram's ratio, nudged down so it sits
      // centred in the pip's box rather than on its own centre.
      for (let k = 0; k < 10; k++) {
        const angle = (k * Math.PI) / 5 - Math.PI / 2;
        const reach = k % 2 === 0 ? r * 1.1 : r * 0.42;
        ctx.lineTo(cx + reach * Math.cos(angle), cy + r * 0.1 + reach * Math.sin(angle));
      }
      ctx.closePath();
      break;
    case 'ring':
    case 'circle':
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
  }
}
