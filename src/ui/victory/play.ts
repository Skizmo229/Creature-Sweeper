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

import { TIER_COLORS } from '../theme.js';
import { type TypeTheme, type VictoryId } from '../looks.js';
import { ambientPainter } from './ambient.js';
import { iconPainter } from './icons.js';
import { type Stage, type VictorySource, type VictorySprite, buildAtlas } from './stage.js';

export type { VictorySource, VictorySprite } from './stage.js';

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
  const layer = makeLayer(host);
  if (!layer) {
    return () => {
      /* nothing started */
    };
  }
  const { canvas, ctx, rect, w, h } = layer;

  // The tier palette plus the type's own accent: bright against every floor
  // colour in the game, because that is exactly what it was validated for.
  const colors = [...TIER_COLORS, theme.hot, theme.accent];

  const { chosen, sprites } = borrow(effect, rect, source);
  let borrowed = sprites.length ? source! : null;

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

/** The layer an effect paints on: a canvas over `host` at device resolution, or null without 2d. */
function makeLayer(host: HTMLElement): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  rect: DOMRect;
  w: number;
  h: number;
} | null {
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
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, rect, w, h };
}

/**
 * The glyphs an icon effect animates, lined up with the layer, with the board told to stop
 * drawing them; or, for an icon effect with nothing to animate, confetti instead.
 */
function borrow(
  effect: VictoryId,
  rect: DOMRect,
  source: VictorySource | undefined,
): { chosen: VictoryId; sprites: VictorySprite[] } {
  // Line the board's coordinates up with this layer's. The board canvas sits
  // inside the stage and may be panned, so its offset is not zero.
  if (!ICON_EFFECTS.has(effect)) return { chosen: effect, sprites: [] };
  if (source && source.sprites.length > 0) {
    const board = source.canvas.getBoundingClientRect();
    const dx = board.left - rect.left;
    const dy = board.top - rect.top;
    source.setCreaturesHidden(true);
    return {
      chosen: effect,
      sprites: source.sprites.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    };
  }
  // Nothing to animate. Should not happen on a won board, which always has
  // creatures on it, but an effect that silently does nothing would read as
  // a bug — so fall back to one that needs no help.
  return { chosen: 'confetti', sprites: [] };
}
