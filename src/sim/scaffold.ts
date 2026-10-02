/**
 * What a person reads off a dungeon's silhouette: the corridors, the doorways and their pockets,
 * all of which the mode keeps empty (docs/modes.md). The graded player walks them at grade 0.
 *
 * Read from `present` alone, never from the map's own `hall` or `spawnable` masks. Every room is
 * at least three cells square, so room floor is any cell inside a full two-by-two block of the
 * map and a thin cell is one inside none. Thin cells are hallways and, rarely, the one-cell
 * alcoves the generator adds last, which are room floor and may hold a creature; the two look
 * the same, so what is named here rests on one fact about the generator: it joins every room to
 * every other through hallways BEFORE it adds any alcove (`src/engine/shape/dungeon.ts`). So a
 * thin cell whose removal cuts some room off from the rest is a hallway cell and never an
 * alcove, and those cells are where doorways (the room cell orthogonally beside one) and their
 * pockets (a room cell beside a doorway that touches the void) are read, exactly as the engine
 * defines them. A thin passage that joins two rooms is named hallway whole when it is long
 * enough or holds a cut cell (`MIN_PASSAGE`), because hallways run in loops and few of their
 * cells cut anything; two alcoves leaning on such a passage, the first a doorway and the second
 * room floor, could in principle contradict that, and were not seen in 2,000 boards.
 * `test/graded.test.ts` holds every cell named here against the map on fixed seeds. Empty on a
 * shape without hallways (`ShapeRule.hallways`), or on a hex or wrapped board.
 */

import type { Game } from '../engine/game.js';
import { type Mask, blankMask } from '../engine/grid.js';
import { shapeRule } from '../engine/shape/registry.js';
import type { Cell } from '../engine/types.js';

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Whether the map has a cell at (x, y); false off its edges. */
type Present = (x: number, y: number) => boolean;

/**
 * The shortest passage named without a cut cell in it. Two alcoves can bridge the two-cell gap
 * between rooms and look exactly like a two-cell hallway: measured on 2,000 boards on
 * 25 September 2026, 2 of 8,016 cells in two-cell passages could hold a creature and none of
 * the 57,000 in longer ones. A short passage with a cut cell is hallway by construction.
 */
const MIN_PASSAGE = 3;

/** The cells a person can see are empty on a dungeon board. Empty on any other board. */
export function dungeonScaffold(game: Game): Set<Cell> {
  const out = new Set<Cell>();
  const { config, grid } = game;
  if (!shapeRule(config.shape).hallways) return out;
  if (config.topology !== 'square' || config.wrap !== 'none') return out;
  const { width: w, height: h } = config;
  const at: Present = (x, y) => grid[y]?.[x]?.present === true;
  const room = roomFloor(at, w, h);
  const label = roomLabels(room, w, h);
  const cut = cutCells(at, room, oneCellPerRoom(label, w, h), w, h);
  const door = doorways(room, cut, w, h);

  for (const [x, y] of passages(at, room, label, cut, w, h)) out.add(grid[y]![x]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (door[y]![x]) out.add(grid[y]![x]!);
  for (const [x, y] of pockets(at, room, door, w, h)) out.add(grid[y]![x]!);
  return out;
}

/** The thin cells that are certainly hallway: without one, some room is cut off from the rest. */
function cutCells(at: Present, room: Mask, rooms: readonly number[], w: number, h: number): Mask {
  const cut = blankMask(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) && !room[y]![x] && !roomsStayJoined(at, rooms, w, h, x, y)) cut[y]![x] = true;
    }
  }
  return cut;
}

/**
 * Every thin passage that joins two rooms, whole, in the order they are found: one at least
 * `MIN_PASSAGE` long, or one holding a cut cell.
 */
function passages(
  at: Present,
  room: Mask,
  label: readonly number[][],
  cut: Mask,
  w: number,
  h: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seen = blankMask(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y) || room[y]![x] || seen[y]![x]) continue;
      const passage = thinComponent(at, room, seen, x, y);
      const touched = new Set<number>();
      for (const [px, py] of passage) {
        for (const [dx, dy] of ORTHO)
          if (room[py + dy]?.[px + dx]) touched.add(label[py + dy]![px + dx]!);
      }
      if (touched.size < 2) continue;
      if (passage.length < MIN_PASSAGE && !passage.some(([px, py]) => cut[py]![px])) continue;
      out.push(...passage);
    }
  }
  return out;
}

/** The doorways: the room cells orthogonally beside a cut cell. */
function doorways(room: Mask, cut: Mask, w: number, h: number): Mask {
  const door = blankMask(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (room[y]![x] && ORTHO.some(([dx, dy]) => cut[y + dy]?.[x + dx])) door[y]![x] = true;
    }
  }
  return door;
}

/** The pockets: room cells beside a doorway, not doorways themselves, that touch the void. */
function pockets(
  at: Present,
  room: Mask,
  door: Mask,
  w: number,
  h: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!room[y]![x] || door[y]![x] || !ORTHO.some(([dx, dy]) => door[y + dy]?.[x + dx]))
        continue;
      if (touchesVoid(at, x, y)) out.push([x, y]);
    }
  }
  return out;
}

/** Whether any of the eight cells round (x, y) is off the map. */
function touchesVoid(at: Present, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !at(x + dx, y + dy)) return true;
  }
  return false;
}

/** Every cell inside a full two-by-two block of the map. */
function roomFloor(at: Present, w: number, h: number): Mask {
  const room = blankMask(w, h);
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      if (!at(x, y) || !at(x + 1, y) || !at(x, y + 1) || !at(x + 1, y + 1)) continue;
      room[y]![x] = room[y]![x + 1] = room[y + 1]![x] = room[y + 1]![x + 1] = true;
    }
  }
  return room;
}

/** The thin cells joined orthogonally to (sx, sy), marking them seen. */
function thinComponent(
  at: Present,
  room: Mask,
  seen: Mask,
  sx: number,
  sy: number,
): Array<[number, number]> {
  const cells: Array<[number, number]> = [[sx, sy]];
  seen[sy]![sx] = true;
  for (let i = 0; i < cells.length; i++) {
    const [x, y] = cells[i]!;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (!at(nx, ny) || room[ny]![nx] || seen[ny]![nx]) continue;
      seen[ny]![nx] = true;
      cells.push([nx, ny]);
    }
  }
  return cells;
}

/** Each room floor cell numbered by its room, from 1; 0 elsewhere. */
function roomLabels(room: Mask, w: number, h: number): number[][] {
  const label = Array.from({ length: h }, () => new Array<number>(w).fill(0));
  let rooms = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!room[y]![x] || label[y]![x]) continue;
      const id = ++rooms;
      const queue: Array<[number, number]> = [[x, y]];
      label[y]![x] = id;
      for (let i = 0; i < queue.length; i++) {
        const [cx, cy] = queue[i]!;
        for (const [dx, dy] of ORTHO) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!room[ny]?.[nx] || label[ny]![nx]) continue;
          label[ny]![nx] = id;
          queue.push([nx, ny]);
        }
      }
    }
  }
  return label;
}

/** One cell of each room, as flat indices, from `roomLabels`. */
function oneCellPerRoom(label: readonly number[][], w: number, h: number): number[] {
  const firsts = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = label[y]![x]!;
      if (id && !firsts.has(id)) firsts.set(id, y * w + x);
    }
  }
  return [...firsts.values()];
}

/** With the cell at (cx, cy) taken out of the map, can every room still reach the first? */
function roomsStayJoined(
  at: Present,
  rooms: readonly number[],
  w: number,
  h: number,
  cx: number,
  cy: number,
): boolean {
  if (!rooms.length) return true;
  const seen = new Uint8Array(w * h);
  const queue = [rooms[0]!];
  seen[rooms[0]!] = 1;
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i]! % w;
    const y = (queue[i]! - x) / w;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (!at(nx, ny) || (nx === cx && ny === cy) || seen[ny * w + nx]) continue;
      seen[ny * w + nx] = 1;
      queue.push(ny * w + nx);
    }
  }
  return rooms.every((r) => seen[r] === 1);
}
