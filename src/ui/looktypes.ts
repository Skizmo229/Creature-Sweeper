/**
 * What a ladder's look is made of: the pip a creature is drawn with, the palette, the sound pack
 * and the board-clear effect. The records themselves, one per ladder, are in `looks.ts`; these are
 * kept apart so that file can stay a table.
 */

import type { FontId } from './typefaces.js';

export type PipShape =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'hex'
  | 'cross'
  | 'ring'
  | 'ringDiamond'
  | 'triangle'
  | 'gear'
  | 'heart'
  | 'star';

/**
 * A symbol drawn as the pip, by its code point, written as `U+2764`: the player's own choice from
 * the custom-icon window (`pipsymbols.ts`). No ladder wears one by default.
 */
export type GlyphPip = `U+${string}`;

/** What a creature's pips are drawn as: a drawn shape, or a symbol from the pip font. */
export type Pip = PipShape | GlyphPip;

export interface TypeTheme {
  /** Covered tile. */
  tile: string;
  /** Covered tile's shaded edge, for the bevel. */
  tileEdge: string;
  /** Uncovered ground. */
  floor: string;
  /** Number ink on open ground. */
  ink: string;
  /** This type's danger accent — used for the number on a creature's cell. */
  hot: string;
  pip: Pip;
  /** UI accent for this type. */
  accent: string;
}

/** Sound packs. See `sfx.ts` — each is a set of synthesis recipes, not files. */
export type SfxPackId = 'chime' | 'blip' | 'thud' | 'glass';

/**
 * Board-clear celebrations. See `victory/`.
 *
 * Two families. The first four are ambient — decoration drawn over the board,
 * knowing nothing about what is underneath. The rest animate the board's own
 * creature glyphs, which is why they need the renderer to hand those glyphs
 * over for the length of the animation.
 */
export type VictoryId =
  | 'confetti'
  | 'burst'
  | 'ripple'
  | 'sparkle'
  | 'tumble'
  | 'cascade'
  | 'pop'
  | 'burn'
  | 'wipe'
  | 'wipeDown'
  | 'wipeRadial';

/** A ladder's defaults. The player can override each; this is what "game type default" means. */
export interface LadderLook {
  palette: TypeTheme;
  font: FontId;
  sfx: SfxPackId;
  victory: VictoryId;
}
