/**
 * The colours every board shares and the names the settings screen gives things, and drawing a
 * creature. The colours are the annotations, each a colour of its own (a mark, a given, a Census,
 * an Augur, the tutor, a refused click), and the board's own structure (its outline, a pair's bond,
 * Sudoku's box rules); the names are the sound packs', the sound events' and the clear effects'.
 *
 * A tier-N creature is N pips on a 3x3 grid, die-style: drawn at any size, it covers exactly the
 * nine tiers the game has, and stays countable. Pip SHAPE carries ladder identity (each ladder has
 * its own), pip COLOUR carries tier identity and is global, so a tier-4 creature looks the same
 * everywhere (`tiercolors.ts`). Shape is decoration; colour is information.
 */

import { setNumberFont } from './board/digits.js';
import { rgbOf } from './colorspace.js';
import type { GlyphPip, Pip, SfxPackId, TypeTheme, VictoryId } from './looktypes.js';
import { PIP_FAMILY, findSymbol, glyphChar, isGlyphPip } from './pipsymbols.js';
import { PIP_NAMES, pipPath } from './pips.js';
import type { CreatureGlyph } from './presentation.js';
import type { SfxEvent } from './sfx.js';
import { type TierPalette, tierColor, tierGilded } from './tiercolors.js';
import { FONTS, type GameFont } from './typefaces.js';

/** What a pip is called: a shape's name, or a symbol's own. */
export function pipName(pip: Pip): string {
  return isGlyphPip(pip) ? (findSymbol(pip)?.symbol.name ?? pip) : (PIP_NAMES[pip] ?? pip);
}

export const SFX_NAMES: Record<SfxPackId, string> = {
  chime: 'Chimes — soft bells',
  blip: 'Blips — arcade square waves',
  thud: 'Thuds — low and dry',
  glass: 'Glass — bright and brittle',
  wood: 'Wood — a marimba’s knock',
  pluck: 'Pluck — a plucked string',
  bubble: 'Bubbles — rising chirps',
  clock: 'Clockwork — dry ticks',
  organ: 'Organ — two voices held',
};

/** Every sound event, in the order the sound check lays them out. */
export const SFX_EVENT_NAMES: Record<SfxEvent, string> = {
  open: 'Open',
  cascade: 'Cascade',
  mark: 'Mark',
  note: 'Note',
  sweep: 'Sweep',
  blocked: 'Blocked',
  kill: 'Kill',
  battle: 'Hit',
  levelup: 'Level-up',
  spell: 'Spell',
  win: 'Win',
  lose: 'Lose',
};

export const VICTORY_NAMES: Record<VictoryId, string> = {
  confetti: 'Confetti — falling chips',
  burst: 'Burst — rays from the centre',
  ripple: 'Ripple — expanding rings',
  sparkle: 'Sparkle — drifting motes',
  fireworks: 'Fireworks — rockets burst one after another',
  tumble: 'Tumble — creatures drop and bounce',
  cascade: 'Cascade — they bounce off, leaving trails',
  pop: 'Pop — they swell and burst',
  burn: 'Burn — they char away from the bottom up',
  wipe: 'Wipe across — a band carries them off',
  wipeDown: 'Wipe down — a band falls through them',
  wipeRadial: 'Wipe out — a ring from the centre',
  flip: 'Flip — they turn over like chequers',
  spin: 'Spin — they whirl into the centre',
  scatter: 'Scatter — they fly out from the centre',
  float: 'Float — they rise and drift away',
  march: 'March — they leave in ranks',
  swarm: 'Swarm — they buzz about, then stream away',
};

/** Marks are green, as in the original. Drawn with a dark outline so they
 *  survive light tiles like EASY's olive, where green alone disappeared. */
export const MARK_COLOR = '#35e06a';
export const MARK_OUTLINE = 'rgba(8, 8, 4, 0.8)';

/** Census results: a corner badge, deliberately unlike the centred number. */
export const CENSUS_COLOR = '#7ad9ff';

/**
 * Augur results: the opposite corner, in a cream that sits at least 117 RGB units from every
 * other annotation colour and from every look's `hot` (measured 27 September 2026, decision 0032's
 * rule), so no palette can make a beaten creature's number look like an Augur's answer.
 */
export const AUGUR_COLOR = '#ffffd2';

/**
 * The tutor's pointing finger: the numbers a proof read and the rings they see.
 *
 * Violet, which no other annotation uses: green is a claim, blue a Census, gold a given, red a
 * refusal, and the tutor is none of those. What the proof concludes is drawn in the colours the
 * player already reads, a safe cell in the mark green and a named cell in its tier's colour, so
 * the lesson says "this is what you would write" in the ink you would write it in.
 */
export const TUTOR_COLOR = '#d29cff';

/**
 * The line where the board meets the background.
 *
 * The board's silhouette and nothing else — not a grid. Cells keep their own
 * edges (a covered tile its bevel, cleared floor none), because what this is
 * for is telling you where the board IS: which is a question worth answering
 * on a rectangle and the whole picture on a shaped one, where the outline is
 * the rooms, the arms or the cave.
 *
 * Full white, because there is only one of these lines on screen rather than a
 * few thousand, so it can afford to be the brightest thing on the board.
 */
export const BOARD_OUTLINE = '#ffffff';

/**
 * The cursor over ground the crawl rule will not let you touch.
 *
 * Red, and the only red in the annotation palette, because it is the one
 * highlight that means "this click will do nothing" rather than telling you
 * something about the cell. It has to read at a glance against every ladder's
 * tile colour, which is why it is a saturated red rather than a dimmed green:
 * dimming was the first attempt and on DUNGEON's violet it just looked like
 * the highlight had gone slightly out of focus. Colour is not all it says: a
 * cell the click would not land on is crossed out where one it would is boxed
 * (decision 0051).
 */
export const OUT_OF_REACH_COLOR = '#ff5a5a';

/**
 * A Sudoku given: gold, against the green of a mark the player made.
 *
 * They are different kinds of claim and the board should not make you
 * remember which is which. Gold also reads as fixed — it is the one
 * annotation on the board you are not allowed to change.
 *
 * Reveal writes one of these too, on every ladder that carries magic. Same
 * argument exactly: a tier you bought with mana is the board talking, not a
 * hypothesis you wrote down, and it should neither look like one nor be
 * rubbed out like one.
 */
export const GIVEN_COLOR = '#f2c34e';

/**
 * The tie between the two halves of a defeated pair.
 *
 * Drawn for the same reason the Sudoku box rules are: the rule a board rests
 * on has to be visible or it is not a rule the player can use, and "these two
 * creatures belong to each other" is invisible on a finished grid — both cells
 * are just open creatures, exactly like any other.
 *
 * Translucent white rather than an annotation colour, and the choice is
 * deliberate. Green, gold and cyan all mean something the PLAYER or a spell
 * put there; this is a fact about the board's own structure, in the same
 * family as the silhouette, so it borrows the silhouette's white and steps
 * back from it. Every ladder's floor is dark, so one value reads on all of
 * them.
 */
export const BOND_COLOR = 'rgba(255, 255, 255, 0.5)';

/**
 * The 3x3 box rules.
 *
 * Near-black with a little transparency rather than a flat colour, so one
 * value sits correctly over both the washed boxes and the unwashed ones, and
 * over cleared floor as well as covered tile.
 */
export const BOX_RULE = 'rgba(8, 4, 12, 0.92)';

/** How far a pencil note's ink is dimmed from the mark's, as an alpha. */
const NOTE_ALPHA = 0.72;

/** Pencil marks: the mark's own colour, dimmed. A note is a weaker form of
 *  the same claim, so it should read as the same ink lightly applied rather
 *  than as a different kind of annotation. It wears the mark's dark outline
 *  too, which is what carries it on a light tile — see `drawNotes`. */
export function noteColor(markColor: string): string {
  const [r, g, b] = rgbOf(markColor);
  return `rgba(${r}, ${g}, ${b}, ${NOTE_ALPHA})`;
}

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
