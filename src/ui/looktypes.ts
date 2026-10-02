/**
 * What a ladder's look is made of: the pip a creature is drawn with, the palette, the sound pack
 * and the board-clear effect. The records themselves, one per ladder, are in `looks.ts`; these are
 * kept apart so that file can stay a table.
 */

import type { FontId } from './typefaces.js';

/** The shapes a creature's pips can be drawn in, each traced in `pips.ts`. */
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
  | 'star'
  | 'bolt'
  | 'crescent'
  | 'drop'
  | 'chevron'
  | 'club';

/**
 * A symbol drawn as the pip, by its code point, written as `U+2764`: the player's own choice from
 * the custom-icon window (`pipsymbols.ts`). No ladder wears one by default.
 */
export type GlyphPip = `U+${string}`;

/** What a creature's pips are drawn as: a drawn shape, or a symbol from the pip font. */
export type Pip = PipShape | GlyphPip;

/**
 * A board's look as the renderer takes it: the colours the settings call its palette, the pip its
 * creatures wear, and the accent the menus wear. `Settings.themeFor` puts a ladder's together from
 * the palette and the icon chosen for it.
 */
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
export type SfxPackId =
  'chime' | 'blip' | 'thud' | 'glass' | 'wood' | 'pluck' | 'bubble' | 'clock' | 'organ';

/** Everything the game can make a noise about; the recipes are in `sfx.ts`. */
export type SfxEvent =
  | 'open'
  | 'cascade'
  | 'mark'
  | 'note'
  | 'battle'
  | 'kill'
  | 'levelup'
  | 'spell'
  | 'sweep'
  | 'blocked'
  | 'win'
  | 'lose';

/** Every sound event, for reading a saved list of them. */
export const SFX_EVENTS: readonly SfxEvent[] = [
  'open',
  'cascade',
  'mark',
  'note',
  'battle',
  'kill',
  'levelup',
  'spell',
  'sweep',
  'blocked',
  'win',
  'lose',
];

/**
 * Board-clear celebrations. See `victory/`.
 *
 * Two families. The first five are ambient — decoration drawn over the board,
 * knowing nothing about what is underneath. The rest animate the board's own
 * creature glyphs, which is why they need the renderer to hand those glyphs
 * over for the length of the animation.
 */
export type VictoryId =
  | 'confetti'
  | 'burst'
  | 'ripple'
  | 'sparkle'
  | 'fireworks'
  | 'tumble'
  | 'cascade'
  | 'pop'
  | 'burn'
  | 'wipe'
  | 'wipeDown'
  | 'wipeRadial'
  | 'flip'
  | 'spin'
  | 'scatter'
  | 'float'
  | 'march'
  | 'swarm';

/** A ladder's defaults. The player can override each; this is what "game type default" means. */
export interface LadderLook {
  palette: TypeTheme;
  font: FontId;
  sfx: SfxPackId;
  victory: VictoryId;
}
