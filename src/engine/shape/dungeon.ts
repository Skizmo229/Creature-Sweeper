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
 * density you feel, and rooms play denser than the nominal figure (decision
 * 0003). `MIN_SPAWN_SHARE` is what keeps that fraction from drifting seed to
 * seed — a layout that leaves too little room floor is thrown away rather than
 * shipped, because the quota has to fit and the board has to play the way it
 * was measured.
 *
 * Hallways are one cell wide, so there is no width to guarantee. What the map
 * does refuse is two of its parts joined at a corner only (`pinches`): a
 * diagonal pinch is legible as a gap rather than as a passage, whatever its
 * width.
 */

import { type Rng, randInt, shuffle } from '../rng.js';
import { DIAG, type Mask, ORTHO, blankMask, countPresent } from '../grid.js';
import { type ShapeRule, refuseHexAndWrap } from './rule.js';
import {
  ROOM_MIN,
  type Room,
  carveHalls,
  connectedWith,
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
 * Shares of the cell budget spent on rooms before hallways are carved, tried
 * in turn, `ATTEMPTS_PER_SHARE` plans each, until one lands.
 *
 * Each is a guess the attempt loop corrects: hallway cost is not knowable
 * until the rooms exist, so the leftovers are spent widening rooms afterwards,
 * and a share whose plan fails gives way to the next. One-cell hallways are
 * cheap, so the shares sit high.
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
 * It is this low because of the doorway pocket: small boards have small rooms,
 * a small room is mostly perimeter, and a higher floor refused every plan on
 * them. Rooms play denser for it, and the pocket's free ground still made the
 * board easier to play; the measurements are in decision 0003.
 */
const MIN_SPAWN_SHARE = 0.55;

/** Tries at spending the remaining budget before the attempt is abandoned. */
const SPEND_TRIES = 600;

/** A dungeon's map, as masks over the bounding box. */
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
      const strip = stripBeside(room, dx, dy);
      if (!stripIsClear(present, bw, bh, rooms, at, strip)) continue;

      fillRect(present, strip);
      if (dx < 0) room.x--;
      if (dy < 0) room.y--;
      if (dx) room.w++;
      else room.h++;
      return along;
    }
  }
  return 0;
}

/** A rectangle of cells: a room, or a strip along one. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The one-cell strip running along a room's wall on the side (`dx`, `dy`) points to. */
function stripBeside(room: Room, dx: number, dy: number): Rect {
  return {
    x: dx > 0 ? room.x + room.w : dx < 0 ? room.x - 1 : room.x,
    y: dy > 0 ? room.y + room.h : dy < 0 ? room.y - 1 : room.y,
    w: dx ? 1 : room.w,
    h: dy ? 1 : room.h,
  };
}

/**
 * May room `at` grow into this strip: inside the box, over no cell already laid, and clear of
 * every other room's halo?
 */
function stripIsClear(
  present: Mask,
  bw: number,
  bh: number,
  rooms: Room[],
  at: number,
  strip: Rect,
): boolean {
  const { x: x0, y: y0, w, h } = strip;
  if (x0 < 0 || y0 < 0 || x0 + w > bw || y0 + h > bh) return false;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (present[y]![x] || inAnyHalo(rooms, at, x, y)) return false;
    }
  }
  return true;
}

/** Lay every cell of the rectangle. */
function fillRect(mask: Mask, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) mask[y]![x] = true;
  }
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

/**
 * One floor plan of exactly `target` cells, at one guess for how much of the budget rooms should
 * take: the rooms, the hallways between them, then the rest of the budget spent on the rooms.
 * Throws a plan that misses the count, falls apart or pinches.
 */
function layFloorPlan(
  bw: number,
  bh: number,
  target: number,
  share: number,
  rng: Rng,
): { present: Mask; hall: Mask } {
  const rooms = placeRooms(bw, bh, Math.round(target * share), rng);
  if (rooms.length < 2) throw new Error(`only ${rooms.length} room(s) fit`);

  const present = blankMask(bw, bh);
  for (const room of rooms) fillRect(present, room);
  const hall = layHallways(rooms, bw, bh, rng);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) if (hall[y]![x]) present[y]![x] = true;
  }

  const laid = spendLeftover(present, bw, bh, rooms, target, rng);
  if (laid !== target) throw new Error(`landed on ${laid} of ${target} cells`);
  if (!connectedWith((x, y) => present[y]![x]!, bw, bh)) throw new Error('floor plan is in pieces');
  // Checked at the end and answered by throwing the plan away, rather than by
  // repairing it: a repair costs a cell, and the budget has already been spent
  // to the last one by this point. A pinch is uncommon, so a retry is cheaper
  // than carrying the cell around.
  const pinch = firstPinch(present, bw, bh);
  if (pinch) throw new Error(`floor plan pinches at (${pinch[0]},${pinch[1]})`);
  return { present, hall };
}

/** The hallways joining the rooms: carved, less what runs through a room, and thinned. */
function layHallways(rooms: Room[], bw: number, bh: number, rng: Rng): Mask {
  const hall = blankMask(bw, bh);
  carveHalls(hall, rooms, rng);
  // A hallway cell inside a room is room; only the part outside is hallway.
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) if (inAnyRoom(rooms, x, y)) hall[y]![x] = false;
  }
  thinHalls(hall, rooms, bw, bh);
  return hall;
}

/**
 * Spend what the rooms and hallways left of `target` on the rooms, a wall's strip at a time,
 * then single alcoves, until it is gone or nothing fits. Returns the cells laid; throws if the
 * hallways alone overshot.
 */
function spendLeftover(
  present: Mask,
  bw: number,
  bh: number,
  rooms: Room[],
  target: number,
  rng: Rng,
): number {
  let laid = countPresent(present, bw, bh);
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
  return laid;
}

/** The first laid cell, in reading order, that touches the map at a corner only; null if none. */
function firstPinch(present: Mask, bw: number, bh: number): [number, number] | null {
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (present[y]![x] && pinches(present, bw, bh, x, y)) return [x, y];
    }
  }
  return null;
}

/**
 * Which cells a creature may be dealt into: room floor, less every doorway and its pocket.
 *
 * A door is a room cell with a hallway orthogonally beside it. Keeping those
 * empty is what makes stepping out of a hallway safe and stepping further into
 * a room the risk — and it means the cell you arrive on can always be read
 * before you commit to the room, since its number is information you get for
 * nothing.
 */
function spawnableCells(present: Mask, hall: Mask, bw: number, bh: number): Mask {
  const out = blankMask(bw, bh);
  const door = blankMask(bw, bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!present[y]![x] || hall[y]![x]) continue;
      const atDoor = ORTHO.some(([dx, dy]) => hall[y + dy]?.[x + dx] === true);
      door[y]![x] = atDoor;
      out[y]![x] = !atDoor;
    }
  }
  clearDoorwayPockets(out, door, present, bw, bh);
  return out;
}

/**
 * THE DOORWAY POCKET: take out of `spawnable` every room cell beside a door that is also against
 * a wall.
 *
 * The doorway itself being empty already buys a free read into the room, but the cell you step
 * onto NEXT was still a blind commitment, and the crawl rule makes that the expensive kind of
 * guess — you are forced to gamble on what is in front of you rather than on the cheapest square
 * anywhere.
 *
 * "Against a wall" is what keeps this small and keeps it a pocket rather than a corridor of
 * immunity reaching into the room. For a door in the middle of a wall it clears the two cells
 * flanking it along that wall and nothing else, because the cells deeper in touch no void. So the
 * safe ground hugs the entrance and the room proper is still the risk.
 *
 * ORTHO for "beside the door", the full ring for "against a wall", and the asymmetry is the whole
 * reason this fits. The ring on BOTH cannot generate: rooms here are small (ROOM_COUNT pins seven
 * of them), so most of a room's perimeter is both wall-adjacent and door-adjacent, the ring
 * swallows it whole, and too little floor is left for any plan (decision 0003).
 *
 * Out of bounds counts as wall, which is correct and not an accident of the lookup: the plan is
 * laid out inside DUNGEON_MARGIN, so the edge of the box is void in exactly the way the space
 * between rooms is.
 */
function clearDoorwayPockets(
  spawnable: Mask,
  door: Mask,
  present: Mask,
  bw: number,
  bh: number,
): void {
  const ring = [...ORTHO, ...DIAG];
  const wallAt = (x: number, y: number) => present[y]?.[x] !== true;
  const pocket: Array<[number, number]> = [];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!spawnable[y]![x]) continue; // hall, door, or void
      if (!ORTHO.some(([dx, dy]) => door[y + dy]?.[x + dx] === true)) continue;
      if (!ring.some(([dx, dy]) => wallAt(x + dx, y + dy))) continue;
      pocket.push([x, y]);
    }
  }
  for (const [x, y] of pocket) spawnable[y]![x] = false;
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
        const { present, hall } = layFloorPlan(bw, bh, target, share, rng);
        const spawnable = spawnableCells(present, hall, bw, bh);
        const room = countPresent(spawnable, bw, bh);
        if (room < target * MIN_SPAWN_SHARE) {
          throw new Error(`only ${room} of ${target} cells can hold a creature`);
        }

        const out: DungeonMap = {
          present: blankMask(w, h),
          spawnable: blankMask(w, h),
          hall: blankMask(w, h),
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
  hallways: true,
  validate: refuseHexAndWrap('dungeon'),
  cellCount: (param) => param,
  build: (param, w, h, rng) => dungeonMap(w, h, param, rng),
};
