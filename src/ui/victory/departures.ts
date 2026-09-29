/**
 * More icon effects: the ways the creatures leave the board once it is cleared. Each borrows the
 * board's glyphs as the effects in `icons.ts` do (`VictorySource`), and the ones with physics
 * step by measured time, for the reason `tumble` gives there.
 */

import { type Mover, type Painter, type Stage, blit, movers } from './stage.js';

/** How long one creature's turn takes, as a share of the effect. */
const FLIP_LENGTH = 0.3;
/** When the last creature starts turning, as a share of the effect: done before the layer fades. */
const FLIP_WAVE = 0.55;

/**
 * Flip — each creature turns over about its vertical axis, like a chequer, and shows its back, a
 * disc in the covered tile's colour that then fades. A wave from the top-left corner, so it
 * reads as one pass over the board rather than as popcorn.
 */
export function flip(stage: Stage): Painter {
  const span = Math.max(1, stage.w + stage.h);
  const items = movers(stage, (s) => (s.x + s.y) / span);
  for (const m of items) m.delay = m.axis * FLIP_WAVE;

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    for (const m of items) {
      const local = (t - m.delay) / FLIP_LENGTH;
      if (local <= 0) {
        blit(ctx, stage.atlas, m);
        continue;
      }
      if (local >= 1) continue;
      // The apparent width of a face turning: full, edge-on at the half, then the back.
      const width = Math.cos(local * Math.PI);
      if (width > 0) {
        blitSqueezed(ctx, stage, m, width);
        continue;
      }
      const u = local * 2 - 1;
      const half = m.sprite.size * 0.42;
      ctx.save();
      ctx.globalAlpha *= 1 - u;
      ctx.fillStyle = stage.theme.tile;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, half * -width, half, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  return { paint, accumulates: false };
}

/** A glyph drawn narrowed to `width` of itself about its own centre: a face seen turning. */
function blitSqueezed(ctx: CanvasRenderingContext2D, stage: Stage, m: Mover, width: number): void {
  const glyph = stage.atlas.get(m.sprite.tier);
  if (!glyph) return;
  const size = m.sprite.size;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(width, 1);
  ctx.drawImage(glyph, -size / 2, -size / 2, size, size);
  ctx.restore();
}
