/**
 * The tricks: one technique per entry of `docs/strategies.md`, at the grade that page gives it.
 *
 * A trick reads the board through `View` and proposes moves: cells proven safe to open at the
 * current level, cells named with an exact tier, and candidate sets narrowed. It never touches
 * the game. The graded player (`graded.ts`) runs the tricks a grade at a time, lowest first, and
 * applies what the lowest yielding grade found, which is how "what did this board demand" is
 * measured (docs/human-tuning-plan.md).
 *
 * Each conclusion carries its `Why`: the visible numbers and cells the proof read, so that a
 * teacher can point at them (docs/teaching-plan.md). The graded player does not read it.
 *
 * Every trick reads only what a person can see (`reader.ts`), and the placement rules are asked
 * through their hooks rather than named: `groups` for the pairing and pack readings, `cap` and
 * `emptied` for the colour and line proofs, `noteCandidates` for what the pencil would offer,
 * `display.showsCreatures` for a board that draws every creature where it stands.
 * A rule reading that needs a hidden number is skipped unless the view may peek.
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { hasNote, noteBit } from '../engine/notes.js';
import { missingFrom } from '../engine/placement/packs.js';
import { placementRule } from '../engine/placement/registry.js';
import {
  type Constraint,
  type Reading,
  everyTier,
  highestTier,
  lowestTier,
  reachable,
  supported,
  tiersUpTo,
} from './reader.js';

/** How much has to be held in the head at once; `docs/strategies.md` says what each means. */
export type Grade = 0 | 1 | 2 | 3 | 4;
export const GRADES: readonly Grade[] = [0, 1, 2, 3, 4];

export type TrickId =
  | 'raw-ring'
  | 'named-kill'
  | 'met-partner'
  | 'corridor'
  | 'sprinkles'
  | 'residual-ring'
  | 'last-cell'
  | 'census-ring'
  | 'counters'
  | 'lone-dark'
  | 'partner-number'
  | 'subtract'
  | 'overlap'
  | 'bounds'
  | 'colour-cap'
  | 'pack-gap'
  | 'what-if'
  | 'line-reach'
  | 'accounted'
  | 'last-of-tier';

/** The board as a trick sees it. */
export interface View {
  readonly game: Game;
  readonly reading: Reading;
  readonly level: number;
  /** Whether a beaten creature's number may be read where the game hides it. */
  readonly peek: boolean;
  /** The player's candidate set for a covered, unmarked cell: what it would have pencilled. */
  domain(cell: Cell): number;
  /** A dungeon's corridors, doorways and pockets, read off the silhouette. Empty elsewhere. */
  readonly scaffold: ReadonlySet<Cell>;
}

/**
 * What a conclusion rests on, so that a teacher can point at it: the visible numbers the proof
 * read, and any other visible cell it read (a beaten creature whose partner is being named, a
 * pack's shown member, the mark being harvested). Both empty where the proof is the board's own
 * rule and nothing on it: a corridor, a sprinkle, the counters.
 */
export interface Why {
  readonly constraints: readonly Constraint[];
  readonly cells: readonly Cell[];
}

/** What a trick proposes. */
export interface Moves {
  /** Safe to open at the current level: empty ground, or a creature at or under it. */
  readonly open: Set<Cell>;
  /** Named exactly, and above the level. */
  readonly mark: Map<Cell, number>;
  /** Candidates narrowed to this mask. */
  readonly narrow: Map<Cell, number>;
  /** Why each cell above was concluded; the first proof to reach a cell keeps it. */
  readonly because: Map<Cell, Why>;
}

export interface Trick {
  readonly grade: Grade;
  apply(view: View, moves: Moves): void;
}

export function noMoves(): Moves {
  return { open: new Set(), mark: new Map(), narrow: new Map(), because: new Map() };
}

/** A proof that reads these numbers, and these other cells. */
function by(constraints: readonly Constraint[], cells: readonly Cell[] = []): Why {
  return { constraints, cells };
}

/** A proof that reads nothing on the board but its rule. */
const RULE: Why = by([]);

/** Propose a cell as safe to open, remembering why. */
function open(m: Moves, cell: Cell, why: Why): void {
  m.open.add(cell);
  if (!m.because.has(cell)) m.because.set(cell, why);
}

/**
 * Decide what a narrowed candidate set means for a cell: nothing above the level and it is safe
 * to open; one tier left and it is named; otherwise the pencil is narrowed. Empty ground alone
 * is a candidate set at or under any level, so `{0}` opens at level 0 too.
 */
function settle(view: View, cell: Cell, mask: number, moves: Moves, why: Why): void {
  const before = view.domain(cell);
  const dom = before & mask;
  if (dom === 0) return;
  if (highestTier(dom) <= view.level) moves.open.add(cell);
  else if ((dom & (dom - 1)) === 0) moves.mark.set(cell, lowestTier(dom));
  else if (dom !== before) moves.narrow.set(cell, dom);
  else return;
  if (!moves.because.has(cell)) moves.because.set(cell, why);
}

/** What some cells can be, given that together they sum to something in [lo, hi]. */
function concludeSum(
  view: View,
  cells: readonly Cell[],
  lo: number,
  hi: number,
  m: Moves,
  why: Why,
): void {
  if (hi < 0 || lo > hi || !cells.length) return;
  if (hi <= view.level) {
    for (const c of cells) open(m, c, why);
    return;
  }
  const sup = supported(
    cells.map((c) => view.domain(c)),
    lo,
    hi,
  );
  if (!sup) return;
  cells.forEach((c, i) => settle(view, c, sup[i]!, m, why));
}

/** The least and the most some cells can add up to. */
function sumRange(view: View, cells: readonly Cell[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const c of cells) {
    const d = view.domain(c);
    lo += Math.max(0, lowestTier(d));
    hi += Math.max(0, highestTier(d));
  }
  return [lo, hi];
}

const openCreature = (c: Cell): boolean => c.open && c.tier > 0;
const coveredUnmarked = (c: Cell): boolean => !c.open && c.mark === 0;

// ------------------------------------------------------------------ grade 0

const rawRing: Trick = {
  grade: 0,
  apply(v, m) {
    for (const c of v.reading.constraints) {
      if (c.cell.num > v.level) continue;
      for (const n of c.unknown) open(m, n, by([c]));
    }
  },
};

const namedKill: Trick = {
  grade: 0,
  apply(v, m) {
    if (v.level <= 0) return;
    for (const [cell, mark] of v.reading.marked) if (mark <= v.level) open(m, cell, by([], [cell]));
  },
};

// A creature beside a creature has met its partner, and a covered cell touching two creatures
// would have two of its own, so both empty the ground around them at any level.
const metPartner: Trick = {
  grade: 0,
  apply(v, m) {
    if (placementRule(v.game.config.placement).groups !== 'pairs') return;
    for (const cell of v.game.grid.flat()) {
      if (!cell.present || !openCreature(cell)) continue;
      const ns = v.game.neighboursOf(cell);
      const partner = ns.find(openCreature);
      if (!partner) continue;
      for (const n of ns) if (coveredUnmarked(n)) open(m, n, by([], [cell, partner]));
    }
    for (const cell of v.reading.unknown) {
      const creatures = v.game.neighboursOf(cell).filter(openCreature);
      if (creatures.length >= 2) open(m, cell, by([], creatures));
    }
  },
};

const corridor: Trick = {
  grade: 0,
  apply(v, m) {
    for (const cell of v.scaffold) if (coveredUnmarked(cell)) open(m, cell, RULE);
  },
};

// Where the board draws every creature where it stands, a plain cell is empty ground and a
// sprinkle is a creature: what the pencil offers on each, which is what the board shows.
const sprinkles: Trick = {
  grade: 0,
  apply(v, m) {
    if (!placementRule(v.game.config.placement).display.showsCreatures) return;
    for (const cell of v.reading.unknown) settle(v, cell, v.game.noteCandidates(cell), m, RULE);
  },
};

// ------------------------------------------------------------------ grade 1

const residualRing: Trick = {
  grade: 1,
  apply(v, m) {
    for (const c of v.reading.constraints) {
      if (c.residual > v.level) continue;
      for (const n of c.unknown) open(m, n, by([c]));
    }
  },
};

const lastCell: Trick = {
  grade: 1,
  apply(v, m) {
    for (const c of v.reading.constraints) {
      if (c.unknown.length !== 1 || c.residual < 1 || c.residual > v.game.config.tiers) continue;
      settle(v, c.unknown[0]!, noteBit(c.residual), m, by([c]));
    }
  },
};

// A tier whose creatures are all dead, or all marked, is hiding nowhere; when nothing above the
// level is hiding at all, every covered cell is free.
// A Census says how many creatures share the remainder; each is worth at least 1, so the
// biggest is the remainder less one for every other. Sweep proves the same.
const censusRing: Trick = {
  grade: 1,
  apply(v, m) {
    for (const c of v.reading.constraints) {
      if (c.creatures === null || c.creatures > c.unknown.length) continue;
      if (c.creatures > 0 && c.residual - (c.creatures - 1) > v.level) continue;
      for (const n of c.unknown) open(m, n, by([c]));
    }
  },
};

const counters: Trick = {
  grade: 1,
  apply(v, m) {
    const r = v.reading;
    if (r.top <= v.level) {
      for (const cell of r.unknown) open(m, cell, RULE);
      return;
    }
    for (const cell of r.unknown) {
      if (v.domain(cell) & ~r.hidingMask) settle(v, cell, r.hidingMask, m, RULE);
    }
  },
};

// The rule proves one cell of a ring empty on its own: the checkerboard's lone dark square under
// an even remainder. Everywhere else a cap of 0 is a remainder of 0, which `residual-ring` took.
const loneDark: Trick = {
  grade: 1,
  apply(v, m) {
    const rule = placementRule(v.game.config.placement);
    for (const c of v.reading.constraints) {
      if (c.residual <= 0) continue;
      for (const n of c.unknown) {
        if (rule.cap(n, c.residual, c.unknown) === 0) open(m, n, by([c]));
      }
    }
  },
};

// Beside a lone open creature a covered cell is its partner or empty, and the creature's own
// number is the partner's tier: what the pencil offers there, read only where the number shows.
const partnerNumber: Trick = {
  grade: 1,
  apply(v, m) {
    const rule = placementRule(v.game.config.placement);
    if (rule.groups !== 'pairs' || (!v.peek && !rule.display.hoverShowsNumber)) return;
    for (const cell of v.reading.unknown) {
      const creatures = v.game.neighboursOf(cell).filter(openCreature);
      if (creatures.length !== 1) continue;
      settle(v, cell, v.game.noteCandidates(cell), m, by([], creatures));
    }
  },
};

// ------------------------------------------------------------------ grade 2

// One number's covered cells inside another's: the difference is a number over the rest.
const subtract: Trick = {
  grade: 2,
  apply(v, m) {
    const { touching } = v.reading;
    for (const a of v.reading.constraints) {
      for (const b of touching.get(a.unknown[0]!) ?? []) {
        if (b === a || b.unknown.length <= a.unknown.length) continue;
        if (!a.unknown.every((c) => b.unknown.includes(c))) continue;
        const rest = b.unknown.filter((c) => !a.unknown.includes(c));
        const d = b.residual - a.residual;
        concludeSum(v, rest, d, d, m, by([a, b]));
      }
    }
  },
};

// Two numbers sharing some cells: what each sees alone is bounded by the other.
const overlap: Trick = {
  grade: 2,
  apply(v, m) {
    const { constraints, touching } = v.reading;
    const index = new Map<Constraint, number>(constraints.map((c, i) => [c, i]));
    const done = new Set<number>();
    for (const a of constraints) {
      const ia = index.get(a)!;
      for (const cell of a.unknown) {
        for (const b of touching.get(cell) ?? []) {
          const ib = index.get(b)!;
          if (ib <= ia) continue;
          const key = ia * constraints.length + ib;
          if (done.has(key)) continue;
          done.add(key);
          const shared = a.unknown.filter((c) => b.unknown.includes(c));
          const p = a.unknown.filter((c) => !b.unknown.includes(c));
          const q = b.unknown.filter((c) => !a.unknown.includes(c));
          if (!p.length || !q.length) continue;
          const [pLo, pHi] = sumRange(v, p);
          const [qLo, qHi] = sumRange(v, q);
          const lo = Math.max(0, a.residual - pHi, b.residual - qHi);
          const hi = Math.min(a.residual - pLo, b.residual - qLo, sumRange(v, shared)[1]);
          if (lo > hi) continue;
          const why = by([a, b]);
          concludeSum(v, p, a.residual - hi, a.residual - lo, m, why);
          concludeSum(v, q, b.residual - hi, b.residual - lo, m, why);
        }
      }
    }
  },
};

const bounds: Trick = {
  grade: 2,
  apply(v, m) {
    for (const c of v.reading.constraints) {
      concludeSum(v, c.unknown, c.residual, c.residual, m, by([c]));
    }
  },
};

// What a square's colour caps it at, and what the pencil refuses for it. Only where the rule
// says something: on a plain board the cap is the whole remainder and the pencil offers all.
const colourCap: Trick = {
  grade: 2,
  apply(v, m) {
    const rule = placementRule(v.game.config.placement);
    if (rule.groups !== null) return;
    const all = everyTier(v.game.config.tiers);
    for (const c of v.reading.constraints) {
      for (const n of c.unknown) {
        const cap = rule.cap(n, c.residual, c.unknown);
        const offered = v.game.noteCandidates(n);
        if (cap >= c.residual && offered === all) continue;
        settle(v, n, tiersUpTo(cap) & offered, m, by([c]));
      }
    }
  },
};

// Beside a pack a covered cell holds a tier the pack has not shown, or nothing; and a pack
// missing one tier with one covered cell beside it has named that cell.
const packGap: Trick = {
  grade: 2,
  apply(v, m) {
    if (placementRule(v.game.config.placement).groups !== 'packs') return;
    const tiers = v.game.config.tiers;
    const gaps = missingFrom(v.game.grid.flat(), (c) => v.game.neighboursOf(c), tiers);
    for (const [cell, gap] of gaps) {
      for (const n of v.game.neighboursOf(cell)) {
        if (coveredUnmarked(n)) {
          settle(v, n, tiersUpTo(gap) & v.game.noteCandidates(n), m, by([], [cell]));
        }
      }
    }
    const seen = new Set<Cell>();
    for (const start of gaps.keys()) {
      if (seen.has(start)) continue;
      const piece = [start];
      seen.add(start);
      for (let i = 0; i < piece.length; i++) {
        for (const n of v.game.neighboursOf(piece[i]!)) {
          if (openCreature(n) && !seen.has(n)) {
            seen.add(n);
            piece.push(n);
          }
        }
      }
      if (piece.length !== tiers - 1) continue;
      const rim = new Set<Cell>();
      for (const c of piece) for (const n of v.game.neighboursOf(c)) if (!n.open) rim.add(n);
      if (rim.size !== 1) continue;
      const [only] = rim;
      const shown = new Set(piece.map((c) => c.tier));
      for (let t = 1; t <= tiers; t++) {
        if (!shown.has(t) && coveredUnmarked(only!)) settle(v, only!, noteBit(t), m, by([], piece));
      }
    }
  },
};

// ------------------------------------------------------------------ grade 3

/** Rounds of re-reading a window before a supposition is called consistent. */
const WHAT_IF_ROUNDS = 6;

/** Do the numbers in a window admit these candidate sets? Narrows them to what they admit. */
function consistent(window: ReadonlySet<Constraint>, local: Map<Cell, number>): boolean {
  for (let round = 0; round < WHAT_IF_ROUNDS; round++) {
    let changed = false;
    for (const c of window) {
      const doms = c.unknown.map((n) => local.get(n)!);
      const sup = supported(doms, c.residual, c.residual);
      if (!sup) return false;
      c.unknown.forEach((n, i) => {
        if (sup[i] !== doms[i]) {
          local.set(n, sup[i]!);
          changed = true;
        }
      });
    }
    if (!changed) break;
  }
  return true;
}

// Suppose a cell is each of its candidates in turn and follow the numbers two steps out; a
// candidate the numbers cannot accommodate is struck off.
const whatIf: Trick = {
  grade: 3,
  apply(v, m) {
    const { touching } = v.reading;
    for (const cell of v.reading.unknown) {
      const dom = v.domain(cell);
      if ((dom & (dom - 1)) === 0) continue;
      const near = touching.get(cell);
      if (!near) continue;
      const window = new Set<Constraint>(near);
      for (const c of near) {
        for (const n of c.unknown) for (const c2 of touching.get(n) ?? []) window.add(c2);
      }
      const cells = new Set<Cell>();
      for (const c of window) for (const n of c.unknown) cells.add(n);
      let survivors = 0;
      for (let t = 0; t <= v.game.config.tiers; t++) {
        if (!hasNote(dom, t)) continue;
        const local = new Map<Cell, number>();
        for (const n of cells) local.set(n, v.domain(n));
        local.set(cell, noteBit(t));
        if (consistent(window, local)) survivors |= noteBit(t);
      }
      if (survivors !== dom) settle(v, cell, survivors, m, by([...window]));
    }
  },
};

const lineReach: Trick = {
  grade: 3,
  apply(v, m) {
    for (const cell of placementRule(v.game.config.placement).emptied(v.game)) {
      if (coveredUnmarked(cell)) open(m, cell, RULE);
    }
  },
};

// ------------------------------------------------------------------ grade 4

// Numbers whose rings do not overlap each account for their own hidden tier; whatever the
// counters say is left beyond that is spread over every other covered cell.
const accounted: Trick = {
  grade: 4,
  apply(v, m) {
    const r = v.reading;
    const taken = new Set<Cell>();
    const accounting: Constraint[] = [];
    let acc = 0;
    const byResidual = [...r.constraints].sort((a, b) => b.residual - a.residual);
    for (const c of byResidual) {
      if (c.unknown.some((n) => taken.has(n))) continue;
      for (const n of c.unknown) taken.add(n);
      accounting.push(c);
      acc += c.residual;
    }
    const rest = r.totalHiding - acc;
    if (rest < 0) return;
    const why = by(accounting);
    for (const cell of r.unknown) if (!taken.has(cell)) settle(v, cell, tiersUpTo(rest), m, why);
  },
};

// The creatures of a tier still hiding are all forced into rings that cannot be made without
// one; then no other cell holds that tier.
const lastOfTier: Trick = {
  grade: 4,
  apply(v, m) {
    const r = v.reading;
    for (let t = r.top; t >= 1; t--) {
      const hiding = r.hiding[t]!;
      if (hiding <= 0) continue;
      const bit = noteBit(t);
      const taken = new Set<Cell>();
      const forcing: Constraint[] = [];
      for (const c of r.constraints) {
        if (forcing.length >= hiding) break;
        if (c.unknown.some((n) => taken.has(n))) continue;
        if (!c.unknown.some((n) => hasNote(v.domain(n), t))) continue;
        if (
          reachable(
            c.unknown.map((n) => v.domain(n) & ~bit),
            c.residual,
          )
        ) {
          continue;
        }
        forcing.push(c);
        for (const n of c.unknown) taken.add(n);
      }
      if (forcing.length < hiding) continue;
      const why = by(forcing);
      for (const cell of r.unknown) {
        if (!taken.has(cell) && v.domain(cell) & bit) {
          settle(v, cell, v.domain(cell) & ~bit, m, why);
        }
      }
    }
  },
};

/** Every trick, keyed by id, so a new one cannot be added without a grade. */
export const TRICKS: Readonly<Record<TrickId, Trick>> = {
  'raw-ring': rawRing,
  'named-kill': namedKill,
  'met-partner': metPartner,
  corridor,
  sprinkles,
  'residual-ring': residualRing,
  'last-cell': lastCell,
  'census-ring': censusRing,
  counters,
  'lone-dark': loneDark,
  'partner-number': partnerNumber,
  subtract,
  overlap,
  bounds,
  'colour-cap': colourCap,
  'pack-gap': packGap,
  'what-if': whatIf,
  'line-reach': lineReach,
  accounted,
  'last-of-tier': lastOfTier,
};

export const TRICK_IDS = Object.keys(TRICKS) as TrickId[];
