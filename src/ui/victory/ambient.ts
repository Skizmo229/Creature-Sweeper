/**
 * The ambient effects: decoration drawn over the board, knowing nothing about what is underneath.
 */

import type { VictoryId } from '../looktypes.js';
import type { Painter, Stage } from './stage.js';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, for the chips that tumble. */
  spin: number;
  spinRate: number;
  size: number;
  color: string;
}

export function ambientPainter(effect: VictoryId, stage: Stage): Painter {
  const { w, h, colors } = stage;
  const pick = () => colors[Math.floor(Math.random() * colors.length)]!;
  const particles: Particle[] = [];
  const cx = w / 2;
  const cy = h / 2;

  if (effect === 'confetti') {
    for (let i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * w,
        y: -Math.random() * h * 0.5,
        vx: (Math.random() - 0.5) * 60,
        vy: 90 + Math.random() * 190,
        spin: Math.random() * Math.PI,
        spinRate: (Math.random() - 0.5) * 9,
        size: 4 + Math.random() * 6,
        color: pick(),
      });
    }
  } else if (effect === 'sparkle') {
    for (let i = 0; i < 110; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(w, h) * 0.45;
      particles.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 24,
        // Drifting upward, which is what separates a sparkle from confetti.
        vy: -18 - Math.random() * 34,
        spin: Math.random() * Math.PI,
        spinRate: (Math.random() - 0.5) * 4,
        size: 2 + Math.random() * 3.5,
        color: pick(),
      });
    }
  } else if (effect === 'burst') {
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + Math.random() * 0.1;
      const speed = 220 + Math.random() * 320;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        spin: a,
        spinRate: 0,
        size: 2.5 + Math.random() * 3,
        color: pick(),
      });
    }
  }
  // 'ripple' carries no particles at all — it is drawn from the clock alone.

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    if (effect === 'ripple') {
      drawRipple(ctx, cx, cy, Math.hypot(w, h) / 2, t, colors);
      return;
    }
    // Fixed step rather than the measured delta, and here that is fine: a
    // confetti chip has nowhere in particular to be, so a dropped frame should
    // slow it imperceptibly rather than teleport it. The icon effects below
    // cannot afford the same luxury — see `tumble`.
    const dt = 1 / 60;
    const gravity = effect === 'confetti' ? 420 : effect === 'burst' ? 120 : 0;
    const drag = effect === 'burst' ? 0.955 : 1;
    for (const p of particles) {
      p.vy += gravity * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.spinRate * dt;
      drawParticle(ctx, p, effect);
    }
  };

  return { paint, accumulates: false };
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, effect: VictoryId): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = p.color;
  if (effect === 'confetti') {
    ctx.rotate(p.spin);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  } else if (effect === 'burst') {
    // A short streak along the direction of travel, so the rays read as rays
    // rather than as a ring of dots.
    ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.fillRect(-p.size * 3, -p.size / 2, p.size * 6, p.size);
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Three rings leaving the centre, staggered so they read as a sequence. */
function drawRipple(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxR: number,
  t: number,
  colors: readonly string[],
): void {
  for (let i = 0; i < 3; i++) {
    const local = t * 1.6 - i * 0.18;
    if (local <= 0 || local >= 1) continue;
    ctx.save();
    ctx.globalAlpha *= 1 - local;
    ctx.strokeStyle = colors[i % colors.length]!;
    ctx.lineWidth = Math.max(2, 14 * (1 - local));
    ctx.beginPath();
    ctx.arc(cx, cy, local * maxR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
