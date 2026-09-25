/**
 * The uniform placement, the original: shuffle the cells a creature may stand on and deal out
 * `quantity`. It asks nothing of the board and tells the player nothing beyond the numbers.
 */

import { ONE_POOL, dealByPool, shapeLeftTooFew } from './deal.js';
import {
  NOTHING_EMPTIED,
  NO_RING_PROOF,
  PLAIN_DISPLAY,
  type PlacementRule,
  WHOLE_SUM,
} from './rule.js';

export const UNIFORM_RULE: PlacementRule = {
  id: 'uniform',
  validate: () => {},
  opening: 'auto',
  deal: (d) => dealByPool(d, ONE_POOL, shapeLeftTooFew(d.cfg)),
  coveredCanBeEmpty: true,
  candidates: () => null,
  guessFree: false,
  cap: WHOLE_SUM,
  ringProof: NO_RING_PROOF,
  emptied: NOTHING_EMPTIED,
  display: PLAIN_DISPLAY,
};
