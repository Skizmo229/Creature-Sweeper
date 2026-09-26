/**
 * The uniform placement, the original: shuffle the cells a creature may stand on and deal out
 * `quantity`. It asks nothing of the board and tells the player nothing beyond the numbers.
 */

import { ONE_POOL, dealByPool, shapeLeftTooFew } from './deal.js';
import {
  NO_CANDIDATES,
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
  patrols: false,
  coveredCanBeEmpty: true,
  candidates: NO_CANDIDATES,
  guessFree: false,
  cap: WHOLE_SUM,
  ringProof: NO_RING_PROOF,
  emptied: NOTHING_EMPTIED,
  display: PLAIN_DISPLAY,
  pools: ONE_POOL,
  groups: null,
  fault: () => null,
};
