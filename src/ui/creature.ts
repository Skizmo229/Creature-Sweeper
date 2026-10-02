/**
 * Drawing a creature: its pips, its tier as a digit, or both.
 *
 * A tier-N creature is N pips on a 3x3 grid, die-style: drawn at any size, it covers exactly the
 * nine tiers the game has, and stays countable. Pip SHAPE carries ladder identity (each ladder has
 * its own), pip COLOUR carries tier identity and is global, so a tier-4 creature looks the same
 * everywhere (`tiercolors.ts`). Shape is decoration; colour is information.
 */

import { setNumberFont } from './board/digits.js';
import type { GlyphPip, TypeTheme } from './looktypes.js';
import { PIP_FAMILY, glyphChar, isGlyphPip } from './pipsymbols.js';
import { pipPath } from './pips.js';
import type { CreatureGlyph } from './presentation.js';
import { MARK_OUTLINE } from './theme.js';
import { type TierPalette, tierColor, tierGilded } from './tiercolors.js';
import { FONTS, type GameFont } from './typefaces.js';

/** Which of the nine grid positions are lit, per die face. */
const DIE_FACES: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

/** How a creature is drawn: as pips, as its tier's digit, or both, and the face the digit is set in. */
export interface CreatureLook {
  readonly glyph: CreatureGlyph;
  readonly font: GameFont;
}

/** The game's own: pips, in the face the board's numbers were sized for. */
const PIPS_LOOK: CreatureLook = { glyph: 'pips', font: FONTS['jetbrains-mono'] };

/**
 * Draw a creature glyph filling a `size`-pixel cell at (x, y), in its tier's colour: its pips on
 * a 3x3 grid over a 16-unit cell scaled to size, or its tier as a digit, or both.
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  theme: TypeTheme,
  tierColors: TierPalette,
  look: CreatureLook = PIPS_LOOK,
): void {
  const color = tierColor(tierColors, tier);
  const gilded = tierGilded(tier);
  if (look.glyph !== 'pips') {
    const corner = look.glyph === 'both';
    if (!corner) {
      drawTierDigit(
        ctx,
        x,
        y,
        size,
        tier,
        color,
        gilded ? tierColors.halo : null,
        look.font,
        false,
      );
      return;
    }
    // The pips first, the digit over their corner.
    drawPips(ctx, x, y, size, tier, theme, tierColors);
    drawTierDigit(ctx, x, y, size, tier, color, gilded ? tierColors.halo : null, look.font, true);
    return;
  }
  drawPips(ctx, x, y, size, tier, theme, tierColors);
}

/** The digit's size as a share of the cell, drawn alone or tucked into the corner over the pips. */
const DIGIT_SHARE = 0.72;
const CORNER_DIGIT_SHARE = 0.4;
/** Where the corner digit's centre sits, as a share of the cell from its top-left. */
const CORNER_AT = 0.78;

/**
 * A creature's tier as a digit, in its colour over the dark outline every annotation wears, so
 * it reads on any floor; a gilded tier's halo is drawn round it as it is round the pips.
 */
function drawTierDigit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  color: string,
  halo: string | null,
  font: GameFont,
  corner: boolean,
): void {
  const px = size * (corner ? CORNER_DIGIT_SHARE : DIGIT_SHARE);
  const cx = x + size * (corner ? CORNER_AT : 0.5);
  const cy = y + size * (corner ? CORNER_AT : 0.5);
  const text = String(Math.min(9, Math.max(1, tier)));
  ctx.save();
  const { centre } = setNumberFont(ctx, font, px);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, px * 0.18);
  ctx.strokeStyle = MARK_OUTLINE;
  ctx.strokeText(text, cx, cy + centre);
  if (halo) {
    ctx.lineWidth = Math.max(1, px * 0.09);
    ctx.strokeStyle = halo;
    ctx.strokeText(text, cx, cy + centre);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy + centre);
  ctx.restore();
}

/** The pips: a die face of the tier, in the shape the theme gives them. */
function drawPips(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  theme: TypeTheme,
  tierColors: TierPalette,
): void {
  const face = DIE_FACES[Math.min(9, Math.max(1, tier))] ?? DIE_FACES[1]!;
  const color = tierColor(tierColors, tier);
  const gilded = tierGilded(tier);
  const unit = size / 16;
  // Gilded pips shrink so their halo fits in the 4.5-unit gap between pips.
  // At full size the halos merged into a blob and the count stopped reading.
  const r = Math.max(1, unit * (gilded ? 1.45 : 1.9));
  const halo = Math.max(1.5, unit * 1.15);
  const centres = face.map((i) => ({
    cx: x + unit * (3.5 + (i % 3) * 4.5),
    cy: y + unit * (3.5 + Math.floor(i / 3) * 4.5),
  }));
  const pip = theme.pip;

  ctx.save();
  ctx.lineJoin = 'round';
  if (isGlyphPip(pip)) {
    drawSymbolPips(ctx, pip, centres, r, color, tierColors.halo, gilded ? halo : 0);
    ctx.restore();
    return;
  }
  const hollow = pip === 'ring' || pip === 'ringDiamond';
  for (const { cx, cy } of centres) {
    // Tiers 6-9 wear the halo, under the pip so its colour stays whole.
    if (gilded) {
      ctx.strokeStyle = tierColors.halo;
      ctx.lineWidth = halo;
      pipPath(ctx, pip, cx, cy, hollow ? r - unit * 0.55 : r);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, unit * 1.1);
    pipPath(ctx, pip, cx, cy, hollow ? r - ctx.lineWidth / 2 : r);
    if (hollow) ctx.stroke();
    else ctx.fill();
  }
  ctx.restore();
}

/**
 * How far a symbol reaches, as a multiple of a drawn pip's diameter, along whichever of its sides
 * is longer. A little over one, because few symbols fill their box the way a disc does.
 */
const SYMBOL_SPAN = 1.1;
/**
 * A gilded symbol's halo, as a share of a drawn pip's. Stroking a symbol strokes its holes
 * too, and a full-width halo closed up the detail of the finer ones (the skull's eyes, a pointing
 * finger's knuckles) at a thumbnail's cell size.
 */
const SYMBOL_HALO = 0.6;
/** The size a symbol is measured at, in pixels, before being scaled to its pip. */
const SYMBOL_MEASURE_PX = 100;

/** A symbol's ink around its pen position, at `SYMBOL_MEASURE_PX`. */
interface Ink {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

/**
 * Measured ink per symbol. Only a symbol whose face has loaded is cached: measured before it
 * arrives, the ink is the fallback's, and the board repaints once it lands (`BoardView`).
 */
const SYMBOL_INK = new Map<string, Ink>();

function symbolInk(ctx: CanvasRenderingContext2D, char: string): Ink {
  const known = SYMBOL_INK.get(char);
  if (known) return known;
  const font = `${SYMBOL_MEASURE_PX}px ${PIP_FAMILY}`;
  ctx.font = font;
  const m = ctx.measureText(char);
  const ink = {
    left: m.actualBoundingBoxLeft,
    right: m.actualBoundingBoxRight,
    ascent: m.actualBoundingBoxAscent,
    descent: m.actualBoundingBoxDescent,
  };
  if (document.fonts.check(font, char)) SYMBOL_INK.set(char, ink);
  return ink;
}

/**
 * A symbol at each pip, its ink centred where the pip's centre is and scaled so its longer side
 * spans the pip, whatever the symbol's own metrics. A gilded tier's halo is the symbol's outline
 * stroked under it in `haloColor`, as a drawn pip's is; `halo` is its width, 0 for none.
 */
function drawSymbolPips(
  ctx: CanvasRenderingContext2D,
  pip: GlyphPip,
  centres: readonly { cx: number; cy: number }[],
  r: number,
  color: string,
  haloColor: string,
  halo: number,
): void {
  const char = glyphChar(pip);
  const ink = symbolInk(ctx, char);
  const span = Math.max(ink.left + ink.right, ink.ascent + ink.descent);
  if (!(span > 0)) return;
  const k = (2 * r * SYMBOL_SPAN) / span;
  ctx.font = `${SYMBOL_MEASURE_PX * k}px ${PIP_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.strokeStyle = haloColor;
  ctx.lineWidth = halo * SYMBOL_HALO;
  for (const { cx, cy } of centres) {
    const px = cx - ((ink.right - ink.left) * k) / 2;
    const py = cy + ((ink.ascent - ink.descent) * k) / 2;
    if (halo > 0) ctx.strokeText(char, px, py);
    ctx.fillText(char, px, py);
  }
}
