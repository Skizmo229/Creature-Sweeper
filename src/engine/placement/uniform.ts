/**
 * The uniform placement, the original: shuffle the cells a creature may stand on and deal out
 * `quantity`. It asks nothing of the board and tells the player nothing beyond the numbers.
 */

import { ONE_POOL, dealByPool, shapeLeftTooFew } from './deal.js';
import type { PlacementRule } from './rule.js';

export const UNIFORM_RULE: PlacementRule = {
  id: 'uniform',
  validate: () => {},
  opening: 'auto',
  deal: (d) => dealByPool(d, ONE_POOL, shapeLeftTooFew(d.cfg)),
};
