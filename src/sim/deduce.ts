/**
 * What the honest player can see and conclude: the constraints each open number sets, what they
 * name and prove safe (the placement rule's readings included), where the cheapest gamble is, and
 * where a Census is worth aiming. `honest.ts` plays with it.
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { ringIsFree } from '../engine/placement/pairs.js';
import { missingFrom } from '../engine/placement/packs.js';
import { placementRule } from '../engine/placement/registry.js';

/**
 * What the board tells you, per open numbered cell: how much tier is still
 * hidden behind it, and which cells that is spread over.
 *
 * Marks only ever come from Reveal here, so a mark is an exact tier rather
 * than a claim, and subtracting it is as sound as subtracting an open cell.
 */
export interface Constraint {
  readonly cell: Cell;
  /** Tier still unaccounted for, over `unknown`. */
  readonly residual: number;
  /** Covered, unmarked neighbours — the cells the residual is spread over. */
  readonly unknown: Cell[];
  /** Creatures among `unknown`, if Census has been cast here. */
  readonly creatures: number | null;
}

/**
 * The most tier one of a constraint's unknown cells could be hiding: the rule's
 * `cap`. On an ordinary board that is the whole residual, the bound Sweep
 * already proves; on a checkerboard the colours cap a single cell below it.
 * Taught to the harness because a real player on that board can see the
 * colours: measuring the ladder with a player who could not would be measuring
 * a different mode.
 *
 * Marks never reach this. Everything marked has already been subtracted out of
 * the residual, so `unknown` IS the set the cap is about.
 */
function capOf(game: Game, c: Constraint, cell: Cell): number {
  return placementRule(game.config.placement).cap(cell, c.residual, c.unknown);
}

function constraintsOf(game: Game): Constraint[] {
  const out: Constraint[] = [];

  for (const cell of game.grid.flat()) {
    if (!cell.present || !cell.open) continue;
    const ns = game.neighboursOf(cell);
    let known = 0;
    let markedSum = 0;
    let markedCount = 0;
    let openCreatures = 0;
    const unknown: Cell[] = [];

    for (const n of ns) {
      if (n.open) {
        known += n.tier;
        if (n.tier > 0) openCreatures++;
      } else if (n.mark > 0) {
        markedSum += n.mark;
        markedCount++;
      } else {
        unknown.push(n);
      }
    }
    if (!unknown.length) continue;

    out.push({
      cell,
      residual: cell.num - known - markedSum,
      unknown,
      creatures: cell.census === null ? null : cell.census - openCreatures - markedCount,
    });
  }
  return out;
}

/**
 * Pairs of numbers, subtracted.
 *
 * Where one number's covered cells are wholly inside another's, the difference
 * is a constraint in its own right: the cells only the bigger one can see, and
 * the tier left once the smaller one's share is taken out. This is the
 * standard sweeper move, and it is also the *only* place a Census count can
 * compound, because counts subtract the same way sums do — which is what
 * "sum plus count pins the layout" means in practice.
 *
 * It exists here so the comparison is fair. Without it a Census answer has
 * nowhere to go but the one number it was cast on, and calling a spell weak
 * because the harness cannot use it would be measuring the harness.
 *
 * Only cells within two steps of each other can share covered neighbours, so
 * that is as far as the pairing looks.
 */
function subtractPairs(constraints: Constraint[]): Constraint[] {
  const derived: Constraint[] = [];

  for (const a of constraints) {
    if (a.unknown.length > 6) continue;
    for (const b of constraints) {
      if (a === b) continue;
      if (Math.abs(a.cell.x - b.cell.x) > 2 || Math.abs(a.cell.y - b.cell.y) > 2) continue;
      if (a.unknown.length >= b.unknown.length) continue;
      if (!a.unknown.every((c) => b.unknown.includes(c))) continue;

      const rest = b.unknown.filter((c) => !a.unknown.includes(c));
      if (!rest.length) continue;
      derived.push({
        cell: b.cell,
        residual: b.residual - a.residual,
        unknown: rest,
        creatures: a.creatures !== null && b.creatures !== null ? b.creatures - a.creatures : null,
      });
    }
  }
  return derived;
}

/** Everything the board says, directly and by subtraction. */
export function allConstraints(game: Game): Constraint[] {
  const direct = constraintsOf(game);
  return [...direct, ...subtractPairs(direct)];
}

/**
 * Name every cell a number pins down on its own, and mark it.
 *
 * A number with one covered neighbour left has told you that cell's tier
 * exactly. This is the workhorse deduction of the whole game and it compounds:
 * each cell named is a cell subtracted from its other numbers, which pins down
 * the next. Marking is how it propagates, because a mark is subtracted from
 * every constraint that touches it.
 *
 * Returns whether anything was learned, so the caller can run it to a fixed
 * point before deciding it is stuck.
 */
export function nameWhatIsCertain(game: Game): boolean {
  let learned = false;

  for (const c of allConstraints(game)) {
    if (c.residual < 0) continue;

    // Proven empty ground, without having to be the last cell behind its
    // number. On a checkerboard a dark square alone under an even sum is
    // empty however many light squares share the number with it, which is the
    // cheap read that mode is built on; everywhere else a cap of zero is just
    // a residual of zero and this says nothing new.
    for (const cell of c.unknown) {
      if (cell.mark > 0 || cell.open || capOf(game, c, cell) !== 0) continue;
      if (game.status === 'playing') {
        game.open(cell.x, cell.y);
        learned = true;
      }
    }

    if (c.unknown.length !== 1) continue;
    const cell = c.unknown[0]!;
    if (cell.mark > 0 || cell.open || c.residual === 0) continue;
    game.setMark(cell.x, cell.y, Math.min(9, c.residual));
    learned = true;
  }
  const paired = namePairs(game);
  return namePacks(game) || paired || learned;
}

/**
 * What the pairing rule names, which is a great deal and none of it arithmetic.
 *
 * Taught to the harness for the same reason the colour bound was: a real
 * player on that board can see the rule, and measuring the ladder with a
 * player who could not would have been measuring a different mode and would
 * have tuned it far too sparse.
 *
 * Two reads, and neither needs a number subtracted from anything:
 *
 *   Met its partner — an open creature beside an open creature has found the
 *   one creature it is allowed to touch, so every other neighbour is empty
 *   ground and can be opened at any level. This is the crater that makes
 *   clearing a pair worth doing.
 *
 *   Last candidate standing — if the partner is still covered and only one
 *   covered neighbour is left, that cell IS the partner, and its tier is the
 *   creature's own number exactly. The pairing equivalent of "a number with
 *   one covered neighbour has named it", and it fires far more often, because
 *   a creature's ring empties out fast once the cells around it open.
 */
function namePairs(game: Game): boolean {
  if (!isPaired(game)) return false;
  let learned = false;

  for (const cell of game.grid.flat()) {
    if (!cell.present || !cell.open || cell.tier === 0) continue;
    const ns = game.neighboursOf(cell);
    const covered = ns.filter((n) => !n.open);
    if (!covered.length) continue;

    if (ns.some((n) => n.open && n.tier > 0)) {
      // The partner is accounted for; the rest of the ring is blank ground.
      for (const n of covered) {
        if (game.status !== 'playing') break;
        game.open(n.x, n.y);
        learned = true;
      }
      continue;
    }
    // Still out there, so it is one of the covered cells — and if that is the
    // only one left, it is named without a guess.
    if (covered.length === 1 && covered[0]!.mark === 0 && cell.num > 0) {
      game.setMark(covered[0]!.x, covered[0]!.y, Math.min(9, cell.num));
      learned = true;
    }
  }
  return learned;
}

/**
 * What the pack rule names. Taught to the harness for PAIRS's reason: a real
 * player can see which creatures stand together, and a harness that could not
 * would tune the ladder against a different mode.
 *
 * The ring proof — "every covered neighbour is a packmate, and a packmate is
 * one of the tiers still missing" — is read through the engine's own
 * `missingFrom` in `safeToOpen` and `bestGuess`. What this adds is the one read
 * that names a tier rather than bounding it: a piece of a pack showing all but
 * one tier has exactly one creature left, and it must touch the piece, since a
 * pack is connected and the rest are found. If only one covered cell touches
 * the piece, that cell IS the missing tier.
 */
function namePacks(game: Game): boolean {
  if (!isGrouped(game)) return false;
  const tiers = game.config.tiers;
  const done = new Set<Cell>();
  let learned = false;

  for (const cell of game.grid.flat()) {
    if (!cell.present || !cell.open || cell.tier === 0 || done.has(cell)) continue;
    const piece: Cell[] = [cell];
    done.add(cell);
    for (let i = 0; i < piece.length; i++) {
      for (const n of game.neighboursOf(piece[i]!)) {
        if (n.open && n.tier > 0 && !done.has(n)) {
          done.add(n);
          piece.push(n);
        }
      }
    }
    if (piece.length !== tiers - 1) continue;
    const rim = new Set<Cell>();
    for (const c of piece) for (const n of game.neighboursOf(c)) if (!n.open) rim.add(n);
    if (rim.size !== 1) continue;
    const [only] = [...rim];
    const found = new Set(piece.map((c) => c.tier));
    let missing = 0;
    for (let t = 1; t <= tiers; t++) if (!found.has(t)) missing = t;
    if (only!.mark === 0 && missing > 0) {
      game.setMark(only!.x, only!.y, missing);
      learned = true;
    }
  }
  return learned;
}

/** Creatures stand in non-touching pairs (PAIRS, DOMINOES). */
function isPaired(game: Game): boolean {
  return placementRule(game.config.placement).groups === 'pairs';
}

/** Creatures stand in non-touching packs (PACKS; a congo line is a pack with a shape). */
function isGrouped(game: Game): boolean {
  return placementRule(game.config.placement).groups === 'packs';
}

/**
 * The highest tier each covered cell could be, as far as the packs beside it
 * can say — or nothing, off a pack board or away from one. A covered neighbour
 * of an open creature is a packmate or empty, so it is capped by the highest
 * tier that pack has not shown yet.
 */
function packCaps(game: Game): Map<Cell, number> {
  const caps = new Map<Cell, number>();
  if (!isGrouped(game)) return caps;
  // The rule may prove some of the rim empty outright: above all, every cell
  // the rest of a congo line cannot reach from its ends. Read through the
  // engine's own proof, for the pairing ring's reason.
  for (const cell of placementRule(game.config.placement).emptied(game)) caps.set(cell, 0);
  const gaps = missingFrom(game.grid.flat(), (c) => game.neighboursOf(c), game.config.tiers);
  for (const [cell, gap] of gaps) {
    for (const n of game.neighboursOf(cell)) {
      if (n.open) continue;
      const seen = caps.get(n);
      if (seen === undefined || gap < seen) caps.set(n, gap);
    }
  }
  return caps;
}

/**
 * Everything that can be opened without a gamble.
 *
 * Four rules, in order of how much they need to know:
 *   nothing left to hide  — residual 0, so every covered neighbour is empty;
 *   a named creature      — Reveal or deduction gave an exact tier, and it is
 *                           at or under your level, so the fight is free;
 *   Sweep's bound         — the whole residual fits under your level, so no
 *                           single cell behind it can be over your level;
 *   the Census bound      — knowing how many creatures share the residual puts
 *                           a tighter cap on the biggest of them, because each
 *                           of the others is worth at least 1. This is the
 *                           only thing a Census count can do that the residual
 *                           could not already: a count of zero says the same
 *                           as a residual of zero, and anything short of the
 *                           full count says which cells only by luck.
 */
export function safeToOpen(game: Game, constraints: Constraint[]): Cell[] {
  const safe = new Set<Cell>();
  const level = game.level;

  // Named creatures at or under level: free EXP, and the only way a board with
  // marks on it ever gets finished.
  for (const cell of game.grid.flat()) {
    if (cell.present && !cell.open && cell.mark > 0 && cell.mark <= level) safe.add(cell);
  }

  for (const c of constraints) {
    if (c.residual < 0) continue;

    let proven = c.residual === 0;
    if (!proven && level >= 1 && c.residual <= level) proven = true;
    if (!proven && c.creatures !== null && c.creatures > 0 && level >= 1) {
      if (c.residual - (c.creatures - 1) <= level) proven = true;
    }
    if (proven) {
      for (const n of c.unknown) safe.add(n);
      continue;
    }
    // The colour bound, which is decided per cell rather than for the whole
    // set at once: half a number's unknowns can be safe while the other half
    // is not, which is the shape of deduction unique to this board.
    for (const n of c.unknown) if (capOf(game, c, n) <= level) safe.add(n);
  }

  // The pairing ring, read through the engine's own proof rather than a copy
  // of it — a second implementation of a rule this load-bearing is a second
  // place for it to drift. A creature's number is its partner's tier, so at or
  // below your level the whole ring around it is free.
  if (isPaired(game)) {
    for (const cell of game.grid.flat()) {
      if (!cell.present || !cell.open || cell.tier === 0) continue;
      const ns = game.neighboursOf(cell);
      if (!ringIsFree(cell, ns, level)) continue;
      for (const n of ns) if (!n.open) safe.add(n);
    }
  }

  // The pack ring, the same way: capped by the highest tier the pack beside it
  // still has to show, which is 0 once the pack is whole.
  for (const [cell, cap] of packCaps(game)) if (cap <= level) safe.add(cell);
  return [...safe];
}

/**
 * Where to gamble when there is nothing left to prove.
 *
 * The cheapest guess is the one with the least tier behind it per cell it
 * could be hiding. A cell no number touches at all is scored off the board's
 * own average, which is usually worse than a constrained one and correctly so.
 *
 * Only cells the crawl rule would actually let the player click, because this
 * is meant to be an honest player and a real one cannot gamble on a room they
 * have not reached yet. `inReach` is free on every board without a rule.
 */
export function bestGuess(
  game: Game,
  constraints: Constraint[],
  among?: ReadonlySet<Cell>,
): Cell | null {
  const board = game.config;
  const total = board.quantity.reduce((s, n, i) => s + n * (i + 1), 0);
  const covered = game.grid
    .flat()
    .filter((c) => c.present && !c.open && c.mark === 0 && game.inReach(c));
  if (!covered.length) return null;
  const loose = total / Math.max(1, covered.length);
  // Narrowing the field changes which cell wins, never how each is scored.
  const field = among ? covered.filter((c) => among.has(c)) : covered;

  // Two numbers per cell: the most tier it could possibly be hiding, and the
  // average if the residual were spread evenly. Damage is convex in tier, so
  // the ceiling decides and the average breaks ties.
  const ceiling = new Map<Cell, number>();
  const mean = new Map<Cell, number>();
  for (const c of constraints) {
    if (c.residual < 0) continue;
    const counted =
      c.creatures !== null && c.creatures > 0 ? c.residual - (c.creatures - 1) : c.residual;
    const each = c.residual / c.unknown.length;
    for (const n of c.unknown) {
      // A player choosing where to gamble knows the colours too, so the cheap
      // square on a checkerboard is often the one whose parity caps it low.
      const cap = Math.min(counted, capOf(game, c, n));
      const seenCap = ceiling.get(n);
      if (seenCap === undefined || cap < seenCap) ceiling.set(n, cap);
      const seenEach = mean.get(n);
      if (seenEach === undefined || each < seenEach) mean.set(n, each);
    }
  }

  // A player beside a pack knows what the pack still has to show.
  for (const [cell, cap] of packCaps(game)) {
    const seen = ceiling.get(cell);
    if (seen === undefined || cap < seen) ceiling.set(cell, cap);
  }

  let best: Cell | null = null;
  let bestKey: [number, number] = [Infinity, Infinity];
  for (const cell of field) {
    const key: [number, number] = [ceiling.get(cell) ?? loose * 2, mean.get(cell) ?? loose];
    if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
      best = cell;
      bestKey = key;
    }
  }
  return best;
}

/** The open cell whose Census would say most about the coming gamble. */
export function censusTarget(game: Game, constraints: Constraint[], guess: Cell): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;

  for (const c of constraints) {
    if (c.cell.census !== null) continue;
    if (!c.unknown.includes(guess)) continue;
    // Most tier spread over fewest cells: the bound the count would tighten.
    const score = c.residual / c.unknown.length;
    if (score > bestScore) {
      best = c.cell;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Where a Census would actually pay — decided by looking.
 *
 * This is a cheat, and deliberately so. It tries the count in every open cell
 * near the impasse, keeps the first that turns something provable, and spends
 * nothing at all if none of them does. No player can do this; it is an upper
 * bound on what perfect Census targeting could ever be worth, so that a weak
 * result cannot be blamed on the harness aiming badly.
 */
export function censusOracle(game: Game, guess: Cell): Cell | null {
  for (const cell of game.grid.flat()) {
    if (!cell.present || !cell.open || cell.census !== null) continue;
    if (Math.abs(cell.x - guess.x) > 2 || Math.abs(cell.y - guess.y) > 2) continue;
    const ns = game.neighboursOf(cell);
    if (!ns.some((n) => !n.open && n.mark === 0)) continue;

    cell.census = ns.filter((n) => n.tier > 0).length;
    const unlocked = safeToOpen(game, allConstraints(game)).some((c) => !c.open);
    cell.census = null;
    if (unlocked) return cell;
  }
  return null;
}
