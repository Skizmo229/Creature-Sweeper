/**
 * The icon effects: they animate the board's own creature glyphs, borrowed for the length of the
 * effect (`VictorySource`).
 */

import { tierColor } from '../theme.js';
import type { VictoryId } from '../looks.js';
import { type Mover, type Painter, type Stage, type VictorySprite, blit } from './stage.js';

export function iconPainter(effect: VictoryId, stage: Stage): Painter {
  switch (effect) {
    case 'tumble':
      return tumble(stage);
    case 'cascade':
      return cascade(stage);
    case 'pop':
      return pop(stage);
    case 'burn':
      return burn(stage);
    default:
      return wipe(effect, stage);
  }
}

function movers(stage: Stage, axisOf: (s: VictorySprite) => number = () => 0): Mover[] {
  return stage.sprites.map((sprite) => ({
    sprite,
    x: sprite.x,
    y: sprite.y,
    vx: 0,
    vy: 0,
    rot: 0,
    spin: 0,
    delay: 0,
    axis: axisOf(sprite),
    gone: false,
  }));
}

/**
 * Tumble — the original's own clear: every creature drops, hits the floor and
 * bounces before settling.
 *
 * The floor is the bottom of the stage rather than of the board, because the
 * board can be smaller than the area the effect covers and creatures stopping
 * in mid-air is the one thing that would give the illusion away.
 */
function tumble(stage: Stage): Painter {
  const items = movers(stage);
  for (const m of items) {
    m.vx = (Math.random() - 0.5) * 70;
    m.vy = -Math.random() * 60;
    m.spin = (Math.random() - 0.5) * 7;
    // A small spread of start times, or the whole board moves as one sheet.
    m.delay = Math.random() * 0.22;
  }

  // Stepped by MEASURED time, not by frame count. A creature has somewhere to
  // be — on the floor, before the layer fades — and a fixed step per frame
  // makes the fall take a fixed number of FRAMES instead of a fixed number of
  // seconds. Measured on a throttled tab, the board barely moved before the
  // effect ended: the creatures simply hung in the air and vanished.
  const paint = (ctx: CanvasRenderingContext2D, t: number, dt: number): void => {
    const elapsed = t * stage.seconds;
    for (const m of items) {
      if (elapsed >= m.delay) {
        const floor = stage.h - m.sprite.size * 0.45;
        m.vy += 1500 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += m.spin * dt;
        if (m.y >= floor) {
          m.y = floor;
          // Damped bounce, and a creature that has nearly stopped is stopped:
          // an undamped rest state jitters forever at one pixel a frame.
          if (Math.abs(m.vy) < 40) {
            m.vy = 0;
            m.vx *= 0.7;
            m.spin = 0;
          } else {
            m.vy = -m.vy * 0.45;
            m.vx *= 0.82;
            m.spin *= 0.55;
          }
        }
      }
      blit(ctx, stage.atlas, m);
    }
  };

  return { paint, accumulates: false };
}

/**
 * Cascade — the Solitaire clear.
 *
 * The trail is the whole effect, which is why this is the one painter that
 * never clears the canvas: each creature is launched sideways, bounces off the
 * floor and leaves a copy of itself at every position it has occupied.
 *
 * The launch interval shrinks with the number of creatures. At a fixed spacing
 * a five-hundred-creature board would take forty-five seconds to get through
 * them all, so the whole board launches inside a fixed window however many
 * there are.
 */
function cascade(stage: Stage): Painter {
  const items = movers(stage);
  // Launched from the bottom of the board upward, the way a Solitaire cascade
  // comes off the top of the stacks: nearest the floor goes first.
  items.sort((a, b) => b.sprite.y - a.sprite.y);
  const window = 1.8;
  const gap = Math.min(0.09, window / Math.max(1, items.length));
  items.forEach((m, i) => {
    m.delay = i * gap;
    m.vx = (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 260);
    m.vy = -(60 + Math.random() * 170);
  });

  // Measured time, for the same reason as `tumble`: the arc has to finish.
  const paint = (ctx: CanvasRenderingContext2D, t: number, dt: number): void => {
    const elapsed = t * stage.seconds;
    for (const m of items) {
      if (m.gone) continue;
      if (elapsed < m.delay) {
        // Still sitting where the board had it. Drawn every frame so the
        // un-launched creatures stay visible on the accumulating canvas.
        blit(ctx, stage.atlas, m);
        continue;
      }
      const floor = stage.h - m.sprite.size * 0.45;
      m.vy += 1150 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y >= floor) {
        m.y = floor;
        m.vy = -Math.abs(m.vy) * 0.78;
        // A creature that has stopped bouncing would sit on the floor burning
        // a hole in the trail, so it is retired instead.
        if (Math.abs(m.vy) < 60) m.gone = true;
      }
      if (m.x < -m.sprite.size || m.x > stage.w + m.sprite.size) m.gone = true;
      blit(ctx, stage.atlas, m);
    }
  };

  return { paint, accumulates: true };
}

/**
 * Pop — every creature swells and bursts, in a wave out from the centre.
 *
 * Staggered by distance rather than by index: a wave reads as one event, where
 * a random order reads as popcorn and a grid order reads as a scan.
 */
function pop(stage: Stage): Painter {
  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const maxD = Math.max(1, Math.hypot(cx, cy));
  const items = movers(stage, (s) => Math.hypot(s.x - cx, s.y - cy) / maxD);
  for (const m of items) m.delay = m.axis * 0.5;

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    for (const m of items) {
      const local = (t - m.delay) / 0.3;
      if (local <= 0) {
        blit(ctx, stage.atlas, m);
        continue;
      }
      if (local >= 1) continue;
      if (local < 0.55) {
        blit(ctx, stage.atlas, m, { scale: 1 + 0.62 * (local / 0.55) });
        continue;
      }
      const u = (local - 0.55) / 0.45;
      blit(ctx, stage.atlas, m, { scale: 1.62 + u, alpha: 1 - u });
      ctx.save();
      ctx.globalAlpha *= 1 - u;
      ctx.strokeStyle = tierColor(m.sprite.tier);
      ctx.lineWidth = Math.max(1.5, m.sprite.size * 0.12 * (1 - u));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.sprite.size * (0.45 + u * 0.95), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  return { paint, accumulates: false };
}

/**
 * Burn — each creature chars away from the bottom up, behind an ember line.
 *
 * Bottom-up, and staggered so the lowest rows catch first, because that is the
 * direction fire actually travels; burning top-down reads as a wipe wearing a
 * warm palette.
 *
 * The un-burnt part is the real glyph under a clip rectangle rather than a
 * redrawn approximation of one, so it stays exactly the creature it was right
 * up to the moment the last of it goes.
 */
function burn(stage: Stage): Painter {
  const items = movers(stage, (s) => 1 - s.y / Math.max(1, stage.h));
  for (const m of items) m.delay = m.axis * 0.38 + Math.random() * 0.1;

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    for (const m of items) {
      const local = (t - m.delay) / 0.34;
      if (local <= 0) {
        blit(ctx, stage.atlas, m);
        continue;
      }

      const size = m.sprite.size;
      const top = m.y - size / 2;
      const left = m.x - size / 2;

      if (local < 1) {
        const remaining = size * (1 - local);
        ctx.save();
        ctx.beginPath();
        ctx.rect(left, top, size, remaining);
        ctx.clip();
        blit(ctx, stage.atlas, m);
        ctx.restore();

        // The ember line itself, flickering so it reads as burning rather than
        // as a bar sliding up the glyph.
        const flicker = 0.7 + 0.3 * Math.sin(t * 90 + m.sprite.x);
        const band = Math.max(2, size * 0.16);
        const grad = ctx.createLinearGradient(0, top + remaining - band, 0, top + remaining);
        grad.addColorStop(0, 'rgba(255, 210, 74, 0)');
        grad.addColorStop(0.6, '#ffd24a');
        grad.addColorStop(1, '#ff5a1f');
        ctx.save();
        ctx.globalAlpha *= flicker;
        ctx.fillStyle = grad;
        ctx.fillRect(left, top + remaining - band, size, band);
        ctx.restore();
      }

      // Ash, rising and fading for a moment after the glyph has gone.
      const ash = (t - m.delay) / 0.9;
      if (ash > 0.15 && ash < 1.2) {
        ctx.save();
        ctx.globalAlpha *= Math.max(0, 1 - ash) * 0.7;
        ctx.fillStyle = '#6b6259';
        for (let i = 0; i < 3; i++) {
          const drift = Math.sin(ash * 6 + i * 2.1) * size * 0.22;
          const mote = Math.max(1, size * 0.09);
          ctx.fillRect(
            left + size * (0.3 + i * 0.2) + drift,
            top + size * (0.5 - ash * 0.8),
            mote,
            mote,
          );
        }
        ctx.restore();
      }
    }
  };

  return { paint, accumulates: false };
}

/**
 * The wipes — a band crosses the board and takes the creatures with it.
 *
 * One implementation, three directions. Which axis a creature is measured
 * along is the only thing that differs, so adding a direction is a line rather
 * than an effect.
 *
 * A creature does not simply vanish as the front reaches it: it fades over a
 * short window while sliding the way the wipe is going, which is what makes
 * the band look like it is carrying them off rather than switching them off.
 */
function wipe(effect: VictoryId, stage: Stage): Painter {
  const cx = stage.w / 2;
  const cy = stage.h / 2;
  const maxD = Math.max(1, Math.hypot(cx, cy));
  const axisOf =
    effect === 'wipeDown'
      ? (s: VictorySprite) => s.y / Math.max(1, stage.h)
      : effect === 'wipeRadial'
        ? (s: VictorySprite) => Math.hypot(s.x - cx, s.y - cy) / maxD
        : (s: VictorySprite) => s.x / Math.max(1, stage.w);
  const items = movers(stage, axisOf);

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    // Runs slightly ahead of the clock so the last creature is gone before the
    // layer starts fading, rather than fading out mid-slide.
    const front = t * 1.3 - 0.08;
    const band = 0.18;

    for (const m of items) {
      const local = Math.min(1, Math.max(0, (front - m.axis) / band));
      if (local >= 1) continue;
      if (local <= 0) {
        blit(ctx, stage.atlas, m);
        continue;
      }
      const push = local * m.sprite.size * 0.8;
      const dx =
        effect === 'wipeDown' ? 0 : effect === 'wipeRadial' ? ((m.x - cx) / maxD) * push * 2 : push;
      const dy =
        effect === 'wipeDown' ? push : effect === 'wipeRadial' ? ((m.y - cy) / maxD) * push * 2 : 0;
      blit(ctx, stage.atlas, m, { alpha: 1 - local, scale: 1 + 0.45 * local, dx, dy });
    }

    if (front <= 0 || front >= 1.05) return;
    ctx.save();
    ctx.globalAlpha *= 0.85;
    ctx.strokeStyle = stage.theme.hot;
    ctx.shadowColor = stage.theme.hot;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (effect === 'wipeRadial') {
      ctx.arc(cx, cy, front * maxD, 0, Math.PI * 2);
    } else if (effect === 'wipeDown') {
      ctx.moveTo(0, front * stage.h);
      ctx.lineTo(stage.w, front * stage.h);
    } else {
      ctx.moveTo(front * stage.w, 0);
      ctx.lineTo(front * stage.w, stage.h);
    }
    ctx.stroke();
    ctx.restore();
  };

  return { paint, accumulates: false };
}
