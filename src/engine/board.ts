/**
 * Board generation, neighbour sums, and choosing the opening.
 *
 * Adjacency lives in exactly one place — `neighbours()` — which is why a whole
 * new board topology costs so little: numbers, cascades, the opening, Sweep's
 * proof and Census all read adjacency through it and need no changes.
 */

import type { BoardConfig, BoardShape, Cell, Topology, Wrap } from './types.js';
import { type Rng, randInt, shuffle } from './rng.js';
import { SUDOKU_SIZE, generateSudokuBoard } from './sudoku.js';
import { dungeonMap } from './dungeon.js';
import { type Shade, shadeAt, shadeForTier } from './checker.js';
import { choosePairs, isPaired } from './pairs.js';
import { dealTiles, setsIn } from './dominoes.js';
import { choosePacks, dealPacks, isPacked, packsIn } from './packs.js';
import { chooseLines, dealLines } from './congo.js';

/** All eight surrounding cells. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
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

export function dirsFor(topology: Topology, y: number): ReadonlyArray<readonly [number, number]> {
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

/**
 * Does this cell of the bounding box exist, for the given shape?
 *
 * Shape parameters are in cells: `param` is the donut's ring thickness and the
 * cross's arm width. Diamond takes none — it is the inscribed rhombus.
 *
 * Cave and dungeon are deliberately absent here: their masks depend on the
 * seed, so they are not per-cell predicates at all. Everything that needs a
 * mask goes through `buildMask`, which is the only caller of this function.
 */
export function isPresent(
  shape: BoardShape,
  param: number,
  w: number,
  h: number,
  x: number,
  y: number,
): boolean {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  switch (shape) {
    case 'donut':
      return x < param || y < param || x >= w - param || y >= h - param;
    case 'cross':
      return Math.abs(x - cx) <= param / 2 || Math.abs(y - cy) <= param / 2;
    case 'diamond':
      return Math.abs(x - cx) / (w / 2) + Math.abs(y - cy) / (h / 2) <= 1;
    case 'cave':
    case 'dungeon':
      throw new Error(`${shape} has no per-cell predicate — it is seeded, use buildMask`);
    case 'rect':
    default:
      return true;
  }
}

/**
 * How many cells a shape actually leaves. The ladder data must agree.
 *
 * For cave and dungeon this is the parameter itself rather than a count of
 * anything: the mask is built to hit that number exactly, on every seed. See
 * `caveMask` and `dungeonMask`.
 */
export function presentCellCount(shape: BoardShape, param: number, w: number, h: number): number {
  if (shape === 'cave' || shape === 'dungeon') return param;
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (isPresent(shape, param, w, h, x, y)) n++;
    }
  return n;
}

/**
 * The ragged cave: a blob of caverns and passages, seeded, and built from
 * exactly the cells the ladder budgeted for it.
 *
 * Why exact, and why that is the whole trick. Every level threshold on a board
 * derives from C_k, the total EXP its creatures are worth, which needs the
 * creature quota fixed before the board exists — and the quota is a density
 * applied to the cells the shape leaves. A mask whose size wobbled with the
 * seed would move C_k with it, so the thresholds in `ladders.json` would be
 * right for one seed and wrong for the rest. That is the reason a ragged cave
 * sat deferred: not the carving, the counting.
 *
 * Pinning the count settles it. `shapeParam` IS the cell count, the generator
 * is required to land on it, and everything upstream — quota, C_k, thresholds,
 * the zero-damage guarantee — carries over from the fixed shapes untouched.
 * `ladders.py` needs no copy of this algorithm either; it records the number it
 * asked for.
 *
 * Nothing is ever carved away. The cave is *grown*: a budget of cells is laid
 * down two-by-two until it runs out, so the count only ever climbs to the
 * target and the last cell placed is the last cell there is. The earlier
 * version generated a noise field and trimmed it down, which hit the same
 * number but read differently — trimming pares a cave back from its rims, and
 * where it stops is a subtraction rather than a shape. Growing puts every cell
 * somewhere on purpose.
 *
 * Two-by-two is also the only way to promise a minimum width. Every cell
 * arrives as one corner of a 2x2 square laid down whole, and nothing is ever
 * removed, so every cell stays inside a full 2x2 square forever: there is no
 * passage one cell wide anywhere on the board, and no way for one to appear
 * later. Corner-to-corner touches are refused for the same reason — two lobes
 * meeting at a point are a gap you could squeeze through but never walk down.
 *
 * The shape comes from the space it is grown into rather than from the growth:
 * a rim that wanders in from the inscribed ellipse, with caverns punched out
 * of the inside before a single cell is placed. Growth then fills what is
 * left, and stops short of filling it, so the leftovers fray the edges of both.
 */
const CAVE_MARGIN = 1;
/** How far the rim may wander in from the inscribed ellipse, as a fraction. */
const CAVE_RIM_WOBBLE = 0.22;
/**
 * The rim's exponent. 2 is an ellipse, which wastes a fifth of the bounding
 * box on corners no cave ever reaches; higher rounds the shape out toward the
 * box without ever squaring it off. The wobble is what keeps it from reading
 * as a rounded rectangle.
 */
const CAVE_RIM_POWER = 2.6;
/** How much of the blob is punched out as caverns before growth starts. */
const CAVE_VOID_SHARE = 0.26;
/** Cavern radii, in cells. Never below 2: a one-cell hole reads as a speck. */
const CAVE_VOID_MIN = 2;
const CAVE_VOID_MAX = 3.6;
/** How far out a cavern's centre may sit, as a fraction of the rim. */
const CAVE_VOID_REACH = 0.74;
/** Caverns rejected in a row before the space is taken as full enough. */
const CAVE_VOID_MISSES = 12;
/** Random probes at the growth frontier before falling back to a full pass. */
const CAVE_PROBES = 24;
/**
 * Rebuilds allowed before giving up. A cave can paint itself into a corner —
 * caverns can cut the blob into pieces too small to hold the budget — and the
 * cheapest answer is a different set of caverns, not a cleverer growth rule.
 * Each attempt draws fresh from the same rng, so the board stays a pure
 * function of its seed.
 */
const CAVE_ATTEMPTS = 8;

type Mask = boolean[][];

function blankMask(w: number, h: number): Mask {
  return Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
}

function countPresent(mask: Mask, w: number, h: number): number {
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y]![x]) n++;
  return n;
}

/**
 * The rim: an ellipse with a few harmonics laid over it, so no two caves have
 * the same outline and none of them has the bounding box's outline.
 */
function rimLimit(rng: Rng): (angle: number) => number {
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  return (a) =>
    1 -
    CAVE_RIM_WOBBLE *
      (0.5 + 0.2 * Math.sin(2 * a + p1) + 0.2 * Math.sin(3 * a + p2) + 0.1 * Math.sin(5 * a + p3));
}

/**
 * Where the cave is allowed to be: inside the rim, outside the caverns.
 *
 * Punching the caverns out first is what stops growth from settling into a
 * disc. Left to itself a budget spent from one seed spreads evenly and ends up
 * round; made to flow around obstacles it ends up as chambers and the passages
 * between them.
 *
 * Each cavern is kept only if the cave still fits around it. That one test
 * does two jobs. It keeps a cavern from cutting the blob in half — which is
 * how the first version of this went wrong, growing a neat little island in
 * whichever piece the seed landed in while the rest of the board sat empty —
 * and it means growth cannot fail for want of room, because the space was
 * measured against the budget before a single cell was laid.
 *
 * The slack left over is where the raggedness comes from: the cave is grown
 * into a space slightly bigger than itself, so it stops a little short of the
 * walls, in different places every seed.
 */
const CAVE_SLACK = 0.08;

function caveSpace(w: number, h: number, target: number, rng: Rng): Mask {
  const space = blankMask(w, h);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const a = Math.max(1, (w - 1) / 2 - CAVE_MARGIN);
  const b = Math.max(1, (h - 1) / 2 - CAVE_MARGIN);
  const limit = rimLimit(rng);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / a;
      const dy = (y - cy) / b;
      const r =
        (Math.abs(dx) ** CAVE_RIM_POWER + Math.abs(dy) ** CAVE_RIM_POWER) ** (1 / CAVE_RIM_POWER);
      if (r <= limit(Math.atan2(dy, dx))) space[y]![x] = true;
    }
  }

  // Cavern centres stay off the rim, so a cavern is a place inside the cave
  // you cannot go rather than another dent in its outline.
  const inner: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!space[y]![x]) continue;
      const dx = (x - cx) / a;
      const dy = (y - cy) / b;
      const r =
        (Math.abs(dx) ** CAVE_RIM_POWER + Math.abs(dy) ** CAVE_RIM_POWER) ** (1 / CAVE_RIM_POWER);
      if (r <= CAVE_VOID_REACH) inner.push(y * w + x);
    }
  }
  if (!inner.length) return space;

  const needed = Math.ceil(target * (1 + CAVE_SLACK));
  let budget = CAVE_VOID_SHARE * countPresent(space, w, h);
  let misses = 0;

  while (budget > 0 && misses < CAVE_VOID_MISSES) {
    const at = inner[randInt(rng, inner.length)]!;
    const vx = at % w;
    const vy = (at - vx) / w;
    const radius = CAVE_VOID_MIN + rng() * (CAVE_VOID_MAX - CAVE_VOID_MIN);

    const before = space.map((row) => row.slice());
    let carved = 0;
    for (let y = Math.max(0, Math.ceil(vy - radius)); y <= Math.min(h - 1, vy + radius); y++) {
      for (let x = Math.max(0, Math.ceil(vx - radius)); x <= Math.min(w - 1, vx + radius); x++) {
        if (!space[y]![x]) continue;
        if ((x - vx) ** 2 + (y - vy) ** 2 > radius * radius) continue;
        space[y]![x] = false;
        carved++;
      }
    }

    if (!carved || roomFor(space, w, h) < needed) {
      for (let y = 0; y < h; y++) space[y] = before[y]!;
      misses++;
      continue;
    }
    budget -= carved;
    misses = 0;
  }
  return space;
}

/**
 * The biggest chamber a two-wide passage can move around in.
 *
 * Two squares that overlap or touch can both be laid down and stay joined, so
 * this is a flood over squares rather than over cells: a corridor one cell
 * wide joins nothing here, because nothing two cells wide can get down it.
 */
function largestChamber(space: Mask, w: number, h: number): { origins: number[]; cells: number } {
  const origins = stampOrigins(space, w, h);
  const known = new Set(origins);
  const seen = new Set<number>();
  let best: { origins: number[]; cells: number } = { origins: [], cells: 0 };

  for (const start of origins) {
    if (seen.has(start)) continue;
    const queue = [start];
    seen.add(start);
    const cells = new Set<number>();
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head]!;
      const ox = idx % w;
      const oy = (idx - ox) / w;
      cells
        .add(idx)
        .add(idx + 1)
        .add(idx + w)
        .add(idx + w + 1);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const next = (oy + dy) * w + ox + dx;
          if (!known.has(next) || seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    if (cells.size > best.cells) best = { origins: queue, cells: cells.size };
  }
  return best;
}

function roomFor(space: Mask, w: number, h: number): number {
  return largestChamber(space, w, h).cells;
}

/** Every 2x2 square that lies wholly inside the space, by its top-left cell. */
function stampOrigins(space: Mask, w: number, h: number): number[] {
  const out: number[] = [];
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      if (space[y]![x] && space[y]![x + 1] && space[y + 1]![x] && space[y + 1]![x + 1]) {
        out.push(y * w + x);
      }
    }
  }
  return out;
}

/**
 * Would laying this square down leave two cells touching only at a corner?
 *
 * Only the new cells need checking: a corner touch needs both of the cells
 * between the pair to be missing, and laying cells down can only fill those
 * in. So a pair that was fine stays fine, and nothing already placed has to be
 * looked at twice.
 */
function cornerTouch(placed: Mask, w: number, h: number, ox: number, oy: number): boolean {
  const on = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < w &&
    y < h &&
    (placed[y]![x] === true || (x >= ox && x <= ox + 1 && y >= oy && y <= oy + 1));

  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const x = ox + dx;
      const y = oy + dy;
      if (placed[y]![x]) continue;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        if (on(x + sx, y + sy) && !on(x + sx, y) && !on(x, y + sy)) return true;
      }
    }
  }
  return false;
}

/** Cells this square would add that are not already there. */
function stampGain(placed: Mask, w: number, ox: number, oy: number): number {
  let n = 0;
  for (let dy = 0; dy <= 1; dy++)
    for (let dx = 0; dx <= 1; dx++) {
      if (!placed[oy + dy]![ox + dx]) n++;
    }
  return n;
}

/**
 * Spend the budget, two cells wide, until it is gone.
 *
 * The endgame is the fiddly part. With four cells left any square will do, but
 * with one left only a square already holding three will do — a notch in the
 * rim, or the last gap in a wall. Random probing finds those by luck early and
 * never by luck late, so once the budget is short the frontier is swept in
 * full and the biggest square that still fits is taken.
 */
function growCave(space: Mask, w: number, h: number, target: number, rng: Rng): Mask {
  const room = largestChamber(space, w, h);
  if (room.cells < target) {
    throw new Error(`cave ${w}x${h}: chamber holds ${room.cells}, needs ${target}`);
  }
  const usable = new Set(room.origins);

  // Start near the middle of the chamber so growth can spread every way at
  // once rather than crawling out from a wall.
  let sumX = 0;
  let sumY = 0;
  for (const idx of room.origins) {
    sumX += idx % w;
    sumY += (idx - (idx % w)) / w;
  }
  const midX = sumX / room.origins.length;
  const midY = sumY / room.origins.length;
  const central = [...room.origins].sort((p, q) => {
    const px = p % w;
    const qx = q % w;
    return (
      (px - midX) ** 2 +
      ((p - px) / w - midY) ** 2 -
      ((qx - midX) ** 2 + ((q - qx) / w - midY) ** 2)
    );
  });
  const seed = central[randInt(rng, Math.max(1, Math.floor(central.length / 8)))]!;

  const placed = blankMask(w, h);
  let count = 0;
  let frontier: number[] = [];
  const queued = new Set<number>();

  const lay = (idx: number): void => {
    const ox = idx % w;
    const oy = (idx - ox) / w;
    for (let dy = 0; dy <= 1; dy++)
      for (let dx = 0; dx <= 1; dx++) {
        if (!placed[oy + dy]![ox + dx]) {
          placed[oy + dy]![ox + dx] = true;
          count++;
        }
      }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const next = (oy + dy) * w + ox + dx;
        if (!usable.has(next) || queued.has(next)) continue;
        queued.add(next);
        frontier.push(next);
      }
    }
  };

  const fits = (idx: number, budget: number): boolean => {
    const ox = idx % w;
    const oy = (idx - ox) / w;
    const gain = stampGain(placed, w, ox, oy);
    return gain >= 1 && gain <= budget && !cornerTouch(placed, w, h, ox, oy);
  };

  lay(seed);
  while (count < target) {
    const budget = target - count;
    let chosen = -1;

    for (let probe = 0; probe < CAVE_PROBES && budget >= 4; probe++) {
      const idx = frontier[randInt(rng, frontier.length)]!;
      if (fits(idx, budget)) {
        chosen = idx;
        break;
      }
    }

    if (chosen < 0) {
      // Sweep the whole frontier, take the biggest that fits, and drop the
      // squares that have nothing left to give while we are here.
      const live: number[] = [];
      let bestGain = 0;
      for (const idx of frontier) {
        const ox = idx % w;
        const oy = (idx - ox) / w;
        const gain = stampGain(placed, w, ox, oy);
        if (gain === 0) continue;
        live.push(idx);
        if (gain > bestGain && gain <= budget && !cornerTouch(placed, w, h, ox, oy)) {
          chosen = idx;
          bestGain = gain;
        }
      }
      frontier = live;
    }

    if (chosen < 0) {
      throw new Error(`cave ${w}x${h}: stuck at ${count} of ${target} cells`);
    }
    lay(chosen);
  }
  return placed;
}

export function caveMask(w: number, h: number, target: number, rng: Rng): Mask {
  const usable = (w - 2 * CAVE_MARGIN) * (h - 2 * CAVE_MARGIN);
  if (target > usable) {
    throw new Error(`cave ${w}x${h}: ${target} cells asked for, only ${usable} inside the margin`);
  }

  let last = '';
  for (let attempt = 0; attempt < CAVE_ATTEMPTS; attempt++) {
    try {
      return growCave(caveSpace(w, h, target, rng), w, h, target, rng);
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(`cave ${w}x${h}: ${CAVE_ATTEMPTS} attempts failed, last: ${last}`);
}

/**
 * Which cells of the bounding box exist. The one place a mask is decided.
 *
 * Analytic shapes ignore the rng entirely, so their boards are byte-identical
 * to what they were before cave existed.
 */
export function buildMask(shape: BoardShape, param: number, w: number, h: number, rng: Rng): Mask {
  return buildShape(shape, param, w, h, rng).present;
}

/**
 * Which cells exist, and which of those a creature may be dealt into.
 *
 * The two are the same thing on every shape but the dungeon, where hallways
 * and doorways are map you can walk but never map a creature stands on. That
 * is the one place the distinction exists, so it is carried here rather than
 * on the cell: a `Cell` would then have a field that is a copy of `present` on
 * sixteen of seventeen ladders.
 */
export function buildShape(
  shape: BoardShape,
  param: number,
  w: number,
  h: number,
  rng: Rng,
): { present: Mask; spawnable: Mask; hall: Mask } {
  if (shape === 'dungeon') return dungeonMap(w, h, param, rng);
  const present = shape === 'cave' ? caveMask(w, h, param, rng) : blankMask(w, h);
  if (shape !== 'cave') {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        present[y]![x] = isPresent(shape, param, w, h, x, y);
      }
  }
  return { present, spawnable: present, hall: blankMask(w, h) };
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

/**
 * Place exactly `quantity[i]` creatures of tier i+1.
 *
 * Uniformly at random among the cells a creature may stand on, which is every
 * present cell on most boards, room floor only in a dungeon, and the squares
 * of the matching colour under the checkerboard rule.
 *
 * The pairing rule is the one placement that chooses its cells before it
 * chooses its tiers: `choosePairs` lays down the dominoes, and the deal that
 * follows is the ordinary shuffle-and-take over exactly those cells. That
 * split is what keeps pairing tier-blind, which is what keeps it clear of C_k.
 */
export function generateGrid(cfg: BoardConfig, rng: Rng): Grid {
  const grid: Grid = [];
  for (let y = 0; y < cfg.height; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < cfg.width; x++) row.push(makeCell(x, y));
    grid.push(row);
  }

  if (cfg.placement === 'sudoku') {
    fillSudoku(cfg, grid, rng);
    computeNumbers(grid, cfg.topology, cfg.wrap);
    return grid;
  }

  // Everywhere but the dungeon these are the same mask, so the pool below is
  // "every cell that exists" exactly as it always was.
  let spawnable: Mask | null = null;
  if (cfg.shape !== 'rect') {
    const shape = buildShape(cfg.shape, cfg.shapeParam, cfg.width, cfg.height, rng);
    for (let y = 0; y < cfg.height; y++)
      for (let x = 0; x < cfg.width; x++) {
        grid[y]![x]!.present = shape.present[y]![x]!;
      }
    spawnable = shape.spawnable;
  }

  // One pool per colour under the checkerboard rule, one pool for everything
  // else. A tier is then dealt from the pool its parity belongs to, and the
  // deal itself is the same shuffle-and-take it has always been — the rule
  // narrows where a tier may land, it never changes how many of them there are.
  const checker = cfg.placement === 'checker';
  const pools = new Map<Shade | 'any', number[]>();
  const poolFor = (key: Shade | 'any'): number[] => {
    const found = pools.get(key);
    if (found) return found;
    const made: number[] = [];
    pools.set(key, made);
    return made;
  };

  for (let i = 0; i < cfg.width * cfg.height; i++) {
    const y = Math.floor(i / cfg.width);
    const x = i % cfg.width;
    if (!grid[y]![x]!.present) continue;
    if (spawnable && !spawnable[y]![x]) continue;
    poolFor(checker ? shadeAt(x, y) : 'any').push(i);
  }
  for (const pool of pools.values()) shuffle(pool, rng);

  // The pack rule deals its own tiers, for DOMINOES's reason: one of every tier
  // has to land in each PACK, so the grouping `choosePacks` returns must reach
  // the deal intact, and the ordinary shuffle-and-take below would scatter it.
  if (isPacked(cfg.placement)) {
    const count = packsIn(cfg.tiers, cfg.quantity);
    if (count === null) {
      throw new Error(
        `board ${cfg.typeId}#${cfg.board}: quantity [${cfg.quantity.join(',')}] is not ` +
          `a whole number of packs — a pack is one of each of the ${cfg.tiers} tiers`,
      );
    }
    const flatNeighbours = (flat: number): number[] =>
      neighbours(grid, flat % cfg.width, Math.floor(flat / cfg.width), cfg.topology, cfg.wrap).map(
        (n) => n.y * cfg.width + n.x,
      );
    // A congo line is a pack with a shape and an order, and it comes back
    // leader first so the deal can put the strongest tier at the front.
    const dealt =
      cfg.placement === 'congo'
        ? dealLines(
            chooseLines(
              poolFor('any'),
              flatNeighbours,
              cfg.width,
              cfg.height,
              count,
              cfg.tiers,
              rng,
            ),
            cfg.tiers,
            rng,
          )
        : dealPacks(
            choosePacks(poolFor('any'), flatNeighbours, count, cfg.tiers, rng),
            cfg.tiers,
            rng,
          );
    for (const [flat, tier] of dealt) {
      const cell = grid[Math.floor(flat / cfg.width)]![flat % cfg.width]!;
      cell.tier = tier;
      cell.alive = true;
    }
    computeNumbers(grid, cfg.topology, cfg.wrap);
    return grid;
  }

  // The pairing rule picks WHERE before it picks WHAT: the dominoes are laid
  // down first, and the pool then narrows to exactly the cells they occupy, so
  // the deal below is the same shuffle-and-take it has always been and the
  // rule never learns what a tier is. The second shuffle matters — pairs come
  // back partner-adjacent, so dealing straight off them would put tier 1 on
  // the pairs that happened to be placed first.
  const paired = isPaired(cfg.placement);
  if (paired) {
    const total = cfg.quantity.reduce((a, b) => a + b, 0);
    const flatNeighbours = (flat: number): number[] =>
      neighbours(grid, flat % cfg.width, Math.floor(flat / cfg.width), cfg.topology, cfg.wrap).map(
        (n) => n.y * cfg.width + n.x,
      );
    const chosen = choosePairs(poolFor('any'), flatNeighbours, total, rng);

    // A domino board deals TILES, not tiers, so it must keep the pair order
    // `choosePairs` returned — the two ends of a tile have to land on the two
    // halves of one domino. It writes the tiers itself and skips the ordinary
    // deal below, which would shuffle the pairs apart.
    if (cfg.placement === 'dominoes') {
      const sets = setsIn(cfg.tiers, cfg.quantity);
      if (sets === null) {
        throw new Error(
          `board ${cfg.typeId}#${cfg.board}: quantity [${cfg.quantity.join(',')}] is not ` +
            `a whole number of double-${cfg.tiers} domino sets`,
        );
      }
      for (const [flat, tier] of dealTiles(chosen, cfg.tiers, sets, rng)) {
        const cell = grid[Math.floor(flat / cfg.width)]![flat % cfg.width]!;
        cell.tier = tier;
        cell.alive = true;
      }
      computeNumbers(grid, cfg.topology, cfg.wrap);
      return grid;
    }
    pools.set('any', shuffle(chosen, rng));
  }

  const taken = new Map<Shade | 'any', number>();
  for (let t = 0; t < cfg.quantity.length; t++) {
    const count = cfg.quantity[t]!;
    const tier = t + 1;
    const key: Shade | 'any' = checker ? shadeForTier(tier) : 'any';
    const pool = poolFor(key);
    const at = taken.get(key) ?? 0;
    if (at + count > pool.length) {
      throw new Error(
        `board ${cfg.typeId}#${cfg.board}: tier ${tier} does not fit — ` +
          `${at + count} creatures want ${pool.length} cells` +
          (checker
            ? ` on the ${key} squares, which is every tier of that parity`
            : ` shape "${cfg.shape}" leaves them, and a dungeon keeps its ` +
              `hallways and doorways clear`),
      );
    }
    for (let k = 0; k < count; k++) {
      const idx = pool[at + k]!;
      const cell = grid[Math.floor(idx / cfg.width)]![idx % cfg.width]!;
      cell.tier = tier;
      cell.alive = true;
    }
    taken.set(key, at + count);
  }

  computeNumbers(grid, cfg.topology, cfg.wrap);
  return grid;
}

/**
 * Lay the tiers out as a Sudoku solution and pin the givens as marks.
 *
 * Givens are placed here rather than by the Game because they are part of the
 * board, not of play: the same seed must produce the same clues. They are
 * truthful marks, which is the same thing Reveal produces, so every rule that
 * already trusts a mark — the guard, mark-assisted Sweep — reads them without
 * knowing where they came from.
 */
function fillSudoku(cfg: BoardConfig, grid: Grid, rng: Rng): void {
  if (cfg.width !== SUDOKU_SIZE || cfg.height !== SUDOKU_SIZE) {
    throw new Error(
      `${cfg.typeId}#${cfg.board}: sudoku placement needs a ` +
        `${SUDOKU_SIZE}x${SUDOKU_SIZE} board, got ${cfg.width}x${cfg.height}`,
    );
  }
  // The gates the generator has to prove a guess-free path through. Thresholds
  // are what decides when a tier becomes openable, so a board generated
  // against the wrong ones would be provably clear for a player who does not
  // exist.
  const board = generateSudokuBoard(rng, cfg.givens, cfg.exp, cfg.startLevel);
  for (let y = 0; y < SUDOKU_SIZE; y++) {
    for (let x = 0; x < SUDOKU_SIZE; x++) {
      const cell = grid[y]![x]!;
      cell.tier = board.grid[y]![x]!;
      cell.alive = cell.tier > 0;
    }
  }
  for (const flat of board.givens) {
    const cell = grid[Math.floor(flat / SUDOKU_SIZE)]![flat % SUDOKU_SIZE]!;
    cell.mark = cell.tier;
    cell.given = true;
  }
}

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
