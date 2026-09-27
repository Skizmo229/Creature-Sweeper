/**
 * The orders the long pickers offer (decision 0052). The palette window's: by ladder, under the
 * ladder list's own column heads and in its order; by name; and by colour, round the wheel.
 */

import { LADDER_CATEGORIES } from '../../engine/config.js';
import { lch } from '../colorspace.js';
import { ladders } from '../ladders.js';
import { LOOK_IDS, themeFor } from '../looks.js';
import { CATEGORY_NAMES } from '../screens/ladders.js';
import { typeName } from './context.js';
import type { PickerSort, SortGroup } from './widgets.js';

/**
 * Below this chroma a tile counts as grey and goes after every colour, because a grey's hue is
 * noise. Measured 27 Sep 2026: the four greys are 8 or less (BLIND 0, SPRINKLE DONUT's glaze 4,
 * HUGE x BLIND 5, GEAR 8), and the greyest tile with a colour, PACKS's wolf grey, 13.
 */
const GREY_CHROMA = 10;

/** Every ladder, under the ladder list's column heads, each column in the list's order. */
function byLadder(): SortGroup[] {
  return LADDER_CATEGORIES.map((category) => ({
    heading: CATEGORY_NAMES[category],
    values: ladders.filter((t) => t.category === category).map((t) => t.id),
  }));
}

/**
 * Palettes round the colour wheel by the hue of the covered tile, which is most of a board before
 * it is played and most of every thumbnail: red, through yellow, green and blue, to purple. Then
 * the greys, lightest first.
 */
function byColour(ids: readonly string[]): string[] {
  const tiles = ids.map((id) => ({ id, ...lch(themeFor(id).tile) }));
  const colours = tiles.filter((t) => t.chroma >= GREY_CHROMA).sort((a, b) => a.hue - b.hue);
  const greys = tiles
    .filter((t) => t.chroma < GREY_CHROMA)
    .sort((a, b) => b.lightness - a.lightness);
  return [...colours, ...greys].map((t) => t.id);
}

export function paletteSorts(): PickerSort[] {
  const byName = [...LOOK_IDS].sort((a, b) => typeName(a).localeCompare(typeName(b)));
  return [
    { label: 'Ladder', groups: byLadder() },
    { label: 'Name', groups: [{ values: byName }] },
    { label: 'Colour', groups: [{ values: byColour(LOOK_IDS) }] },
  ];
}
