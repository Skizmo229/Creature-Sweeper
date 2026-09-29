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

/** How many turns the board makes on its way into the centre. */
const SPIN_TURNS = 1.25;

/**
 * Spin — the whole board whirls into its centre, every creature turning with it and shrinking as
 * it goes, as if down a drain. Rigid, one turn for all: a board spiralling in reads as one thing
 * going, where creatures each on an orbit of their own read as noise.
 */
export function spin(stage: Stage): Painter {
  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const items = movers(stage);
  const polar = items.map((m) => ({
    r: Math.hypot(m.x - cx, m.y - cy),
    a: Math.atan2(m.y - cy, m.x - cx),
  }));

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    // Eased in: the drain takes hold slowly and finishes fast.
    const u = t * t;
    const turned = SPIN_TURNS * Math.PI * 2 * u;
    items.forEach((m, i) => {
      const { r, a } = polar[i]!;
      const radius = r * (1 - u);
      m.x = cx + Math.cos(a + turned) * radius;
      m.y = cy + Math.sin(a + turned) * radius;
      m.rot = turned;
      blit(ctx, stage.atlas, m, { scale: Math.max(0.05, 1 - 0.9 * u) });
    });
  };

  return { paint, accumulates: false };
}

/** Air resistance on a flung creature, per second: how quickly the scatter slows. */
const SCATTER_DRAG = 1.4;

/**
 * Scatter — every creature is flung out from the centre of the board, spinning, and slows in the
 * air. Stepped by measured time, as `tumble` is: the fling has somewhere to be.
 */
export function scatter(stage: Stage): Painter {
  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const items = movers(stage);
  for (const m of items) {
    const dx = m.x - cx;
    const dy = m.y - cy;
    // Outward, with a little scatter of its own; a creature at the very centre goes anywhere.
    const a =
      Math.hypot(dx, dy) < 1
        ? Math.random() * Math.PI * 2
        : Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
    const speed = 320 + Math.random() * 360;
    m.vx = Math.cos(a) * speed;
    m.vy = Math.sin(a) * speed;
    m.spin = (Math.random() - 0.5) * 12;
    m.delay = Math.random() * 0.12;
  }

  const paint = (ctx: CanvasRenderingContext2D, t: number, dt: number): void => {
    const elapsed = t * stage.seconds;
    const drag = Math.exp(-SCATTER_DRAG * dt);
    for (const m of items) {
      if (m.gone) continue;
      if (elapsed >= m.delay) {
        m.vx *= drag;
        m.vy *= drag;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += m.spin * dt;
      }
      if (offStage(stage, m)) {
        m.gone = true;
        continue;
      }
      blit(ctx, stage.atlas, m);
    }
  };

  return { paint, accumulates: false };
}

/** True once a creature has left the stage entirely, with a glyph's width to spare. */
function offStage(stage: Stage, m: Mover): boolean {
  const s = m.sprite.size;
  return m.x < -s || m.x > stage.w + s || m.y < -s || m.y > stage.h + s;
}
