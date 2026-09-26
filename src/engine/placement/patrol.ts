/**
 * The patrol placement: every creature walks a square route, and no two routes share a cell.
 *
 * A tier-t creature's route is the edge of a square t cells a side, 4t cells, and it starts on the
 * route's top-left corner (`src/engine/patrol.ts` walks it). The deal lays the routes before
 * anything else, the biggest first: for each tier it shuffles every corner a route of that size
 * could have, then walks the list and takes each corner whose whole route is still free. A tier
 * that runs out of corners restarts the whole deal, since the quota must land exactly: C_k assumed
 * it, and a board a creature short would sit one kill under its top gate on that seed only.
 *
 * WHAT IT COSTS. Every creature holds its route for good, four cells per tier, so the board runs
 * far sparser than an ordinary one: NORMAL's tier mix averages about 9 route cells a creature, and
 * the packing jams long before that fills the board (`PATROL_MAX_DENSITY`).
 *
 * WHAT IT DOES NOT TOUCH. A placement decides where, never how many, so `quantity` and C_k are the
 * ladder's own; a beaten creature lies on its own route, where nobody else walks, and still counts
 * in the numbers as it does everywhere. The proofs are the uniform ones, read off the board as it
 * stands this move: a number is the sum of the creatures round it now, so a proof about now is
 * sound, and a creature standing on uncovered ground is covered again while it stands there.
 */

import { routeCells } from '../patrol.js';
import { shuffle } from '../rng.js';
import type { Grid } from '../grid.js';
import type { BoardConfig } from '../types.js';
import { ONE_POOL, placeDealt } from './deal.js';
import {
  type Deal,
  NO_CANDIDATES,
  NOTHING_EMPTIED,
  NO_RING_PROOF,
  PLAIN_DISPLAY,
  type PlacementRow,
  type PlacementRule,
  WHOLE_SUM,
  boardName,
} from './rule.js';

/**
 * The densest a patrol board can be dealt reliably, creatures over cells. Measured 25 September
 * 2026 on NORMAL's boards with NORMAL's tier mix, 300 seeds a board: no jam at 8.5% (8.6% once a
 * board's count is rounded), and jams on 5 to 50% of seeds at 9%.
 */
const PATROL_MAX_DENSITY = 0.086;

/** Whole deals tried before a board is refused. */
const PATROL_ATTEMPTS = 50;

/** The cells a route claims, as flat indices, or null if any of them is off the board. */
function routeFlats(cfg: BoardConfig, x: number, y: number, tier: number): number[] | null {
  if (x + tier >= cfg.width || y + tier >= cfg.height) return null;
  return routeCells(x, y, tier).map((c) => c.y * cfg.width + c.x);
}

/** Every route laid, as corner flat index to tier, or null if this attempt jammed. */
function layRoutes(d: Deal): Map<number, number> | null {
  const { cfg } = d;
  const allowed = new Set(d.spawnable);
  const used = new Set<number>();
  const corners = new Map<number, number>();
  for (let tier = cfg.quantity.length; tier >= 1; tier--) {
    const want = cfg.quantity[tier - 1]!;
    if (want === 0) continue;
    const order: number[] = [];
    for (let y = 0; y + tier < cfg.height; y++) {
      for (let x = 0; x + tier < cfg.width; x++) order.push(y * cfg.width + x);
    }
    shuffle(order, d.rng);
    let placed = 0;
    for (const corner of order) {
      if (placed === want) break;
      const cells = routeFlats(cfg, corner % cfg.width, Math.floor(corner / cfg.width), tier);
      if (!cells || cells.some((c) => !allowed.has(c) || used.has(c))) continue;
      for (const c of cells) used.add(c);
      corners.set(corner, tier);
      placed++;
    }
    if (placed < want) return null;
  }
  return corners;
}

function dealPatrols(d: Deal): void {
  for (let attempt = 0; attempt < PATROL_ATTEMPTS; attempt++) {
    const corners = layRoutes(d);
    if (corners) {
      placeDealt(d, corners);
      return;
    }
  }
  throw new Error(
    `board ${d.cfg.typeId}#${d.cfg.board}: ${PATROL_ATTEMPTS} deals jammed before every ` +
      `route was laid; the density is past what patrols can pack`,
  );
}

/**
 * A patrol board is a plain square grid: a route is a square of cells, which a hex grid does not
 * have and a wrapped or cut-out board would bend. The routes must also fit, at least on paper:
 * the biggest square inside the board, and every route's cells within the board's.
 */
function validatePatrols(row: PlacementRow): void {
  const where = boardName(row);
  if (row.topology === 'hex') throw new Error(`${where}: a patrol walks a square, not hexes`);
  if (row.wrap && row.wrap !== 'none')
    throw new Error(`${where}: a patrol walks an unwrapped board`);
  if (row.shape && row.shape !== 'rect') throw new Error(`${where}: a patrol walks a plain board`);
  if (row.tiers >= Math.min(row.width, row.height)) {
    throw new Error(
      `${where}: a tier-${row.tiers} route does not fit a ${row.width}x${row.height} board`,
    );
  }
  const share = row.monsters / row.cells;
  if (share > PATROL_MAX_DENSITY) {
    throw new Error(
      `${where}: ${row.monsters} creatures on ${row.cells} cells is ${(100 * share).toFixed(1)}%, ` +
        `past the ${(100 * PATROL_MAX_DENSITY).toFixed(1)}% patrols can be dealt at reliably`,
    );
  }
}

/** A dealt board's fault: a creature off its corner's route, or two routes sharing a cell. */
function patrolFault(grid: Grid, cfg: BoardConfig): string | null {
  const used = new Set<number>();
  for (const row of grid) {
    for (const cell of row) {
      if (cell.tier === 0) continue;
      const cells = routeFlats(cfg, cell.x, cell.y, cell.tier);
      if (!cells) return `the tier-${cell.tier} route at (${cell.x},${cell.y}) leaves the board`;
      for (const c of cells) {
        if (used.has(c)) return `two routes share (${c % cfg.width},${Math.floor(c / cfg.width)})`;
        used.add(c);
      }
    }
  }
  return null;
}

export const PATROL_RULE: PlacementRule = {
  id: 'patrol',
  validate: validatePatrols,
  opening: 'auto',
  deal: dealPatrols,
  patrols: true,
  coveredCanBeEmpty: true,
  candidates: NO_CANDIDATES,
  guessFree: false,
  cap: WHOLE_SUM,
  ringProof: NO_RING_PROOF,
  emptied: NOTHING_EMPTIED,
  display: PLAIN_DISPLAY,
  pools: ONE_POOL,
  groups: null,
  fault: patrolFault,
};
