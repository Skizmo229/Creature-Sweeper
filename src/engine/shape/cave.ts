/**
 * The ragged cave shape. See decision 0002 for why it is grown rather than trimmed.
 */

import { type Rng, randInt } from '../rng.js';
import { type Mask, blankMask, countPresent } from '../grid.js';

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
