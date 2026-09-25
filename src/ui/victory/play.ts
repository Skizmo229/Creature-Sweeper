/**
 * Board-clear celebrations.
 *
 * A short canvas animation laid over the stage when a board is cleared, drawn
 * on its own canvas rather than into the board's.
 *
 * WHY ITS OWN CANVAS. The board renderer is turn-based — it repaints on change
 * and not otherwise — and that is worth keeping. Animating into it would mean
 * either repainting the whole board sixty times a second for two seconds, or
 * leaving particle trails smeared across it. A separate, transparent,
 * pointer-events-none layer keeps the two completely independent: the effect
 * cannot corrupt the board, and a board repaint cannot erase the effect.
 *
 * TWO FAMILIES, AND THE SECOND ONE NEEDS THE BOARD'S HELP.
 *
 * *Ambient* effects (confetti, burst, ripple, sparkle) are decoration over the
 * top and know nothing about what they are covering.
 *
 * *Icon* effects (tumble, cascade, pop, burn, the wipes) animate the board's
 * own creatures, so they need two things from the renderer: where every glyph
 * is, and for the board to stop drawing them. Without the second the original
 * icons stay painted underneath and every creature appears to leave a ghost of
 * itself behind. That is what `VictorySource` is for, and why the effect puts
 * the glyphs back when it ends — including when it is cut short.
 *
 * Every effect is finite and removes itself. There is no idle loop.
 */

import { TIER_COLORS, drawCreature, tierColor } from '../theme.js';
import { type TypeTheme, type VictoryId } from '../looks.js';

/** One creature glyph, as the board is currently drawing it. */
export interface VictorySprite {
  /** Centre, in CSS pixels relative to the board's canvas. */
  x: number;
  y: number;
  /** Width of the square the glyph is drawn into. */
  size: number;
  tier: number;
}

/** What an icon effect borrows from the board for the length of the animation. */
export interface VictorySource {
  /** The board's canvas, for lining the effect's coordinates up with it. */
  canvas: HTMLCanvasElement;
  sprites: VictorySprite[];
  /** Stop (and later resume) the board drawing its own creature glyphs. */
  setCreaturesHidden(hidden: boolean): void;
}

/** The effects that animate the board's creatures rather than covering them. */
const ICON_EFFECTS: ReadonlySet<string> = new Set<VictoryId>([
  'tumble',
  'cascade',
  'pop',
  'burn',
  'wipe',
  'wipeDown',
  'wipeRadial',
]);

/**
 * How long each effect runs before it fades out and removes itself.
 *
 * Cascade is much the longest because it is the only one that is *about*
 * duration — a solitaire cascade that finished in two seconds would not read
 * as a cascade at all.
 */
const DURATION: Record<VictoryId, number> = {
  confetti: 2200,
  burst: 2200,
  ripple: 2200,
  sparkle: 2200,
  tumble: 2600,
  cascade: 4200,
  pop: 2000,
  burn: 2600,
  wipe: 1900,
  wipeDown: 1900,
  wipeRadial: 2000,
};

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

/** Per-sprite animation state for the icon effects. */
interface Mover {
  sprite: VictorySprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  /** Seconds before this one starts moving. */
  delay: number;
  /** 0..1 along whatever axis the effect runs on. */
  axis: number;
  gone: boolean;
}

type Atlas = Map<number, HTMLCanvasElement>;

interface Stage {
  w: number;
  h: number;
  theme: TypeTheme;
  colors: string[];
  sprites: VictorySprite[];
  atlas: Atlas;
  seconds: number;
}

interface Painter {
  /** `t` is 0..1 through the effect; `dt` is seconds since the last paint. */
  paint: (ctx: CanvasRenderingContext2D, t: number, dt: number) => void;
  /**
   * True for an effect that must never clear the canvas — the accumulated
   * image IS the effect. Only cascade, whose trail is its whole signature.
   */
  accumulates: boolean;
}

/**
 * Pre-render one bitmap per tier, then blit.
 *
 * `drawCreature` traces up to nine pip paths per call. The biggest boards
 * carry five hundred creatures, which is four and a half thousand path fills
 * every frame — enough to drop a two-second animation to a slideshow on the
 * exact boards whose clear is most worth celebrating. A glyph never changes
 * during an effect, so it is drawn once per distinct tier and then copied.
 *
 * Rendered at twice the cell size because `pop` swells a glyph past double
 * before bursting it, and an upscaled bitmap would go soft exactly at the
 * moment the player is looking at it.
 */
function buildAtlas(theme: TypeTheme, sprites: VictorySprite[]): Atlas {
  const atlas: Atlas = new Map();
  const base = Math.max(8, Math.round(sprites[0]?.size ?? 16));
  const px = base * 2;
  for (const tier of new Set(sprites.map((s) => s.tier))) {
    const glyph = document.createElement('canvas');
    glyph.width = px;
    glyph.height = px;
    const gtx = glyph.getContext('2d');
    if (!gtx) continue;
    drawCreature(gtx, 0, 0, px, tier, theme);
    atlas.set(tier, glyph);
  }
  return atlas;
}

function blit(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  m: Mover,
  opts: { scale?: number; alpha?: number; dx?: number; dy?: number } = {},
): void {
  const glyph = atlas.get(m.sprite.tier);
  if (!glyph) return;
  const size = m.sprite.size * (opts.scale ?? 1);
  ctx.save();
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.translate(m.x + (opts.dx ?? 0), m.y + (opts.dy ?? 0));
  if (m.rot) ctx.rotate(m.rot);
  ctx.drawImage(glyph, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/**
 * Run an effect over `host`, and return a function that stops it early.
 *
 * The stop function matters twice over. A player who clicks "Next board" half
 * a second in gets the screen rebuilt under the animation, and an effect still
 * holding a requestAnimationFrame on a detached canvas would keep running for
 * the rest of the session — and an icon effect that was cut off before it
 * finished would leave the board's own creatures hidden for good.
 */
export function playVictory(
  host: HTMLElement,
  effect: VictoryId,
  theme: TypeTheme,
  source?: VictorySource,
): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'victory-layer';
  const rect = host.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  host.append(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {
      /* nothing started */
    };
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // The tier palette plus the type's own accent: bright against every floor
  // colour in the game, because that is exactly what it was validated for.
  const colors = [...TIER_COLORS, theme.hot, theme.accent];

  // Line the board's coordinates up with this layer's. The board canvas sits
  // inside the stage and may be panned, so its offset is not zero.
  let chosen = effect;
  let sprites: VictorySprite[] = [];
  let borrowed: VictorySource | null = null;
  if (ICON_EFFECTS.has(chosen)) {
    if (source && source.sprites.length > 0) {
      const board = source.canvas.getBoundingClientRect();
      const dx = board.left - rect.left;
      const dy = board.top - rect.top;
      sprites = source.sprites.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
      borrowed = source;
      source.setCreaturesHidden(true);
    } else {
      // Nothing to animate. Should not happen on a won board, which always has
      // creatures on it, but an effect that silently does nothing would read as
      // a bug — so fall back to one that needs no help.
      chosen = 'confetti';
    }
  }

  const duration = DURATION[chosen];
  const stage: Stage = {
    w,
    h,
    theme,
    colors,
    sprites,
    atlas: sprites.length ? buildAtlas(theme, sprites) : new Map(),
    seconds: duration / 1000,
  };
  const painter = ICON_EFFECTS.has(chosen)
    ? iconPainter(chosen, stage)
    : ambientPainter(chosen, stage);

  const start = performance.now();
  let last = start;
  let raf = 0;
  let stopped = false;

  const frame = (now: number) => {
    const t = (now - start) / duration;
    // Clamped, because a backgrounded tab resumes with a delta of seconds and
    // an unclamped step would teleport everything through the floor.
    const dt = Math.min(1 / 20, Math.max(0, (now - last) / 1000));
    last = now;
    if (stopped || t >= 1) {
      finish();
      return;
    }

    if (painter.accumulates) {
      // The trail is the effect, so the canvas is never cleared and the fade
      // has to happen on the element instead of in the paint.
      canvas.style.opacity = t < 0.86 ? '1' : String(Math.max(0, 1 - (t - 0.86) / 0.14));
      ctx.globalAlpha = 1;
    } else {
      ctx.clearRect(0, 0, w, h);
      // Fade the whole layer out over the last third, so nothing ever vanishes
      // mid-flight.
      ctx.globalAlpha = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34;
    }

    painter.paint(ctx, t, dt);

    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  const finish = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    // Hand the creatures back BEFORE the layer goes, or the board flashes a
    // frame with no creatures on it at all.
    borrowed?.setCreaturesHidden(false);
    borrowed = null;
    canvas.remove();
  };

  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    finish();
  };
}

// ----------------------------------------------------------------- ambient

function ambientPainter(effect: VictoryId, stage: Stage): Painter {
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

// -------------------------------------------------------------------- icon

function iconPainter(effect: VictoryId, stage: Stage): Painter {
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
