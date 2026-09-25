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

import type { SfxPackId, VictoryId, PipShape, TypeTheme } from './looks.js';

/** Every creature-icon shape, in the order the picker shows them. */
export const PIP_SHAPES: readonly PipShape[] = [
  'circle',
  'square',
  'diamond',
  'hex',
  'cross',
  'ring',
  'ringDiamond',
];

export const PIP_NAMES: Record<PipShape, string> = {
  circle: 'Dots',
  square: 'Blocks',
  diamond: 'Gems',
  hex: 'Cells',
  cross: 'Crosses',
  ring: 'Rings',
  ringDiamond: 'Hollow gems',
};

export const SFX_NAMES: Record<SfxPackId, string> = {
  chime: 'Chimes — soft bells',
  blip: 'Blips — arcade square waves',
  thud: 'Thuds — low and dry',
  glass: 'Glass — bright and brittle',
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
 * argument exactly: a tier you bought for 25 mana is the board talking, not a
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
  const hollow = theme.pip === 'ring' || theme.pip === 'ringDiamond';

  ctx.save();
  ctx.lineJoin = 'round';
  for (const i of face) {
    const cx = x + unit * (3.5 + (i % 3) * 4.5);
    const cy = y + unit * (3.5 + Math.floor(i / 3) * 4.5);

    // Tiers 6-9 reuse the first five hues wearing a gold halo, so the palette
    // covers nine tiers without nine barely-distinguishable colours.
    if (gilded) {
      ctx.strokeStyle = TIER_GOLD;
      ctx.lineWidth = halo;
      pipPath(ctx, theme.pip, cx, cy, hollow ? r - unit * 0.55 : r);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, unit * 1.1);
    pipPath(ctx, theme.pip, cx, cy, hollow ? r - ctx.lineWidth / 2 : r);
    if (hollow) ctx.stroke();
    else ctx.fill();
  }
  ctx.restore();
}
