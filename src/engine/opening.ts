/**
 * Choosing the opening: the cells the board reveals before the player's first move.
 */

import type { BoardConfig, Cell, Topology, Wrap } from './types.js';
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
function baseCells(grid: Grid, rows: number): Cell[] {
  return grid.slice(-rows).flatMap((row) => row.filter((cell) => cell.present));
}

/**
 * Fallback for boards with no zero-region at all — unreachable at ladder
 * densities (28,000 simulated boards, zero failures) but possible in Free mode
 * once density climbs past roughly 40%. Pick the safest single cell: lowest
 * number, then most empty neighbours.
 */
function findFallbackOpening(
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

/** What dealing an opening changes on a board. `Game` satisfies it. */
export interface OpeningHost {
  readonly grid: Grid;
  readonly config: BoardConfig;
  /** Open one cell without cascading; false if it was already open. */
  markOpen(cell: Cell): boolean;
  /** Uncover a cell, cascading through blanks; the cells opened. */
  reveal(start: Cell): Array<{ x: number; y: number }>;
  /** Write a mark, keeping the per-tier counters honest. */
  applyMark(cell: Cell, mark: number): void;
}

/**
 * Reveal what the board's opening rule hands the player before their first move. None of it is
 * the player's work, so none of it pays EXP or exploration mana.
 */
export function dealOpening(host: OpeningHost): void {
  switch (host.config.opening) {
    case 'auto':
      openLargest(host);
      return;
    case 'empties':
      openEveryEmpty(host);
      return;
    case 'base':
      openBase(host);
      return;
    case 'islands':
      openIslands(host);
      return;
    case 'none':
      return;
  }
}

/** Reveal the largest blank area, or, on a board without one, the safest single cell. */
function openLargest(host: OpeningHost): void {
  const { grid, config } = host;
  const best = findBestOpening(grid, false, config.topology, config.wrap);
  if (best) {
    for (const cell of best.cells) host.markOpen(cell);
    return;
  }
  const fallback = findFallbackOpening(grid, config.topology, config.wrap);
  if (fallback) host.reveal(fallback);
}

/**
 * Open every empty cell on the board — the Sudoku opening.
 *
 * There are exactly nine of them, one per row, column and box, because tier
 * 0 is one of the nine digits. They pay no EXP and no exploration mana: like
 * the dealt opening everywhere else, they are not the player's work.
 */
function openEveryEmpty(host: OpeningHost): void {
  for (const row of host.grid) {
    for (const cell of row) {
      if (cell.present && cell.tier === 0) host.markOpen(cell);
    }
  }
}

/**
 * Open the `ISLANDS` largest blank areas, each with its fringe, as separate footholds. A board
 * without one falls back as the single opening does.
 */
function openIslands(host: OpeningHost): void {
  const { grid, config } = host;
  const islands = findOpenings(grid, ISLANDS, config.topology, config.wrap);
  if (!islands.length) {
    openLargest(host);
    return;
  }
  for (const island of islands) for (const cell of island.cells) host.markOpen(cell);
}

/**
 * Deal the bottom rows face up, as Reveal deals a cell: empty ground opens and cascades, and a
 * creature is written as a given and left alive, to be fought when the player's level allows.
 * Nothing is killed, so every creature still pays its EXP (decision 0038).
 */
function openBase(host: OpeningHost): void {
  for (const cell of baseCells(host.grid, BASE_ROWS)) {
    if (cell.tier === 0) {
      host.reveal(cell);
    } else {
      host.applyMark(cell, cell.tier);
      cell.given = true;
    }
  }
}
