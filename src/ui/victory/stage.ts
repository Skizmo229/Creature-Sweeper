/**
 * What every board-clear effect shares: the glyphs it borrows from the board, the stage it paints
 * on, and the pre-rendered sprite atlas it copies them from.
 */

import { drawCreature } from '../theme.js';
import type { TypeTheme } from '../looks.js';

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

/** Per-sprite animation state for the icon effects. */
export interface Mover {
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

export type Atlas = Map<number, HTMLCanvasElement>;

export interface Stage {
  w: number;
  h: number;
  theme: TypeTheme;
  colors: string[];
  sprites: VictorySprite[];
  atlas: Atlas;
  seconds: number;
}

export interface Painter {
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
export function buildAtlas(theme: TypeTheme, sprites: VictorySprite[]): Atlas {
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

export function blit(
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
