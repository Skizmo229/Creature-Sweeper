/**
 * Browser-side access to the generated tuning data.
 *
 * Bundled at build time, so there is no fetch and no loading state. The Node
 * equivalent lives in `src/data.ts`; the engine itself reads neither.
 */

import laddersJson from '../../design/data/ladders.json';
import type { Ladders } from '../engine/config.js';

/** Every ladder, in the order the data lists them: the table every screen reads. */
export const ladders = laddersJson as unknown as Ladders;
