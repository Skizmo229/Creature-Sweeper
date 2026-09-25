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

import { type Rng, randInt, shuffle } from '../rng.js';
import { type ShapeRule, refuseHexAndWrap } from './rule.js';
import {
  DIAG,
  type Mask,
  ORTHO,
  ROOM_MIN,
  type Room,
  blank,
  carveHalls,
  count,
  inAnyHalo,
  inAnyRoom,
  placeRooms,
  thinHalls,
} from './floorplan.js';

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
 * Share of the cell budget spent on rooms before hallways are carved.
 *
 * A first guess that the attempt loop corrects: hallway cost is not knowable
 * until the rooms exist, so this is deliberately low and the leftovers are
 * spent widening rooms afterwards. One-cell hallways are cheap, so this sits
 * much higher than it did when they were two.
 */
const ROOM_SHARES = [0.86, 0.8, 0.9, 0.74, 0.94, 0.68];

/** Attempts per share before the whole mask is given up on. */
const ATTEMPTS_PER_SHARE = 2;

/**
 * The least of the map that may be room floor a creature could stand on.
 *
 * The quota is a density applied to the WHOLE cell count, but creatures only
 * ever go in rooms, never in a doorway and never in a doorway's pocket, so the
 * pool they are dealt into is smaller than the board. This is the floor under
 * that pool: it keeps the quota fitting, and it keeps how packed a room feels
 * from wandering seed to seed. A plan under it is thrown away and another
 * tried.
 *
 * IT WAS 0.78, AND THAT NUMBER WAS DERIVED RATHER THAN CHOSEN: board 10's
 * nominal density is 26.4%, and 26.4/0.78 = 33.8%, just inside the 34% the
 * rest of the game treats as the point a board stops being a puzzle. So the
 * floor was the ceiling, restated as a share.
 *
 * The doorway pocket makes 0.78 unreachable. Measured over 40 seeds a board,
 * the share now runs 58-76% at worst and 71-82% on average, so every plan on
 * the small boards was refused and `dungeonMap` threw on every seed — small
 * boards have small rooms, and a small room is mostly perimeter.
 *
 * What it costs, measured rather than reasoned about: felt room density goes
 * from 15.9-30.4% to 18.0-32.6% on an average seed, and reaches 34.9% on the
 * worst board-10 seed in 40. That is 0.9 points past the ceiling, on a ladder
 * where HIVE already sits at 35% and CHECKERBOARD at 38.5% for stated reasons
 * — and the pocket itself hands back guaranteed-safe ground, so the board is
 * not straightforwardly denser to play even where it is denser to describe.
 * THAT LAST CLAIM IS THE UNMEASURED ONE. DUNGEON's schedule is the only one in
 * the game derived by playing it, with the honest player in `sim:spells`, and
 * re-deriving it is what would settle whether the density should now come down.
 */
const MIN_SPAWN_SHARE = 0.55;

/** Tries at spending the remaining budget before the attempt is abandoned. */
const SPEND_TRIES = 600;

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
  present: Mask,
  bw: number,
  bh: number,
  rooms: Room[],
  budget: number,
  rng: Rng,
): number {
  for (const at of shuffle(
    rooms.map((_, i) => i),
    rng,
  )) {
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
          if (present[y]![x] || inAnyHalo(rooms, at, x, y)) {
            ok = false;
            break;
          }
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
function attempt(
  bw: number,
  bh: number,
  target: number,
  share: number,
  rng: Rng,
): {
  present: Mask;
  rooms: Room[];
  hall: Mask;
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
    if (gained) {
      laid += gained;
      continue;
    }
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
  const door = blank(bw, bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!present[y]![x] || hall[y]![x]) continue;
      const atDoor = ORTHO.some(([dx, dy]) => hall[y + dy]?.[x + dx] === true);
      door[y]![x] = atDoor;
      out[y]![x] = !atDoor;
    }
  }

  // THE DOORWAY POCKET: a door's neighbours that are also against a wall.
  //
  // The doorway itself being empty already buys a free read into the room, but
  // the cell you step onto NEXT was still a blind commitment, and the crawl
  // rule makes that the expensive kind of guess — you are forced to gamble on
  // what is in front of you rather than on the cheapest square anywhere.
  //
  // "Against a wall" is what keeps this small and keeps it a pocket rather
  // than a corridor of immunity reaching into the room. For a door in the
  // middle of a wall it clears the two cells flanking it along that wall and
  // nothing else, because the cells deeper in touch no void. So the safe
  // ground hugs the entrance and the room proper is still the risk.
  //
  // ORTHO for "next to the door", the full ring for "touches a wall", and the
  // asymmetry is the whole reason this fits. The ring on BOTH cannot generate:
  // rooms here are small (ROOM_COUNT pins seven of them), so most of a room's
  // perimeter is both wall-adjacent and door-adjacent, the ring swallows it
  // whole, and too little floor is left for any plan (decision 0003).
  //
  // Out of bounds counts as wall, which is correct and not an accident of the
  // lookup: the plan is laid out inside DUNGEON_MARGIN, so the edge of the box
  // is void in exactly the way the space between rooms is.
  const ring = [...ORTHO, ...DIAG];
  const wallAt = (x: number, y: number) => present[y]?.[x] !== true;
  const pocket: Array<[number, number]> = [];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!out[y]![x]) continue; // hall, door, or void
      if (!ORTHO.some(([dx, dy]) => door[y + dy]?.[x + dx] === true)) continue;
      if (!ring.some(([dx, dy]) => wallAt(x + dx, y + dy))) continue;
      pocket.push([x, y]);
    }
  }
  for (const [x, y] of pocket) out[y]![x] = false;
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
    throw new Error(
      `dungeon ${w}x${h}: ${target} cells asked for, only ${bw * bh} inside the margin`,
    );
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
          present: blank(w, h),
          spawnable: blank(w, h),
          hall: blank(w, h),
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

/** The dungeon: exactly `param` cells of map, of which only room floor ever holds a creature. */
export const DUNGEON_SHAPE: ShapeRule = {
  id: 'dungeon',
  seeded: true,
  validate: refuseHexAndWrap('dungeon'),
  cellCount: (param) => param,
  build: (param, w, h, rng) => dungeonMap(w, h, param, rng),
};
