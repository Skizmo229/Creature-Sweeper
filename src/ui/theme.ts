/**
 * Per-type look, and the placeholder creature art.
 *
 * Temp assets by design: a tier-N creature is N pips on a 3x3 grid, die-style.
 * No art to draw, procedural at any size, covers exactly the 1..9 range the
 * game needs, and stays countable while the tuning is still moving.
 *
 * The split: pip SHAPE carries type identity (each ladder has its own), pip
 * COLOUR carries tier identity and is global, so a tier-4 creature looks the
 * same everywhere. Shape is decoration; colour is information.
 */

import type { GlyphPip, Pip, PipShape, SfxPackId, TypeTheme, VictoryId } from './looktypes.js';
import { PIP_FAMILY, findSymbol, glyphChar, isGlyphPip } from './pipsymbols.js';
import type { SfxEvent } from './sfx.js';

/** Every creature-icon shape, in the order the picker shows them. */
export const PIP_SHAPES: readonly PipShape[] = [
  'circle',
  'square',
  'diamond',
  'hex',
  'cross',
  'ring',
  'ringDiamond',
  'triangle',
  'gear',
  'heart',
  'star',
];

export const PIP_NAMES: Record<PipShape, string> = {
  circle: 'Dots',
  square: 'Blocks',
  diamond: 'Gems',
  hex: 'Cells',
  cross: 'Crosses',
  ring: 'Rings',
  ringDiamond: 'Hollow gems',
  triangle: 'Pyramids',
  gear: 'Gears',
  heart: 'Hearts',
  star: 'Stars',
};

/** What a pip is called: a shape's name, or a symbol's own. */
export function pipName(pip: Pip): string {
  return isGlyphPip(pip) ? (findSymbol(pip)?.symbol.name ?? pip) : (PIP_NAMES[pip] ?? pip);
}

export const SFX_NAMES: Record<SfxPackId, string> = {
  chime: 'Chimes — soft bells',
  blip: 'Blips — arcade square waves',
  thud: 'Thuds — low and dry',
  glass: 'Glass — bright and brittle',
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
  tumble: 'Tumble — creatures drop and bounce',
  cascade: 'Cascade — they bounce off, leaving trails',
  pop: 'Pop — they swell and burst',
  burn: 'Burn — they char away from the bottom up',
  wipe: 'Wipe across — a band carries them off',
  wipeDown: 'Wipe down — a band falls through them',
  wipeRadial: 'Wipe out — a ring from the centre',
};

/** Marks are green, as in the original. Drawn with a dark outline so they
 *  survive light tiles like EASY's olive, where green alone disappeared. */
export const MARK_COLOR = '#35e06a';
export const MARK_OUTLINE = 'rgba(8, 8, 4, 0.8)';

/** Census results: a corner badge, deliberately unlike the centred number. */
export const CENSUS_COLOR = '#7ad9ff';

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
 * the highlight had gone slightly out of focus.
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

/** Pencil marks: the same green as a mark, dimmed. A note is a weaker form of
 *  the same claim, so it should read as the same ink lightly applied rather
 *  than as a different kind of annotation. It wears the mark's dark outline
 *  too, which is what carries it on a light tile — see `drawNotes`. */
export const NOTE_COLOR = 'rgba(53, 224, 106, 0.72)';

/**
 * Creature tier colours — five hues, reused for tiers 6-9 with a gold halo.
 *
 * Deliberately NOT a warm threat ramp: yellow/orange/red cluster so tightly
 * that adjacent tiers were indistinguishable (yellow against lime measured
 * ΔE 2.5 under protanopia), which is what made the glyphs hard to read. Since
 * the pip *count* already encodes magnitude, colour's job here is identity, so
 * the hues are spread instead of ramped.
 *
 * Validated against a near-black floor: the only soft spot is yellow against
 * green under protanopia (ΔE 6.4), and the pip count disambiguates that pair
 * completely on its own.
 */
export const TIER_COLORS = ['#54c8ff', '#5fd97a', '#ffd447', '#ff8f3a', '#ff5fc4'] as const;

/** Tiers past the fifth repeat the five hues wearing this. */
export const TIER_GOLD = '#ffcc33';

export function tierColor(tier: number): string {
  return TIER_COLORS[(Math.max(1, tier) - 1) % TIER_COLORS.length]!;
}

/** True for tiers 6+, which wear their hue with a gold halo. */
export function tierGilded(tier: number): boolean {
  return tier > TIER_COLORS.length;
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

/** The gear pip: its teeth, one tooth's outline as (share of the radius, share of a tooth's pitch),
 *  and the hole. */
const GEAR_PIP_TEETH = 6;
const GEAR_PIP_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0.72, -0.32],
  [1, -0.17],
  [1, 0.17],
  [0.72, 0.32],
];
const GEAR_PIP_HOLE = 0.34;

function pipPath(
  ctx: CanvasRenderingContext2D,
  shape: PipShape,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case 'square':
      ctx.rect(cx - r, cy - r, r * 2, r * 2);
      break;
    case 'diamond':
    case 'ringDiamond':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      break;
    case 'hex':
      ctx.moveTo(cx - r, cy - r * 0.6);
      ctx.lineTo(cx, cy - r);
      ctx.lineTo(cx + r, cy - r * 0.6);
      ctx.lineTo(cx + r, cy + r * 0.6);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy + r * 0.6);
      ctx.closePath();
      break;
    case 'cross': {
      const a = r * 0.42;
      ctx.moveTo(cx - a, cy - r);
      ctx.lineTo(cx + a, cy - r);
      ctx.lineTo(cx + a, cy - a);
      ctx.lineTo(cx + r, cy - a);
      ctx.lineTo(cx + r, cy + a);
      ctx.lineTo(cx + a, cy + a);
      ctx.lineTo(cx + a, cy + r);
      ctx.lineTo(cx - a, cy + r);
      ctx.lineTo(cx - a, cy + a);
      ctx.lineTo(cx - r, cy + a);
      ctx.lineTo(cx - r, cy - a);
      ctx.lineTo(cx - a, cy - a);
      ctx.closePath();
      break;
    }
    case 'triangle':
      // Wider than it is tall, as a pyramid is, so it fills the pip's box rather than a third of it.
      ctx.moveTo(cx, cy - r * 0.9);
      ctx.lineTo(cx + r, cy + r * 0.85);
      ctx.lineTo(cx - r, cy + r * 0.85);
      ctx.closePath();
      break;
    case 'gear': {
      // Six teeth rather than the board's eight, which is as many as a pip a few pixels across can
      // show, round a hole cut the other way so a plain fill leaves it empty.
      const step = (Math.PI * 2) / GEAR_PIP_TEETH;
      for (let k = 0; k < GEAR_PIP_TEETH; k++) {
        for (const [radius, offset] of GEAR_PIP_OUTLINE) {
          const angle = (k + offset) * step - Math.PI / 2;
          ctx.lineTo(cx + radius * r * Math.cos(angle), cy + radius * r * Math.sin(angle));
        }
      }
      ctx.closePath();
      ctx.moveTo(cx + r * GEAR_PIP_HOLE, cy);
      ctx.arc(cx, cy, r * GEAR_PIP_HOLE, 0, Math.PI * 2, true);
      break;
    }
    case 'heart':
      // Two lobes over a point, drawn from the point round to it again.
      ctx.moveTo(cx, cy + r * 0.9);
      ctx.bezierCurveTo(cx - r * 1.3, cy, cx - r * 0.95, cy - r * 1.2, cx, cy - r * 0.5);
      ctx.bezierCurveTo(cx + r * 0.95, cy - r * 1.2, cx + r * 1.3, cy, cx, cy + r * 0.9);
      ctx.closePath();
      break;
    case 'star':
      // Five points, the inner corners at the regular pentagram's ratio, nudged down so it sits
      // centred in the pip's box rather than on its own centre.
      for (let k = 0; k < 10; k++) {
        const angle = (k * Math.PI) / 5 - Math.PI / 2;
        const reach = k % 2 === 0 ? r * 1.1 : r * 0.42;
        ctx.lineTo(cx + reach * Math.cos(angle), cy + r * 0.1 + reach * Math.sin(angle));
      }
      ctx.closePath();
      break;
    case 'ring':
    case 'circle':
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
  }
}

/**
 * Draw a creature glyph filling a `size`-pixel cell at (x, y).
 * The 3x3 pip grid sits on a 16-unit cell, scaled to size.
 */
export function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  tier: number,
  theme: TypeTheme,
): void {
  const face = DIE_FACES[Math.min(9, Math.max(1, tier))] ?? DIE_FACES[1]!;
  const color = tierColor(tier);
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
    drawSymbolPips(ctx, pip, centres, r, color, gilded ? halo : 0);
    ctx.restore();
    return;
  }
  const hollow = pip === 'ring' || pip === 'ringDiamond';
  for (const { cx, cy } of centres) {
    // Tiers 6-9 reuse the first five hues wearing a gold halo, so the palette
    // covers nine tiers without nine barely-distinguishable colours.
    if (gilded) {
      ctx.strokeStyle = TIER_GOLD;
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
 * A gilded symbol's gold halo, as a share of a drawn pip's. Stroking a symbol strokes its holes
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
 * spans the pip, whatever the symbol's own metrics. A gilded tier's gold halo is the symbol's
 * outline stroked under it, as a drawn pip's is.
 */
function drawSymbolPips(
  ctx: CanvasRenderingContext2D,
  pip: GlyphPip,
  centres: readonly { cx: number; cy: number }[],
  r: number,
  color: string,
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
  ctx.strokeStyle = TIER_GOLD;
  ctx.lineWidth = halo * SYMBOL_HALO;
  for (const { cx, cy } of centres) {
    const px = cx - ((ink.right - ink.left) * k) / 2;
    const py = cy + ((ink.ascent - ink.descent) * k) / 2;
    if (halo > 0) ctx.strokeText(char, px, py);
    ctx.fillText(char, px, py);
  }
}
