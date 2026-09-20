/**
 * Browser-side access to the generated tuning data.
 *
 * Bundled at build time, so there is no fetch and no loading state. The Node
 * equivalent lives in `src/data.ts`; the engine itself reads neither.
 */

import laddersJson from '../../design/data/ladders.json';
import type { Ladders } from '../engine/config.js';

export const ladders = laddersJson as unknown as Ladders;
