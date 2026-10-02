/**
 * What every board-clear effect shares: the glyphs it borrows from the board, the stage it paints
 * on, and the pre-rendered sprite atlas it copies them from.
 */

import { type CreatureLook, drawCreature } from '../creature.js';
import type { TypeTheme } from '../looktypes.js';
import type { TierPalette } from '../tiercolors.js';

/** What an effect draws the board's creatures in: the palette, the tier colours and the glyph style. */
export interface VictoryLook {
  readonly theme: TypeTheme;
  readonly tierColors: TierPalette;
  readonly creature: CreatureLook;
}

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

/** One mover per sprite, at rest where the board drew it, measured along the effect's axis. */
export function movers(stage: Stage, axisOf: (s: VictorySprite) => number = () => 0): Mover[] {
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

/** One pre-rendered glyph per tier (`buildAtlas`). */
export type Atlas = Map<number, HTMLCanvasElement>;

/**
 * What an effect paints on and with: the layer's size in CSS pixels, the board's theme and tier
 * colours, the colours its particles take, the creatures borrowed and their atlas, and how long it
 * runs, in seconds.
 */
export interface Stage {
  w: number;
  h: number;
  theme: TypeTheme;
  tierColors: TierPalette;
  colors: string[];
  sprites: VictorySprite[];
  atlas: Atlas;
  seconds: number;
}

/** One effect, made for a stage: what it paints each frame. */
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
export function buildAtlas(look: VictoryLook, sprites: VictorySprite[]): Atlas {
  const { theme, tierColors } = look;
  const atlas: Atlas = new Map();
  const base = Math.max(8, Math.round(sprites[0]?.size ?? 16));
  const px = base * 2;
  for (const tier of new Set(sprites.map((s) => s.tier))) {
    const glyph = document.createElement('canvas');
    glyph.width = px;
    glyph.height = px;
    const gtx = glyph.getContext('2d');
    if (!gtx) continue;
    drawCreature(gtx, 0, 0, px, tier, theme, tierColors, look.creature);
    atlas.set(tier, glyph);
  }
  return atlas;
}

/**
 * Copy a mover's glyph from the atlas onto the layer, centred where it is and turned as it is,
 * scaled, faded or nudged by `opts`. A tier with no glyph in the atlas draws nothing.
 */
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
