/**
 * Choosing the opening: the cells the board reveals before the player's first move.
 */

import type { Cell, Topology, Wrap } from './types.js';
import { type Grid, neighbours } from './grid.js';

export interface Opening {
  /** Every cell the cascade would uncover: the zero-region plus its fringe. */
  cells: Cell[];
  /** How many of those are zero cells (the region itself). */
  zeroCount: number;
}

/**
 * Find the opening the game hands the player: the zero-region whose cascade
 * reveals the most cells, the first in reading order on a tie.
 *
 * "Size" counts the region *and* its fringe of numbered cells, because that is
 * what the player actually gets to see. A zero cell is empty ground whose
 * neighbours are all empty too, so a cascade can never uncover a creature.
 */
export function findBestOpening(
  grid: Grid,
  coveredOnly = false,
  topology: Topology = 'square',
  wrap: Wrap = 'none',
): Opening | null {
  let best: Opening | null = null;
  for (const region of zeroRegions(grid, coveredOnly, topology, wrap)) {
    if (!best || region.cells.length > best.cells.length) best = region;
  }
  return best;
}

/** How many separate openings the 'islands' rule deals. */
export const ISLANDS = 3;

/**
 * The `count` zero-regions whose cascades reveal the most cells, largest first, ties in reading
 * order. Separate by construction: two zero-regions that touched would be one. Their fringes may
 * share a numbered cell, so two islands can meet at an edge, but never through a blank.
 */
export function findOpenings(
  grid: Grid,
  count: number,
  topology: Topology = 'square',
  wrap: Wrap = 'none',
): Opening[] {
  const regions = zeroRegions(grid, false, topology, wrap);
  return regions.sort((a, b) => b.cells.length - a.cells.length).slice(0, count);
}

/** Every zero-region and what its cascade would reveal, in reading order of its first cell. */
function zeroRegions(grid: Grid, coveredOnly: boolean, topology: Topology, wrap: Wrap): Opening[] {
  const h = grid.length;
  const w = grid[0]!.length;
  const seen: boolean[][] = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  const regions: Opening[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = grid[y]![x]!;
      if (seen[y]![x] || !start.present || start.tier !== 0 || start.num !== 0) continue;
      // Beacon wants a region nobody has touched yet, not the one you started on.
      if (coveredOnly && start.open) continue;

      // Flood the 8-connected component of zero cells, collecting its fringe.
      const region: Cell[] = [];
      const revealed = new Set<Cell>();
      const stack: Cell[] = [start];
      seen[y]![x] = true;

      while (stack.length) {
        const cell = stack.pop()!;
        region.push(cell);
        revealed.add(cell);
        for (const n of neighbours(grid, cell.x, cell.y, topology, wrap)) {
          revealed.add(n);
          if (n.tier === 0 && n.num === 0 && !seen[n.y]![n.x]) {
            seen[n.y]![n.x] = true;
            stack.push(n);
          }
        }
      }

      regions.push({ cells: [...revealed], zeroCount: region.length });
    }
  }
  return regions;
}

/** How many rows the 'base' opening deals face up, counted from the bottom of the box. */
export const BASE_ROWS = 2;

/** The cells of the bottom `rows` rows that exist, in reading order. */
export function baseCells(grid: Grid, rows: number): Cell[] {
  return grid.slice(-rows).flatMap((row) => row.filter((cell) => cell.present));
}

/**
 * Fallback for boards with no zero-region at all — unreachable at ladder
 * densities (28,000 simulated boards, zero failures) but possible in Free mode
 * once density climbs past roughly 40%. Pick the safest single cell: lowest
 * number, then most empty neighbours.
 */
export function findFallbackOpening(
  grid: Grid,
  topology: Topology = 'square',
  wrap: Wrap = 'none',
): Cell | null {
  let best: Cell | null = null;
  let bestKey = [Infinity, -Infinity] as [number, number];

  for (const row of grid) {
    for (const cell of row) {
      if (!cell.present || cell.tier !== 0) continue;
      let empties = 0;
      for (const n of neighbours(grid, cell.x, cell.y, topology, wrap)) if (n.tier === 0) empties++;
      const key: [number, number] = [cell.num, -empties];
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = cell;
        bestKey = key;
      }
    }
  }
  return best;
}
