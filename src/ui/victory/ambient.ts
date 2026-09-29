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
  if (effect === 'fireworks') return fireworks(stage);
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

/** A rocket: when it bursts, as a share of the effect, where, and its sparks once it has. */
interface Rocket {
  at: number;
  x: number;
  y: number;
  color: string;
  sparks: Particle[];
}

const ROCKETS = 5;
const SPARKS_PER_ROCKET = 48;
/** How long a rocket's sparks last, as a share of the effect. */
const SPARK_LIFE = 0.45;
/** How long a rocket takes to rise to where it bursts, as a share of the effect. */
const RISE = 0.1;

/**
 * Fireworks — rockets rise from the bottom edge and burst, one after another, each in one of the
 * board's colours. The bursts are spread through the first two thirds, so the last has burst
 * before the layer starts to fade, and each rocket is rising while the last one's sparks fall.
 */
function fireworks(stage: Stage): Painter {
  const { w, h, colors } = stage;
  const rockets: Rocket[] = [];
  for (let i = 0; i < ROCKETS; i++) {
    const x = w * (0.15 + Math.random() * 0.7);
    const y = h * (0.12 + Math.random() * 0.45);
    const color = colors[i % colors.length]!;
    const sparks: Particle[] = [];
    for (let k = 0; k < SPARKS_PER_ROCKET; k++) {
      const a = (k / SPARKS_PER_ROCKET) * Math.PI * 2 + Math.random() * 0.12;
      const speed = 110 + Math.random() * 160;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        spin: 0,
        spinRate: 0,
        size: 2 + Math.random() * 2,
        color,
      });
    }
    rockets.push({ at: RISE + (i / ROCKETS) * 0.6 + Math.random() * 0.05, x, y, color, sparks });
  }

  const paint = (ctx: CanvasRenderingContext2D, t: number): void => {
    // A fixed step, as the other ambient effects take: a spark has nowhere to be.
    const dt = 1 / 60;
    for (const r of rockets) {
      const rise = (t - (r.at - RISE)) / RISE;
      if (rise > 0 && rise < 1) {
        // A streak climbing from the bottom edge to where it will burst.
        const ry = h - (h - r.y) * rise;
        ctx.save();
        ctx.globalAlpha *= 0.8;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.x, ry + 14);
        ctx.lineTo(r.x, ry);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const life = (t - r.at) / SPARK_LIFE;
      if (life <= 0 || life >= 1) continue;
      ctx.save();
      ctx.globalAlpha *= 1 - life;
      if (life < 0.08) {
        // The flash of the burst itself, before the sparks have gone anywhere.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 6 + 30 * (life / 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = r.color;
      for (const p of r.sparks) {
        p.vy += 180 * dt;
        p.vx *= 0.975;
        p.vy *= 0.975;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  return { paint, accumulates: false };
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
