/**
 * Browser-side access to the generated tuning data.
 *
 * Bundled at build time, so there is no fetch and no loading state. The Node
 * equivalent lives in `src/data.ts`; the engine itself reads neither.
 */

import laddersJson from '../../design/data/ladders.json';
import type { LadderCategory, Ladders } from '../engine/config.js';

/** Every ladder, in the order the data lists them: the table every screen reads. */
export const ladders = laddersJson as unknown as Ladders;

/**
 * Each category's name: the ladder list's column heads, and the palette and font windows' when
 * they sort by ladder. Normal is the original game's seven modes; the rest say what a ladder is
 * about.
 */
export const CATEGORY_NAMES: Record<LadderCategory, string> = {
  normal: 'Normal',
  shape: 'Shape',
  magic: 'Magic',
  special: 'Special',
};

/** A ladder's name as the screens show it, or its id where the table has no such ladder. */
export function ladderName(typeId: string): string {
  return ladders.find((t) => t.id === typeId)?.name ?? typeId;
}
