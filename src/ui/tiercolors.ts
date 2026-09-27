/**
 * The colours a creature's tier is drawn in: its pips, the HUD's level number, the LV buttons, the
 * tutor's named cell and the clear effects. One colour per tier, and the halo tiers 6 to 9 wear
 * round every pip.
 *
 * Global, not per ladder: pip SHAPE carries ladder identity, pip COLOUR carries tier identity, so
 * a tier 4 looks the same on every board (`theme.ts`). DOM-free, so the tests can measure them.
 */

/** A colour for each tier, and the halo the top tiers wear. */
export interface TierPalette {
  /** Tiers 1 to 9, as `#rrggbb`. */
  readonly colors: readonly string[];
  /** The ring round each pip of tiers 6 to 9, and round their level number and LV button. */
  readonly halo: string;
}

/** The game's ceiling: a creature's pips are a die face, and there are nine. */
const TIER_COUNT = 9;

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
 * Validated against a near-black floor: the only soft spot is yellow against
 * green under protanopia (ΔE 6.4), and the pip count disambiguates that pair
 * completely on its own.
 */
const HUES = ['#54c8ff', '#5fd97a', '#ffd447', '#ff8f3a', '#ff5fc4'] as const;

/** The halo tiers past the fifth wear. */
const TIER_GOLD = '#ffcc33';

export const DEFAULT_TIERS: TierPalette = {
  // Tiers 6-9 reuse the first four hues, so the palette covers nine tiers without nine
  // barely-distinguishable colours.
  colors: [...HUES, ...HUES.slice(0, TIER_COUNT - HUES.length)],
  halo: TIER_GOLD,
};

export function tierColor(palette: TierPalette, tier: number): string {
  return palette.colors[Math.min(TIER_COUNT, Math.max(1, tier)) - 1]!;
}

/** True for tiers 6+, which wear their colour with the halo. */
export function tierGilded(tier: number): boolean {
  return tier >= FIRST_GILDED_TIER;
}
