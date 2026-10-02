/**
 * The colours a creature's tier is drawn in: its pips, the HUD's level number, the LV buttons, the
 * tutor's named cell and the clear effects. One colour per tier, and the halo tiers 6 to 9 wear
 * round every pip.
 *
 * Global, not per ladder: pip SHAPE carries ladder identity, pip COLOUR carries tier identity, so
 * a tier 4 looks the same on every board (`theme.ts`). The player can choose one of the presets
 * below or mix their own for each tier (decision 0053). DOM-free, so the tests can measure them.
 */

/** A colour for each tier, and the halo the top tiers wear. */
export interface TierPalette {
  /** Tiers 1 to 9, as `#rrggbb`. */
  readonly colors: readonly string[];
  /** The ring round each pip of tiers 6 to 9, and round their level number and LV button. */
  readonly halo: string;
}

/** The game's ceiling: a creature's pips are a die face, and there are nine. */
export const TIER_COUNT = 9;

/** The first tier drawn with the halo. */
const FIRST_GILDED_TIER = 6;

/**
 * The game's own tier colours: five hues, reused for tiers 6-9 with a gold halo.
 *
 * Deliberately NOT a warm threat ramp: yellow/orange/red cluster so tightly
 * that adjacent tiers were indistinguishable (yellow against lime measured
 * ΔE 2.5 under protanopia), which is what made the glyphs hard to read. Since
 * the pip *count* already encodes magnitude, colour's job here is identity, so
 * the hues are spread instead of ramped.
 *
 * Measured on 27 Sep 2026 by the method of 0050 (decision 0053): the closest
 * pairs are tiers 1 and 2 under tritanopia (ΔE 12) and 3 and 4 under
 * deuteranopia (16), and the pip count tells every pair apart on its own.
 */
const HUES = ['#54c8ff', '#5fd97a', '#ffd447', '#ff8f3a', '#ff5fc4'];

/** The halo tiers past the fifth wear, in every preset: the game's mark of a high tier. */
const TIER_GOLD = '#ffcc33';

/**
 * Five colours for tiers 1 to 5, and the first four again for 6 to 9 under the gold halo, so the
 * palette covers nine tiers without nine barely-distinguishable colours.
 */
function fiveAndHalo(five: readonly string[]): TierPalette {
  return { colors: [...five, ...five.slice(0, TIER_COUNT - five.length)], halo: TIER_GOLD };
}

/** The game's own tier colours. */
export const DEFAULT_TIERS: TierPalette = fiveAndHalo(HUES);

/** The presets offered besides the game's own, by id. */
export type TierPresetId = 'distinct' | 'nine' | 'plain';

/** A palette offered besides the game's own, by name. */
export interface TierPreset {
  readonly id: TierPresetId;
  readonly name: string;
  /** What it is for, after its name on its tile. */
  readonly blurb: string;
  readonly palette: TierPalette;
}

/**
 * Five colours searched for, from sRGB in steps of 15, to stay furthest apart under normal
 * vision and under protanopia, deuteranopia and tritanopia at once, each no harder to see on any
 * ladder's floor than the game's own (decision 0053). Tiers 1 to 5 of both presets that follow.
 */
const DISTINCT = ['#87a5b4', '#00ffa5', '#ffff00', '#e1871e', '#d278ff'];

/**
 * The presets, chosen by measurement (decision 0053). Under every colour vision measured, Distinct
 * keeps tiers further apart than the game's own colours do (tiers the halo already parts aside);
 * Nine colours adds four more, so no two tiers share a colour and the halo is not needed to tell a
 * 6 from a 1; Plain leaves the telling to the pips' count alone.
 */
export const TIER_PRESETS: readonly TierPreset[] = [
  {
    id: 'distinct',
    name: 'Distinct',
    blurb: 'apart under any colour vision',
    palette: fiveAndHalo(DISTINCT),
  },
  {
    id: 'nine',
    name: 'Nine colours',
    blurb: 'one for every tier',
    // Each of 6 to 9 a cousin of the tier five below it, as the game's own palette has them:
    // periwinkle for slate, cyan for mint, pale lime for yellow, rose for orange.
    palette: { colors: [...DISTINCT, '#8796ff', '#00ffff', '#e1ffa5', '#ff6996'], halo: TIER_GOLD },
  },
  {
    id: 'plain',
    name: 'Plain',
    blurb: 'white, told apart by count',
    palette: fiveAndHalo(new Array<string>(5).fill('#ffffff')),
  },
];

/** A tier's colour in a palette, the tier held to 1 to `TIER_COUNT`. */
export function tierColor(palette: TierPalette, tier: number): string {
  return palette.colors[Math.min(TIER_COUNT, Math.max(1, tier)) - 1]!;
}

/** True for tiers 6+, which wear their colour with the halo. */
export function tierGilded(tier: number): boolean {
  return tier >= FIRST_GILDED_TIER;
}
