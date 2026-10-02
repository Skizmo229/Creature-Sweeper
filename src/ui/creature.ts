/**
 * Drawing a creature: its pips, its tier as a digit, or both.
 *
 * A tier-N creature is N pips on a 3x3 grid, die-style: drawn at any size, it covers exactly the
 * nine tiers the game has, and stays countable. Pip SHAPE carries ladder identity (each ladder has
 * its own), pip COLOUR carries tier identity and is global, so a tier-4 creature looks the same
 * everywhere (`tiercolors.ts`). Shape is decoration; colour is information.
 */

import { setNumberFont } from './board/digits.js';
import type { Pip, SymbolPip } from './looktypes.js';
import { PIP_FAMILY, isSymbolPip, symbolChar } from './pipsymbols.js';
import { pipPath } from './pips.js';
import type { CreatureGlyph } from './presentation.js';
import { MARK_OUTLINE } from './theme.js';
import { TIER_COUNT, type TierPalette, tierColor, tierGilded } from './tiercolors.js';
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
 * Draw a creature glyph filling a `size`-pixel cell at (x, y), in its tier's colour: its pips,
 * in the shape `pip` gives them, on a 3x3 grid over a cell `GRID_UNITS` wide scaled to size, or its
 * tier as a digit, or both, the digit over the pips' corner.
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  pip: Pip,
  tierColors: TierPalette,
  look: CreatureLook = PIPS_LOOK,
): void {
  if (look.glyph !== 'digit') drawPips(ctx, x, y, size, tier, pip, tierColors);
  if (look.glyph !== 'pips') {
    drawTierDigit(ctx, x, y, size, tier, {
      color: tierColor(tierColors, tier),
      halo: tierGilded(tier) ? tierColors.halo : null,
      font: look.font,
      corner: look.glyph === 'both',
    });
  }
}

/** The digit's size as a share of the cell, drawn alone or tucked into the corner over the pips. */
const DIGIT_SHARE = 0.72;
const CORNER_DIGIT_SHARE = 0.4;
/** Where the corner digit's centre sits, as a share of the cell from its top-left. */
const CORNER_AT = 0.78;

/** How a tier's digit is drawn: its colour, a gilded tier's halo, its face, and whether in the corner. */
interface TierDigit {
  readonly color: string;
  readonly halo: string | null;
  readonly font: GameFont;
  readonly corner: boolean;
}

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
  { color, halo, font, corner }: TierDigit,
): void {
  const px = size * (corner ? CORNER_DIGIT_SHARE : DIGIT_SHARE);
  const cx = x + size * (corner ? CORNER_AT : 0.5);
  const cy = y + size * (corner ? CORNER_AT : 0.5);
  const text = String(Math.min(TIER_COUNT, Math.max(1, tier)));
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

/** The die's grid: a cell this many units wide, three pips a side. */
const GRID_UNITS = 16;
const DIE_SIDE = 3;
/** The first pip's centre from the cell's edge, and the step from one pip's centre to the next. */
const PIP_INSET = 3.5;
const PIP_STEP = 4.5;
/** A pip's radius, and a gilded pip's, smaller so its halo fits in the gap between pips. */
const PIP_RADIUS = 1.9;
const GILDED_PIP_RADIUS = 1.45;
/** The halo's width round a gilded pip, and how far inside a hollow pip's edge it is drawn. */
const HALO_WIDTH = 1.15;
const HOLLOW_HALO_INSET = 0.55;
/** A hollow pip's stroke. */
const HOLLOW_STROKE = 1.1;

/** The pips: a die face of the tier, in the shape `pip` gives them. */
function drawPips(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  pip: Pip,
  tierColors: TierPalette,
): void {
  const face = DIE_FACES[Math.min(TIER_COUNT, Math.max(1, tier))] ?? DIE_FACES[1]!;
  const color = tierColor(tierColors, tier);
  const gilded = tierGilded(tier);
  const unit = size / GRID_UNITS;
  // A gilded pip is smaller: at full size the halos merged into a blob and the count stopped
  // reading.
  const r = Math.max(1, unit * (gilded ? GILDED_PIP_RADIUS : PIP_RADIUS));
  const halo = Math.max(1.5, unit * HALO_WIDTH);
  const centres = face.map((i) => ({
    cx: x + unit * (PIP_INSET + (i % DIE_SIDE) * PIP_STEP),
    cy: y + unit * (PIP_INSET + Math.floor(i / DIE_SIDE) * PIP_STEP),
  }));

  ctx.save();
  ctx.lineJoin = 'round';
  if (isSymbolPip(pip)) {
    drawSymbolPips(ctx, pip, centres, r, color, tierColors.halo, gilded ? halo : 0);
    ctx.restore();
    return;
  }
  const hollow = pip === 'ring' || pip === 'ringDiamond';
  for (const { cx, cy } of centres) {
    // Tiers 6 to 9 wear the halo, under the pip so its colour stays whole.
    if (gilded) {
      ctx.strokeStyle = tierColors.halo;
      ctx.lineWidth = halo;
      pipPath(ctx, pip, cx, cy, hollow ? r - unit * HOLLOW_HALO_INSET : r);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, unit * HOLLOW_STROKE);
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
  pip: SymbolPip,
  centres: readonly { cx: number; cy: number }[],
  r: number,
  color: string,
  haloColor: string,
  halo: number,
): void {
  const char = symbolChar(pip);
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
