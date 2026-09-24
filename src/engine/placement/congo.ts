/**
 * The congo placement: creatures stand in lines of six, one of every tier, led
 * by the tier 6 — and no two lines touch.
 *
 * PACKS with a shape and an order imposed. A line is a pack whose members step
 * ORTHOGONALLY from one to the next and never bunch into a 2x2 block, and whose
 * strongest member is always at the front. Everything PACKS proves carries
 * over unchanged, because every line is still a connected group of one of each
 * tier that no other group touches: `missingFrom` answers for a line exactly as
 * it answers for a pack.
 *
 * "NO 2x2" AND "A TRUE LINE" ARE THE SAME RULE AT THIS LENGTH. The generator
 * enforces the stronger-sounding one — no member is orthogonally beside any
 * member but the one before it and the one after — and that is not a second
 * rule. Two members orthogonally adjacent without being consecutive close a
 * cycle of orthogonal steps, and a cycle of grid cells is at least four long
 * and, below eight, always contains a 2x2 block (four is the block, six is a
 * 2x3 rectangle). A line of six cannot hold a cycle of eight. So forbidding the
 * block is forbidding the shortcut, and what that buys the player is exact:
 *
 *   Every member has at most two orthogonal linemates. The ends have one.
 *
 * Diagonals are NOT constrained, and cannot be: a line that turns a corner
 * puts the cells either side of the corner diagonally together. So a covered
 * cell diagonal to a member may still be a linemate, and every proof below
 * reasons about orthogonal neighbours only.
 *
 * WHAT THAT HANDS THE PLAYER, beyond the pack proof (`congoClear`):
 *
 *   The leader is the tier 6, and the leader is an END. Once one linemate
 *   beside it is open, its other orthogonal neighbours are empty ground.
 *
 *   Any member with two open orthogonal linemates is full. Its other
 *   orthogonal neighbours are empty ground.
 *
 *   Three open creatures in a 2x2 block are one line (they all touch), so the
 *   fourth cell of the block is empty ground.
 *
 *   A line only continues from its ends, so a covered cell beside a partial
 *   line that the missing members cannot walk to is empty ground. This is the
 *   one that earns its place; see `beyondReach` for why the three above almost
 *   never find anything the pack proof has not.
 *
 * All four hold at ANY level, like a whole pack's ring: they say a cell is
 * empty, not that it is weak. None can run away. Every cell they name touches
 * a creature, so it carries that creature's tier in its own number, is never
 * a zero and never cascades; each proof clears cells around one line and
 * stops.
 *
 * WHAT THIS DOES NOT TOUCH. One of every tier per line, so `quantity` is flat,
 * exactly as for PACKS; the order within the line decides where tiers stand,
 * never how many there are. C_k, the zero-damage guarantee and "EXP is always
 * collected" are where they were.
 */

import type { Cell } from '../types.js';
import { type Rng, randInt, shuffle } from '../rng.js';
import { type PlacementRow, type PlacementRule, boardName } from './rule.js';
import { packsIn } from './packs.js';

/** Restarts allowed before a board is refused. PACKS's argument. */
const CONGO_ATTEMPTS = 60;

/**
 * The most creatures a congo board may be asked for, as a share of its cells.
 * Measured with 40 seeds a point: 34% lands on every seed from 30x16 to 60x30;
 * 35% starts losing seeds on 60x30 and 37% loses nearly all of them on 44x24.
 * A line has more rim per member than a compact pack, which is why it jams a
 * little before PACKS's 36%. It is also the battle ceiling, so the scaling
 * boards stop at the same place either way.
 */
export const CONGO_MAX_DENSITY = 0.34;

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * The orthogonal neighbours of a flat index on a plain `width` x `height`
 * square grid. A congo board is always square and never wrapped — `config.ts`
 * refuses anything else — so this does not need to go through `neighbours()`.
 * The eight-way adjacency the numbers are summed over still does.
 */
function orthoFlat(flat: number, width: number, height: number): number[] {
  const x = flat % width;
  const y = Math.floor(flat / width);
  const out: number[] = [];
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) out.push(ny * width + nx);
  }
  return out;
}

/**
 * Lay down `count` lines of `length` cells among `candidates`, no two touching.
 *
 * Returns each line in order, LEADER FIRST. The caller deals the tiers.
 *
 * A line is walked, not grown: it starts on a free cell and steps
 * orthogonally off one of its two ends, onto a cell that no member but that
 * end is orthogonally beside. Picking either end at random each step is what
 * lets a line that walked itself into a corner back out along its other end,
 * rather than being thrown away — the difference between a snake and a random
 * walk that dies at the first wall. A line that still cannot finish is taken
 * back; nothing it touched was closed yet.
 *
 * Which end leads is decided by a coin at the end, so the leader is no more
 * likely to be where the walk started than where it finished.
 *
 * Lines never touching holds BY CONSTRUCTION, PACKS's way: placing a line
 * closes its cells and everything around them, eight-way.
 */
export function chooseLines(
  candidates: readonly number[],
  neighboursOf: (flat: number) => readonly number[],
  width: number,
  height: number,
  count: number,
  length: number,
  rng: Rng,
): number[][] {
  if (count === 0) return [];
  if (count * length > candidates.length) {
    throw new Error(`congo: ${count * length} creatures want ${candidates.length} cells`);
  }

  const allowed = new Set(candidates);
  const order = candidates.slice();

  for (let attempt = 0; attempt < CONGO_ATTEMPTS; attempt++) {
    shuffle(order, rng);
    const blocked = new Set<number>();
    const lines: number[][] = [];

    for (const start of order) {
      if (lines.length === count) break;
      if (blocked.has(start)) continue;

      const line = [start];
      const inLine = new Set(line);
      // A step is legal onto a free cell that touches the line orthogonally
      // at the end being extended and nowhere else.
      const stepsFrom = (end: number): number[] =>
        orthoFlat(end, width, height).filter(
          (n) =>
            allowed.has(n) &&
            !blocked.has(n) &&
            !inLine.has(n) &&
            orthoFlat(n, width, height).every((m) => m === end || !inLine.has(m)),
        );

      while (line.length < length) {
        const ends = line.length === 1 ? [0] : shuffle([0, line.length - 1], rng);
        let stepped = false;
        for (const i of ends) {
          const options = stepsFrom(line[i]!);
          if (!options.length) continue;
          const next = options[randInt(rng, options.length)]!;
          if (i === 0) line.unshift(next);
          else line.push(next);
          inLine.add(next);
          stepped = true;
          break;
        }
        if (!stepped) break;
      }
      if (line.length < length) continue;

      if (randInt(rng, 2) === 1) line.reverse();
      lines.push(line);
      for (const c of line) {
        blocked.add(c);
        for (const n of neighboursOf(c)) blocked.add(n);
      }
    }

    if (lines.length === count) return lines;
  }

  throw new Error(
    `congo: could not place ${count} lines of ${length} in ${candidates.length} cells ` +
      `in ${CONGO_ATTEMPTS} attempts (${((100 * count * length) / candidates.length).toFixed(1)}% ` +
      `density)`,
  );
}

/**
 * The strongest tier leads every line, and the rest follow in a random order
 * per line. `lines` arrive leader first, as `chooseLines` returns them.
 */
export function dealLines(
  lines: readonly (readonly number[])[],
  tiers: number,
  rng: Rng,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const line of lines) {
    if (line.length !== tiers) {
      throw new Error(
        `congo deal: a line of ${line.length} cannot hold one of each of ${tiers} tiers`,
      );
    }
    const followers = shuffle(
      Array.from({ length: tiers - 1 }, (_, i) => i + 1),
      rng,
    );
    out.set(line[0]!, tiers);
    followers.forEach((tier, i) => out.set(line[i + 1]!, tier));
  }
  return out;
}

/**
 * Covered cells a congo board has proven to be empty ground, from what is
 * open. The three proofs in the header; each holds at any level.
 *
 * Reads only open cells, so it is exactly as strong as what the player can
 * see — and a covered cell it names is never a creature, whatever the
 * player's level.
 */
export function congoClear(grid: readonly (readonly Cell[])[], tiers: number): Set<Cell> {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const at = (x: number, y: number): Cell | null =>
    x >= 0 && x < width && y >= 0 && y < height && grid[y]![x]!.present ? grid[y]![x]! : null;
  const openCreature = (c: Cell | null): boolean => !!c && c.open && c.tier > 0;
  const out = new Set<Cell>();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = at(x, y);
      if (!openCreature(cell)) continue;
      const ortho = ORTHO.map(([dx, dy]) => at(x + dx, y + dy)).filter((c): c is Cell => !!c);
      const mates = ortho.filter(openCreature).length;
      // The leader is an end, so one linemate fills it; anyone else is full
      // at two.
      const full = mates >= 2 || (mates >= 1 && cell!.tier === tiers);
      if (full) for (const n of ortho) if (!n.open) out.add(n);
    }
  }

  // Three open creatures in a 2x2 block: the fourth cell would complete the
  // block the rule forbids.
  for (let y = 0; y + 1 < height; y++) {
    for (let x = 0; x + 1 < width; x++) {
      const block = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
      if (block.filter(openCreature).length !== 3) continue;
      for (const c of block) if (c && !c.open) out.add(c);
    }
  }

  // A line only continues from its ends. See `beyondReach`.
  for (const cell of beyondReach(grid, tiers)) out.add(cell);
  return out;
}

/**
 * Covered cells beside a line that the rest of the line cannot reach.
 *
 * This is the proof that pays, and the three above mostly do not, for a
 * reason worth knowing: the leader is the tier 6, and a player who plays in
 * tier order kills it last, at a level where the pack proof has already freed
 * every ring on the board. Measured with the honest player, the three
 * leader-and-shape proofs never once found a cell at a stuck point that the
 * numbers and the pack proof had not.
 *
 * What does not wait for the leader is that a line is a PATH. Open members
 * that are orthogonally connected are a contiguous stretch of it (orthogonal
 * adjacency between members means consecutive, from the header), so every
 * member still missing hangs off one of that stretch's two ends, within as
 * many orthogonal steps as there are members missing. A covered cell beside
 * the stretch that no such walk can reach is empty ground, at any level — and
 * that is the whole rim but a handful of cells once most of a line is found.
 * PACKS cannot say this: its missing members may be anywhere around the pack.
 *
 * The walk passes through covered cells and open creatures (an open member of
 * the same line further along may sit between here and the missing one) and
 * stops only at open empty ground, which is known not to be a member. It does
 * not apply the no-shortcut rule, so it over-counts where the line could go:
 * that is the safe direction. A leader inside the stretch, with company, is
 * the front of the line, so nothing continues off that end.
 *
 * A stretch whose members are joined only diagonally is skipped. That happens
 * when a member between them is still covered at a corner, and then the open
 * cells are not one contiguous stretch and the counting above does not hold.
 */
function beyondReach(grid: readonly (readonly Cell[])[], tiers: number): Cell[] {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const at = (x: number, y: number): Cell | null =>
    x >= 0 && x < width && y >= 0 && y < height && grid[y]![x]!.present ? grid[y]![x]! : null;
  const openCreature = (c: Cell): boolean => c.open && c.tier > 0;
  const ring = (c: Cell): Cell[] => {
    const out: Cell[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = at(c.x + dx, c.y + dy);
        if (n) out.push(n);
      }
    return out;
  };
  const ortho = (c: Cell): Cell[] =>
    ORTHO.map(([dx, dy]) => at(c.x + dx, c.y + dy)).filter((n): n is Cell => !!n);

  const done = new Set<Cell>();
  const out: Cell[] = [];
  for (const row of grid) {
    for (const seed of row) {
      if (!seed.present || !openCreature(seed) || done.has(seed)) continue;
      const piece = [seed];
      done.add(seed);
      for (let i = 0; i < piece.length; i++) {
        for (const n of ring(piece[i]!)) {
          if (openCreature(n) && !done.has(n)) {
            done.add(n);
            piece.push(n);
          }
        }
      }
      const missing = tiers - piece.length;
      if (missing <= 0) continue; // whole: the pack proof frees the ring.

      // Contiguous stretch: orthogonally connected, a path.
      const inPiece = new Set(piece);
      const degree = (c: Cell): number => ortho(c).filter((n) => inPiece.has(n)).length;
      const walked = new Set<Cell>([seed]);
      const queue = [seed];
      for (let i = 0; i < queue.length; i++) {
        for (const n of ortho(queue[i]!)) {
          if (inPiece.has(n) && !walked.has(n)) {
            walked.add(n);
            queue.push(n);
          }
        }
      }
      if (walked.size !== piece.length) continue;
      const ends = piece.length === 1 ? piece : piece.filter((c) => degree(c) === 1);
      const growing = piece.length === 1 ? ends : ends.filter((c) => c.tier !== tiers);

      // Every cell the missing members could stand on: up to `missing`
      // orthogonal steps out from a growing end.
      const reach = new Set<Cell>();
      let frontier = growing.slice();
      const seen = new Set<Cell>(piece);
      for (let step = 0; step < missing && frontier.length; step++) {
        const next: Cell[] = [];
        for (const c of frontier) {
          for (const n of ortho(c)) {
            if (seen.has(n) || (n.open && n.tier === 0)) continue;
            seen.add(n);
            reach.add(n);
            next.push(n);
          }
        }
        frontier = next;
      }

      for (const c of piece) {
        for (const n of ring(c)) if (!n.open && !reach.has(n)) out.push(n);
      }
    }
  }
  return out;
}

/**
 * What is wrong with a congo board, or null if nothing is. For the tests, like
 * `packFault`: every group is one of each tier, strung out as a true line with
 * no 2x2 anywhere, and led by the strongest.
 */
export function congoFault(
  tierAt: ReadonlyMap<number, number>,
  neighboursOf: (flat: number) => readonly number[],
  width: number,
  height: number,
  tiers: number,
): string | null {
  const seen = new Set<number>();
  for (const start of tierAt.keys()) {
    if (seen.has(start)) continue;
    const comp = [start];
    seen.add(start);
    for (let i = 0; i < comp.length; i++) {
      for (const n of neighboursOf(comp[i]!)) {
        if (tierAt.has(n) && !seen.has(n)) {
          seen.add(n);
          comp.push(n);
        }
      }
    }
    if (comp.length !== tiers) {
      return `a line at cell ${start} has ${comp.length} creatures, not ${tiers}`;
    }
    const held = new Set(comp.map((c) => tierAt.get(c)!));
    if (held.size !== tiers) {
      return `the line at cell ${start} repeats a tier: ${comp.map((c) => tierAt.get(c)).join(',')}`;
    }
    const inComp = new Set(comp);
    const degree = (c: number): number =>
      orthoFlat(c, width, height).filter((n) => inComp.has(n)).length;
    // A path: two ends of degree one, everyone else two, and orthogonally
    // connected — which with those degrees rules out a cycle and a branch.
    const ends = comp.filter((c) => degree(c) === 1);
    if (ends.length !== 2 || comp.some((c) => degree(c) > 2)) {
      return `the group at cell ${start} is not a line: degrees ${comp.map(degree).join(',')}`;
    }
    const walk = [ends[0]!];
    const walked = new Set(walk);
    for (let i = 0; i < walk.length; i++) {
      for (const n of orthoFlat(walk[i]!, width, height)) {
        if (inComp.has(n) && !walked.has(n)) {
          walked.add(n);
          walk.push(n);
        }
      }
    }
    if (walk.length !== tiers) {
      return `the line at cell ${start} is not orthogonally connected`;
    }
    const leader = comp.find((c) => tierAt.get(c) === tiers)!;
    if (degree(leader) !== 1) {
      return `the tier ${tiers} at cell ${leader} is not at the front of its line`;
    }
    for (const c of comp) {
      const x = c % width;
      if (x + 1 >= width) continue;
      const block = [c, c + 1, c + width, c + width + 1];
      if (block.every((b) => b < width * height && inComp.has(b))) {
        return `the line at cell ${start} bunches into a 2x2 at cell ${c}`;
      }
    }
  }
  return null;
}

/**
 * The congo rule's requirements: PACKS's, plus a plain square board. A line is defined by
 * orthogonal steps, which hex does not have, and a wrapped seam would let a line step off one edge
 * and on at the other: legal to `neighbours()`, invisible as a line on screen, and a case the
 * "no 2x2" proof would have to be re-argued for. Refused rather than half-supported.
 */
function validateCongo(row: PlacementRow): void {
  const where = boardName(row);
  if (row.topology === 'hex' || (row.wrap && row.wrap !== 'none')) {
    throw new Error(
      `${where}: congo lines step orthogonally, so they need an unwrapped square board`,
    );
  }
  if (packsIn(row.tiers, row.quantity) === null) {
    throw new Error(
      `${where}: quantity [${row.quantity.join(',')}] is not a whole number of lines — ` +
        `a line is one of each of the ${row.tiers} tiers, so the quantity has to be flat`,
    );
  }
  const share = row.monsters / row.cells;
  if (share > CONGO_MAX_DENSITY) {
    throw new Error(
      `${where}: ${row.monsters} creatures on ${row.cells} cells is ` +
        `${(100 * share).toFixed(1)}%, past the ${(100 * CONGO_MAX_DENSITY).toFixed(0)}% ` +
        `non-touching lines can be laid down reliably`,
    );
  }
}

export const CONGO_RULE: PlacementRule = {
  id: 'congo',
  validate: validateCongo,
  opening: 'auto',
};
