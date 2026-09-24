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
 * reveals the most cells.
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
  const h = grid.length;
  const w = grid[0]!.length;
  const seen: boolean[][] = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  let best: Opening | null = null;

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

      if (!best || revealed.size > best.cells.length) {
        best = { cells: [...revealed], zeroCount: region.length };
      }
    }
  }

  return best;
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
