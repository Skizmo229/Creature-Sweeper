/**
 * The grid: cells, adjacency and numbers.
 *
 * Adjacency lives in exactly one place, `neighbours()`, which is why a new board topology or a
 * wrapped edge costs so little: numbers, cascades, the opening, Sweep's proof, Census and the
 * crawl rule all read adjacency through it and need no changes.
 */

import type { BoardConfig, Cell, Topology, Wrap } from './types.js';

/** All eight surrounding cells. */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Pointy-top hexes in odd-r offset rows: odd rows sit half a hex to the right,
 * so which diagonals exist depends on the row's parity. Six neighbours, not
 * eight — which changes the arithmetic of the whole board, see `topology` in
 * types.ts.
 */
const HEX_DIRS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // even rows
  [
    [-1, 0],
    [1, 0],
    [-1, -1],
    [0, -1],
    [-1, 1],
    [0, 1],
  ],
  // odd rows
  [
    [-1, 0],
    [1, 0],
    [0, -1],
    [1, -1],
    [0, 1],
    [1, 1],
  ],
];

function dirsFor(topology: Topology, y: number): ReadonlyArray<readonly [number, number]> {
  return topology === 'hex' ? HEX_DIRS[y & 1]! : DIRS;
}

export type Grid = Cell[][];

export function makeCell(x: number, y: number): Cell {
  return {
    x,
    y,
    tier: 0,
    num: 0,
    open: false,
    alive: false,
    present: true,
    mark: 0,
    given: false,
    notes: 0,
    census: null,
  };
}

/** A boolean grid over the bounding box: which cells exist, or may hold a creature. */
export type Mask = boolean[][];

export function blankMask(w: number, h: number): Mask {
  return Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
}

export function countPresent(mask: Mask, w: number, h: number): number {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y]![x]) n++;
  return n;
}

export function inBounds(cfg: BoardConfig, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < cfg.width && y < cfg.height;
}

/**
 * The neighbours of a cell, for this board's topology and wrapping.
 *
 * The single place adjacency is decided. Numbers, cascades, the opening,
 * Sweep's proof and Census all read through here, which is why a new board
 * shape or a wrapped edge costs almost nothing.
 */
export function neighbours(
  grid: Grid,
  x: number,
  y: number,
  topology: Topology = 'square',
  wrap: Wrap = 'none',
): Cell[] {
  const out: Cell[] = [];
  const h = grid.length;
  const w = grid[0]!.length;
  // A hole neighbours nothing, in either direction. The other half of this is
  // below; without this half adjacency is asymmetric, because a hole beside an
  // arm would list the arm while the arm rightly refuses to list the hole.
  // Only ever visible on a shaped board, and it went unnoticed until one was
  // also wrapped — nothing asks a hole for its neighbours during play, since
  // `cellAt` will not hand one out.
  if (grid[y]?.[x]?.present === false) return out;
  const wrapX = wrap !== 'none';
  const wrapY = wrap === 'both';

  for (const [dx, dy] of dirsFor(topology, y)) {
    let nx = x + dx;
    let ny = y + dy;

    if (wrapX) nx = ((nx % w) + w) % w;
    else if (nx < 0 || nx >= w) continue;

    if (wrapY) ny = ((ny % h) + h) % h;
    else if (ny < 0 || ny >= h) continue;

    // Only reachable on a board too narrow to wrap sanely; config rejects those.
    if (nx === x && ny === y) continue;
    const cell = grid[ny]![nx]!;
    // A hole is not a neighbour. This is what makes shaped boards easier:
    // fewer neighbours means fewer unknowns behind each number.
    if (!cell.present) continue;
    out.push(cell);
  }
  return out;
}

/**
 * Each cell's number is the SUM of its neighbours' tiers, not a count of them.
 * Computed for every cell, creatures included — a defeated creature can show
 * its own number.
 */
export function computeNumbers(
  grid: Grid,
  topology: Topology = 'square',
  wrap: Wrap = 'none',
): void {
  for (const row of grid) {
    for (const cell of row) {
      let sum = 0;
      for (const n of neighbours(grid, cell.x, cell.y, topology, wrap)) sum += n.tier;
      cell.num = sum;
    }
  }
}
