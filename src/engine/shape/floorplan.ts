/**
 * The dungeon's floor plan: rooms laid out with a wall between any two, joined by one-cell
 * hallways along a spanning tree plus a few loops, then thinned while the map stays connected.
 * `dungeon.ts` spends the rest of the cell budget on it and says which cells are doors and
 * pockets.
 */

import { type Rng, randInt } from '../rng.js';

export type Mask = boolean[][];

/**
 * How many rooms a floor plan aims for, whatever size the board is.
 *
 * This is the load-bearing number of the whole mode, and it is a COUNT rather
 * than a size on purpose. A wall stops information dead: a room's numbers
 * constrain that room and nothing else, and all that crosses a hallway is the
 * couple of cells at its mouth. So a map cut into more rooms is more separate
 * puzzles, each needing its own foothold, and the count is what decides how
 * often a player is cornered with nothing to deduce from.
 *
 * Rooms are sized from the budget rather than rolled at a fixed size, which
 * holds the count steady, so board 10 is a bigger version of board 1 rather
 * than a differently-shaped game. At a fixed size a bigger board simply holds
 * more rooms, an untuned difficulty ramp on the one axis that matters most
 * (decision 0003).
 */
const ROOM_COUNT = 7;
/**
 * How far a room's side may stray from the mean, as a fraction of it.
 *
 * Rooms of different sizes are the point — a map of identical boxes reads as
 * graph paper — but the spread is symmetric, so it does not move the count.
 */
const ROOM_VARIETY = 0.45;
/** A room is never thinner than this. Below 2 it is a hallway with a name. */
export const ROOM_MIN = 3;
/**
 * Cells of wall kept between any two rooms.
 *
 * Two, so a hallway running between a pair of rooms has a wall of its own on
 * at least one side rather than being a seam where they touch.
 */
const ROOM_GAP = 2;
/** Failed room placements in a row before the floor plan is taken as full. */
const ROOM_MISSES = 60;

/**
 * Extra hallways beyond the spanning tree, as a share of the room count.
 *
 * A tree is connected and nothing more: every room hangs off exactly one path,
 * so the map plays as a sequence. A few extra links turn it into a place you
 * can go round, which is what a dungeon reads as.
 */
const LOOP_SHARE = 0.35;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function blank(w: number, h: number): Mask {
  return Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
}

export function count(mask: Mask): number {
  let n = 0;
  for (const row of mask) for (const on of row) if (on) n++;
  return n;
}

export const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** The cells a room covers, plus the wall around it. */
function halo(room: Room): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: room.x - ROOM_GAP,
    y0: room.y - ROOM_GAP,
    x1: room.x + room.w - 1 + ROOM_GAP,
    y1: room.y + room.h - 1 + ROOM_GAP,
  };
}

function roomSide(mean: number, rng: Rng): number {
  return Math.max(ROOM_MIN, Math.round(mean * (1 + (rng() * 2 - 1) * ROOM_VARIETY)));
}

export function inAnyRoom(rooms: Room[], x: number, y: number): boolean {
  return rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

export function inAnyHalo(rooms: Room[], except: number, x: number, y: number): boolean {
  for (let i = 0; i < rooms.length; i++) {
    if (i === except) continue;
    const { x0, y0, x1, y1 } = halo(rooms[i]!);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
}

/** Lay out rooms with a wall between any two of them. */
export function placeRooms(bw: number, bh: number, want: number, rng: Rng): Room[] {
  const rooms: Room[] = [];
  let area = 0;
  let misses = 0;
  // The side a square room would have if `want` cells were split evenly
  // between ROOM_COUNT of them. Everything is drawn around this, so the count
  // holds and the board's size shows up as bigger rooms rather than more.
  const mean = Math.sqrt(want / ROOM_COUNT);

  while (area < want && misses < ROOM_MISSES) {
    const w = roomSide(mean, rng);
    const h = roomSide(mean, rng);
    if (w > bw || h > bh || area + w * h > want) {
      misses++;
      continue;
    }

    const room: Room = { x: randInt(rng, bw - w + 1), y: randInt(rng, bh - h + 1), w, h };
    let clear = true;
    for (let y = room.y; y < room.y + room.h && clear; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (inAnyHalo(rooms, -1, x, y)) {
          clear = false;
          break;
        }
      }
    }
    if (!clear) {
      misses++;
      continue;
    }

    rooms.push(room);
    area += w * h;
    misses = 0;
  }
  return rooms;
}

function centre(room: Room): [number, number] {
  return [room.x + (room.w >> 1), room.y + (room.h >> 1)];
}

function distance(a: Room, b: Room): number {
  const [ax, ay] = centre(a);
  const [bx, by] = centre(b);
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

/**
 * Join every room, then add a few short links back.
 *
 * Prim's over room centres, which is O(rooms^2) on a list never longer than a
 * dozen. The extra links are the shortest edges the tree did not use, so they
 * read as shortcuts between neighbours rather than as a hallway crossing the
 * whole map to nowhere.
 *
 * The path is an L between the two centres, one cell wide. Where it crosses a
 * room it is simply room — a hallway is only the part outside one — which is
 * why this can be drawn without caring what it passes through.
 */
export function carveHalls(hall: Mask, rooms: Room[], rng: Rng): void {
  const line = (fromX: number, toX: number, fromY: number, toY: number): void => {
    for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y++) {
      for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x++) hall[y]![x] = true;
    }
  };
  /**
   * How much of this hallway would end up two cells wide.
   *
   * An L-shaped path cannot widen itself — it turns once — so the only way a
   * hallway comes out two wide is by running alongside one that is already
   * there. Both elbows are costed and the tidier one taken, which roughly
   * halves it; `thinHalls` then removes whatever is left.
   */
  const parallelCells = (cells: Array<[number, number]>): number => {
    let n = 0;
    for (const [x, y] of cells) {
      for (const [dx, dy] of ORTHO) {
        if (hall[y + dy]?.[x + dx]) n++;
      }
    }
    return n;
  };
  const elbow = (ax: number, ay: number, bx: number, by: number, first: 'x' | 'y') => {
    const cells: Array<[number, number]> = [];
    const run = (x0: number, x1: number, y0: number, y1: number): void => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells.push([x, y]);
      }
    };
    if (first === 'x') {
      run(ax, bx, ay, ay);
      run(bx, bx, ay, by);
    } else {
      run(ax, ax, ay, by);
      run(ax, bx, by, by);
    }
    return cells;
  };

  const connect = (a: Room, b: Room): void => {
    const [ax, ay] = centre(a);
    const [bx, by] = centre(b);
    const options =
      rng() < 0.5
        ? [elbow(ax, ay, bx, by, 'x'), elbow(ax, ay, bx, by, 'y')]
        : [elbow(ax, ay, bx, by, 'y'), elbow(ax, ay, bx, by, 'x')];
    // The coin decides ties; the count decides everything else, so a tidier
    // route always wins and the shape still varies with the seed.
    const chosen =
      parallelCells(options[1]!) < parallelCells(options[0]!) ? options[1]! : options[0]!;
    for (const [x, y] of chosen) line(x, x, y, y);
  };

  const inTree = [0];
  const rest = rooms.map((_, i) => i).slice(1);
  const used = new Set<string>();

  while (rest.length) {
    let bestAt = 0;
    let bestFrom = 0;
    let best = Infinity;
    for (let i = 0; i < rest.length; i++) {
      for (const from of inTree) {
        const d = distance(rooms[from]!, rooms[rest[i]!]!);
        if (d < best) {
          best = d;
          bestAt = i;
          bestFrom = from;
        }
      }
    }
    const to = rest.splice(bestAt, 1)[0]!;
    connect(rooms[bestFrom]!, rooms[to]!);
    used.add(bestFrom < to ? `${bestFrom}:${to}` : `${to}:${bestFrom}`);
    inTree.push(to);
  }

  const spare: Array<[number, number, number]> = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (used.has(`${i}:${j}`)) continue;
      spare.push([distance(rooms[i]!, rooms[j]!), i, j]);
    }
  }
  spare.sort((p, q) => p[0] - q[0]);
  for (const [, i, j] of spare.slice(0, Math.floor(rooms.length * LOOP_SHARE))) {
    connect(rooms[i]!, rooms[j]!);
  }
}

/**
 * Pare any two-wide stretch of hallway back to one.
 *
 * A hallway is meant to be a single cell across, and the elbow choice in
 * `carveHalls` gets most of the way there, but two routes can still be forced
 * alongside each other. Every 2x2 of hallway is a place that happened, so the
 * cells are taken back one at a time, each one kept only if the map is still
 * in one piece without it.
 *
 * Trimming is safe here in a way it was NOT safe for the cave, and the
 * difference is worth naming: the cave trimmed toward a minimum WIDTH, and
 * trimming is exactly what creates one-cell threads, so it could never get
 * there. Here one cell wide is the target, so the thing trimming does wrong is
 * the thing being asked for. Connectivity is the only property at risk and it
 * is checked on every removal.
 *
 * It runs before the budget is counted, so anything it takes back is simply
 * budget the rooms get to spend instead, and the board still lands on its
 * exact cell count.
 */
export function thinHalls(hall: Mask, rooms: Room[], bw: number, bh: number): void {
  const solid = (x: number, y: number): boolean => hall[y]?.[x] === true || inAnyRoom(rooms, x, y);

  for (;;) {
    let cut = false;
    for (let y = 0; y + 1 < bh; y++) {
      for (let x = 0; x + 1 < bw; x++) {
        const square: Array<[number, number]> = [
          [x, y],
          [x + 1, y],
          [x, y + 1],
          [x + 1, y + 1],
        ];
        if (!square.every(([sx, sy]) => hall[sy]![sx])) continue;
        for (const [sx, sy] of square) {
          hall[sy]![sx] = false;
          if (connectedWith(solid, bw, bh)) {
            cut = true;
            break;
          }
          hall[sy]![sx] = true;
        }
      }
    }
    if (!cut) return;
  }
}

/** Is everything the predicate calls solid reachable from the first of it? */
function connectedWith(solid: (x: number, y: number) => boolean, bw: number, bh: number): boolean {
  let start: [number, number] | null = null;
  let total = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!solid(x, y)) continue;
      total++;
      if (!start) start = [x, y];
    }
  }
  if (!start) return false;

  const seen = new Set([start[1] * bw + start[0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || !solid(nx, ny)) continue;
      const key = ny * bw + nx;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen.size === total;
}
