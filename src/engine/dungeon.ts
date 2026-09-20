/**
 * The dungeon: rooms joined by one-cell hallways, carved fresh from the seed,
 * and built from exactly the cells the ladder budgeted for it.
 *
 * Why exact, and why that is not negotiable: every level threshold on a board
 * comes from C_k, which comes from a creature quota, which is a density
 * applied to the cells the shape leaves. A mask whose size moved with the seed
 * would move C_k with it, so the thresholds in `ladders.json` would be right
 * on one seed and wrong on the rest — and nothing would throw, the board would
 * just be quietly mistuned with its top gate one kill out of reach. Same
 * argument as the ragged cave's, and the same answer: `shapeParam` IS the cell
 * count, the generator is required to land on it, and `ladders.py` records the
 * number it asked for rather than measuring anything.
 *
 * THE MAP HAS THREE KINDS OF CELL, and the difference is the mode. A ROOM is
 * somewhere creatures live. A HALLWAY is one cell wide and always empty. A
 * DOOR is the room cell a hallway arrives at, and it is empty too. So a
 * hallway is a place you can always walk, and stepping out of one is the
 * moment you take a risk — which is what makes this play as a dungeon crawl
 * rather than as a minefield with corridors drawn on it.
 *
 * That split has a consequence worth stating plainly: creatures are packed
 * into a fraction of the board, so the density the ladder quotes is not the
 * density you feel. Measured at the shipped schedule, rooms run 9.8-21.1%
 * against a nominal 9.0-14.6% — about 1.4x. `MIN_SPAWN_SHARE` is what keeps that fraction from drifting
 * seed to seed — a layout that leaves too little room floor is thrown away
 * rather than shipped, because the quota has to fit and the board has to play
 * the way it was measured.
 *
 * The earlier version of this made every cell part of a 2x2 block, which
 * bought a two-cell minimum width everywhere by construction. That is gone
 * deliberately: hallways are one cell wide now, so there is no width
 * guarantee left to make. What survives from it is the refusal to join two
 * parts of the map at a corner only — a diagonal pinch is legible as a gap
 * rather than as a passage, whatever its width.
 */

import { type Rng, randInt, shuffle } from './rng.js';

/**
 * Cells of bounding box kept clear all round.
 *
 * Same as the cave's, for the same two reasons: the shape should not read as
 * the box it was cut from, and a board whose mask never reaches its own edge
 * cannot be wrapped (config refuses that combination rather than joining two
 * holes).
 */
const DUNGEON_MARGIN = 1;

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
 * Rooms were originally rolled at a fixed size, which meant a bigger board
 * simply held more of them: the room count nearly doubled across the ladder,
 * putting an untuned difficulty ramp on the one axis that matters most. Sizing
 * rooms from the budget instead holds the count steady, so board 10 is a
 * bigger version of board 1 rather than a differently-shaped game.
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
const ROOM_MIN = 3;
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

/**
 * Share of the cell budget spent on rooms before hallways are carved.
 *
 * A first guess that the attempt loop corrects: hallway cost is not knowable
 * until the rooms exist, so this is deliberately low and the leftovers are
 * spent widening rooms afterwards. One-cell hallways are cheap, so this sits
 * much higher than it did when they were two.
 */
const ROOM_SHARES = [0.86, 0.80, 0.90, 0.74, 0.94, 0.68];

/** Attempts per share before the whole mask is given up on. */
const ATTEMPTS_PER_SHARE = 2;

/**
 * The least of the map that may be room floor a creature could stand on.
 *
 * The quota is a density applied to the WHOLE cell count, but creatures only
 * ever go in rooms and never in a doorway, so the pool they are dealt into is
 * smaller than the board. This is the floor under that pool: it keeps the
 * quota fitting, and — more importantly — it keeps how packed a room feels
 * from wandering seed to seed, which is a tuning number and not something to
 * leave to chance. A plan under it is thrown away and another tried.
 */
const MIN_SPAWN_SHARE = 0.78;

/** Tries at spending the remaining budget before the attempt is abandoned. */
const SPEND_TRIES = 600;

type Mask = boolean[][];

export interface DungeonMap {
  /** Which cells of the bounding box exist. */
  present: Mask;
  /** Which of those a creature may be dealt into: room floor, minus doors. */
  spawnable: Mask;
  /**
   * The hallways: present cells that are not room floor.
   *
   * Returned rather than kept private because it is the one part of the layout
   * that cannot be recovered from `present` afterwards — a corridor cell and a
   * room cell look identical once the map is a grid of booleans — and the
   * mode's rules are stated in terms of it.
   */
  hall: Mask;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

function blank(w: number, h: number): Mask {
  return Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
}

function count(mask: Mask): number {
  let n = 0;
  for (const row of mask) for (const on of row) if (on) n++;
  return n;
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

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

function inAnyRoom(rooms: Room[], x: number, y: number): boolean {
  return rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}

function inAnyHalo(rooms: Room[], except: number, x: number, y: number): boolean {
  for (let i = 0; i < rooms.length; i++) {
    if (i === except) continue;
    const { x0, y0, x1, y1 } = halo(rooms[i]!);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
  }
  return false;
}

/** Lay out rooms with a wall between any two of them. */
function placeRooms(bw: number, bh: number, want: number, rng: Rng): Room[] {
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
    if (w > bw || h > bh || area + w * h > want) { misses++; continue; }

    const room: Room = { x: randInt(rng, bw - w + 1), y: randInt(rng, bh - h + 1), w, h };
    let clear = true;
    for (let y = room.y; y < room.y + room.h && clear; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (inAnyHalo(rooms, -1, x, y)) { clear = false; break; }
      }
    }
    if (!clear) { misses++; continue; }

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
function carveHalls(hall: Mask, rooms: Room[], rng: Rng): void {
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
    if (first === 'x') { run(ax, bx, ay, ay); run(bx, bx, ay, by); }
    else { run(ax, ax, ay, by); run(ax, bx, by, by); }
    return cells;
  };

  const connect = (a: Room, b: Room): void => {
    const [ax, ay] = centre(a);
    const [bx, by] = centre(b);
    const options = rng() < 0.5
      ? [elbow(ax, ay, bx, by, 'x'), elbow(ax, ay, bx, by, 'y')]
      : [elbow(ax, ay, bx, by, 'y'), elbow(ax, ay, bx, by, 'x')];
    // The coin decides ties; the count decides everything else, so a tidier
    // route always wins and the shape still varies with the seed.
    const chosen = parallelCells(options[1]!) < parallelCells(options[0]!)
      ? options[1]! : options[0]!;
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
        if (d < best) { best = d; bestAt = i; bestFrom = from; }
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
function thinHalls(hall: Mask, rooms: Room[], bw: number, bh: number): void {
  const solid = (x: number, y: number): boolean =>
    (hall[y]?.[x] === true) || inAnyRoom(rooms, x, y);

  for (;;) {
    let cut = false;
    for (let y = 0; y + 1 < bh; y++) {
      for (let x = 0; x + 1 < bw; x++) {
        const square: Array<[number, number]> = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
        if (!square.every(([sx, sy]) => hall[sy]![sx])) continue;
        for (const [sx, sy] of square) {
          hall[sy]![sx] = false;
          if (connectedWith(solid, bw, bh)) { cut = true; break; }
          hall[sy]![sx] = true;
        }
      }
    }
    if (!cut) return;
  }
}

/** Is everything the predicate calls solid reachable from the first of it? */
function connectedWith(
  solid: (x: number, y: number) => boolean, bw: number, bh: number,
): boolean {
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

/**
 * Does this cell touch another part of the map at a corner only?
 *
 * Used twice: to refuse an alcove that would create one, and to throw away a
 * finished plan that has one in it. A diagonal contact reads as a gap rather
 * than a way through, which is as true of a one-cell hallway as it was of a
 * two-cell one — the width changed, the legibility argument did not.
 */
function pinches(present: Mask, bw: number, bh: number, x: number, y: number): boolean {
  for (const [dx, dy] of DIAG) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || !present[ny]![nx]) continue;
    if (!present[y]![nx] && !present[ny]![x]) return true;
  }
  return false;
}

/**
 * Widen a room by one wall's worth of cells.
 *
 * Where most of the leftover budget goes, and what makes the rooms different
 * sizes on every seed rather than the sizes they happened to be rolled at. The
 * strip may not run into another room's wall, because that gap is the only
 * place a hallway has to be.
 */
function widen(
  present: Mask, bw: number, bh: number, rooms: Room[], budget: number, rng: Rng,
): number {
  for (const at of shuffle(rooms.map((_, i) => i), rng)) {
    const room = rooms[at]!;
    for (const [dx, dy] of shuffle([...ORTHO], rng)) {
      const along = dx ? room.h : room.w;
      if (along > budget) continue;

      const x0 = dx > 0 ? room.x + room.w : dx < 0 ? room.x - 1 : room.x;
      const y0 = dy > 0 ? room.y + room.h : dy < 0 ? room.y - 1 : room.y;
      const w = dx ? 1 : room.w;
      const h = dy ? 1 : room.h;
      if (x0 < 0 || y0 < 0 || x0 + w > bw || y0 + h > bh) continue;

      let ok = true;
      for (let y = y0; y < y0 + h && ok; y++) {
        for (let x = x0; x < x0 + w; x++) {
          if (present[y]![x] || inAnyHalo(rooms, at, x, y)) { ok = false; break; }
        }
      }
      if (!ok) continue;

      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) present[y]![x] = true;
      if (dx < 0) room.x--;
      if (dy < 0) room.y--;
      if (dx) room.w++;
      else room.h++;
      return along;
    }
  }
  return 0;
}

/** One free cell against the map that would not pinch it. Costs exactly one. */
function alcove(present: Mask, bw: number, bh: number, rng: Rng): boolean {
  const open: number[] = [];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (present[y]![x]) continue;
      const touches = ORTHO.some(([dx, dy]) => present[y + dy]?.[x + dx] === true);
      if (touches && !pinches(present, bw, bh, x, y)) open.push(y * bw + x);
    }
  }
  if (!open.length) return false;
  const at = open[randInt(rng, open.length)]!;
  present[(at - (at % bw)) / bw]![at % bw] = true;
  return true;
}

/** Every present cell reachable from the first, walking orthogonally. */
function connected(present: Mask, bw: number, bh: number): boolean {
  let start = -1;
  let total = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!present[y]![x]) continue;
      total++;
      if (start < 0) start = y * bw + x;
    }
  }
  if (start < 0) return false;

  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    const x = at % bw;
    const y = (at - x) / bw;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || !present[ny]![nx]) continue;
      const next = ny * bw + nx;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === total;
}

/** One floor plan, at one guess for how much of the budget rooms should take. */
function attempt(bw: number, bh: number, target: number, share: number, rng: Rng): {
  present: Mask; rooms: Room[]; hall: Mask;
} {
  const rooms = placeRooms(bw, bh, Math.round(target * share), rng);
  if (rooms.length < 2) throw new Error(`only ${rooms.length} room(s) fit`);

  const present = blank(bw, bh);
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) present[y]![x] = true;
    }
  }

  const hall = blank(bw, bh);
  carveHalls(hall, rooms, rng);
  // A hallway cell inside a room is room; only the part outside is hallway.
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) if (inAnyRoom(rooms, x, y)) hall[y]![x] = false;
  }
  thinHalls(hall, rooms, bw, bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) if (hall[y]![x]) present[y]![x] = true;
  }

  let laid = count(present);
  if (laid > target) throw new Error(`hallways overshot: ${laid} of ${target} cells`);

  for (let tries = 0; laid < target && tries < SPEND_TRIES; tries++) {
    const gained = widen(present, bw, bh, rooms, target - laid, rng);
    if (gained) { laid += gained; continue; }
    if (!alcove(present, bw, bh, rng)) break;
    laid++;
  }

  if (laid !== target) throw new Error(`landed on ${laid} of ${target} cells`);
  if (!connected(present, bw, bh)) throw new Error('floor plan is in pieces');
  // Checked at the end and answered by throwing the plan away, rather than by
  // repairing it: a repair costs a cell, and the budget has already been spent
  // to the last one by this point. Measured, about one plan in twenty-five has
  // a pinch in it, so a retry is cheaper than carrying the cell around.
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (present[y]![x] && pinches(present, bw, bh, x, y)) {
        throw new Error(`floor plan pinches at (${x},${y})`);
      }
    }
  }
  return { present, rooms, hall };
}

/**
 * Which cells a creature may be dealt into: room floor, less every doorway.
 *
 * A door is a room cell with a hallway orthogonally beside it. Keeping those
 * empty is what makes stepping out of a hallway safe and stepping further into
 * a room the risk — and it means the cell you arrive on can always be read
 * before you commit to the room, since its number is information you get for
 * nothing.
 */
function spawnableCells(present: Mask, hall: Mask, bw: number, bh: number): Mask {
  const out = blank(bw, bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!present[y]![x] || hall[y]![x]) continue;
      const atDoor = ORTHO.some(([dx, dy]) => hall[y + dy]?.[x + dx] === true);
      out[y]![x] = !atDoor;
    }
  }
  return out;
}

/**
 * The map, in cells: `target` of them exactly, on every seed.
 *
 * The floor plan is laid out inside the margin and then written into the
 * bounding box, centred in whatever the margin leaves.
 */
export function dungeonMap(w: number, h: number, target: number, rng: Rng): DungeonMap {
  const bw = w - 2 * DUNGEON_MARGIN;
  const bh = h - 2 * DUNGEON_MARGIN;
  if (bw < ROOM_MIN || bh < ROOM_MIN) throw new Error(`dungeon ${w}x${h}: too small for a room`);
  if (target > bw * bh) {
    throw new Error(`dungeon ${w}x${h}: ${target} cells asked for, only ${bw * bh} inside the margin`);
  }

  let last = '';
  for (const share of ROOM_SHARES) {
    for (let n = 0; n < ATTEMPTS_PER_SHARE; n++) {
      try {
        const { present, hall } = attempt(bw, bh, target, share, rng);
        const spawnable = spawnableCells(present, hall, bw, bh);
        const room = count(spawnable);
        if (room < target * MIN_SPAWN_SHARE) {
          throw new Error(`only ${room} of ${target} cells can hold a creature`);
        }

        const out: DungeonMap = {
          present: blank(w, h), spawnable: blank(w, h), hall: blank(w, h),
        };
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            out.present[y + DUNGEON_MARGIN]![x + DUNGEON_MARGIN] = present[y]![x]!;
            out.spawnable[y + DUNGEON_MARGIN]![x + DUNGEON_MARGIN] = spawnable[y]![x]!;
            out.hall[y + DUNGEON_MARGIN]![x + DUNGEON_MARGIN] = hall[y]![x]!;
          }
        }
        return out;
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
    }
  }
  throw new Error(`dungeon ${w}x${h}: no floor plan after every attempt, last: ${last}`);
}
