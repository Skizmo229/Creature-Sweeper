/**
 * The tutor: the next provable move on the board as it stands, and why (docs/teaching-plan.md,
 * Part 1). One press is one pass of the graded player with a fresh pencil: the tricks are run a
 * grade at a time, lowest first, and the first grade that concludes a cell is the answer, each
 * of its proofs a `Lesson` with the cells it concluded and a caption in the catalogue's words.
 * Pencil work on the way is kept as the press's steps; when nothing concludes the steps are all
 * there is, and when there are none the board is at a guess.
 *
 * WHAT IT READS is what the player sees, through `reader.ts`, and it trusts no mark: a person
 * writes guesses, and a teacher that trusted one would teach the fatal error. A marked cell is
 * read as covered and unknown, so a lesson may name it, and may name it differently from the
 * mark. A mark the press has itself proven is believed from then on, so the numbers beside it
 * are read with it subtracted, as the player reads them; nothing is taught about it, since the
 * player already knows. The pencil is never read (docs/invariants.md); the candidate sets start
 * full on every press.
 *
 * It never acts. Nothing here touches the game.
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { noteBit } from '../engine/notes.js';
import { type Constraint, everyTier, highestTier, readBoard, tiersUpTo } from './reader.js';
import { dungeonScaffold } from './scaffold.js';
import {
  GRADES,
  type Grade,
  type Moves,
  TRICKS,
  TRICK_IDS,
  type TrickId,
  type View,
  type Why,
  noMoves,
} from './tricks.js';
import { TRICK_TEXT } from './tricktext.js';

/** One proof and everything it concluded. */
export interface Lesson {
  readonly trick: TrickId;
  readonly grade: Grade;
  /** The visible numbers and cells the proof read. */
  readonly why: Why;
  /** Safe to open at the current level. */
  readonly open: readonly Cell[];
  /** Named exactly, above the level. */
  readonly mark: ReadonlyArray<readonly [Cell, number]>;
  /** Candidates narrowed, to this mask. */
  readonly narrow: ReadonlyArray<readonly [Cell, number]>;
  /** The tiers the proof ruled out across its cells, as a mask; 0 when it ruled out nothing new. */
  readonly struck: number;
  /** The proof in a sentence, with its numbers filled in. */
  readonly caption: string;
}

export interface TutorOptions {
  /** Read a beaten creature's number even where the game hides it. */
  peek?: boolean;
  /** Where the player last acted; lessons nearest it come first. */
  near?: Cell | null;
}

/** What one press of the tutor found. */
export interface Explanation {
  /**
   * The dearest grade the press needed: of the trick that concluded, or of any pencil work
   * before it. Null when no trick had anything to say.
   */
  readonly grade: Grade | null;
  /** The proofs that concluded a cell, nearest `near` first. Empty when the board is at a guess. */
  readonly lessons: readonly Lesson[];
  /** The pencil work done first, narrowing candidates, in the order it was done. */
  readonly steps: readonly Lesson[];
}

/**
 * Restarts a press may take. Each one has struck at least one candidate off one cell, so a press
 * ends long before this; the cap is a guard against a trick that widened something, which none
 * may.
 */
const MOST_RESTARTS = 1000;

/**
 * Explain the board. The tricks run a grade at a time, lowest first, on a pencil that starts
 * blank; the first grade that concludes a cell is the answer. A grade that only narrows the
 * pencil sends the press back to grade 0 on the narrower pencil, so the cheapest trick that can
 * now conclude is the one that does, and the press's grade records the dearest step it took.
 * This is one pass of the graded player, whose pencil persists between passes, with the pencil
 * work of the press kept as `steps` instead.
 */
export function explain(game: Game, options: TutorOptions = {}): Explanation {
  const steps: Lesson[] = [];
  let grade: Grade | null = null;
  if (game.status !== 'playing') return { grade, lessons: [], steps };
  const peek = options.peek ?? false;
  const all = everyTier(game.config.tiers);
  const domains = new Map<Cell, number>();
  const domain = (cell: Cell): number => domains.get(cell) ?? all;
  const scaffold = dungeonScaffold(game);
  const proven = new Set<Cell>();

  for (let restart = 0; restart < MOST_RESTARTS; restart++) {
    let narrowedAny = false;
    for (const g of GRADES) {
      const reading = readBoard(game, peek, { trustMarks: false, trusted: proven });
      const view: View = { game, reading, level: game.level, peek, domain, scaffold };
      const concluding: Lesson[] = [];
      let narrowed = 0;
      for (const id of TRICK_IDS) {
        if (TRICKS[id].grade !== g) continue;
        const found = noMoves();
        TRICKS[id].apply(view, found);
        const before = new Map<Cell, number>();
        for (const [cell, mask] of found.narrow) {
          const was = domain(cell);
          const now = was & mask;
          if (now === was || now === 0) continue;
          before.set(cell, was);
          domains.set(cell, now);
          narrowed++;
        }
        // A name goes into the pencil too, and a name that agrees with the player's own mark
        // makes that mark believed from here on: proven, not trusted.
        for (const [cell, tier] of found.mark) {
          const was = domain(cell);
          const now = was & noteBit(tier);
          if (now !== 0 && now !== was) {
            domains.set(cell, now);
            narrowed++;
          }
          if (cell.mark === tier && !proven.has(cell)) {
            proven.add(cell);
            narrowed++;
          }
        }
        for (const lesson of gather(id, found, view, before)) {
          (lesson.open.length || lesson.mark.length ? concluding : steps).push(lesson);
        }
      }
      if (concluding.length || narrowed) grade = Math.max(grade ?? 0, g) as Grade;
      if (concluding.length) return { grade, lessons: nearest(concluding, options.near), steps };
      if (narrowed) {
        narrowedAny = true;
        break;
      }
    }
    if (!narrowedAny) break;
  }
  return { grade, lessons: [], steps };
}

/** A trick's moves as lessons: one per distinct proof, with everything that proof concluded. */
function gather(
  id: TrickId,
  found: Moves,
  view: View,
  before: ReadonlyMap<Cell, number>,
): Lesson[] {
  interface Draft {
    why: Why;
    open: Cell[];
    mark: Array<readonly [Cell, number]>;
    narrow: Array<readonly [Cell, number]>;
    struck: number;
  }
  const drafts = new Map<string, Draft>();
  const draft = (cell: Cell): Draft | null => {
    const why = found.because.get(cell);
    if (!why) return null;
    const key = [
      ...why.constraints.map((c) => `${c.cell.x},${c.cell.y}`).sort(),
      '|',
      ...why.cells.map((c) => `${c.x},${c.y}`).sort(),
    ].join(';');
    let d = drafts.get(key);
    if (!d) {
      d = { why, open: [], mark: [], narrow: [], struck: 0 };
      drafts.set(key, d);
    }
    return d;
  };
  const { game, level } = view;
  for (const cell of found.open) {
    if (cell.open || !game.inReach(cell)) continue;
    const d = draft(cell);
    if (!d) continue;
    d.open.push(cell);
    d.struck |= view.domain(cell) & ~tiersUpTo(level);
  }
  for (const [cell, tier] of found.mark) {
    // A name the player's own mark already gives is nothing to teach.
    if (cell.open || found.open.has(cell) || cell.mark === tier) continue;
    const d = draft(cell);
    if (!d) continue;
    d.mark.push([cell, tier]);
    d.struck |= view.domain(cell) & ~noteBit(tier);
  }
  for (const [cell, was] of before) {
    if (found.open.has(cell) || found.mark.has(cell)) continue;
    const d = draft(cell);
    if (!d) continue;
    const now = view.domain(cell);
    d.narrow.push([cell, now]);
    d.struck |= was & ~now;
  }
  const grade = TRICKS[id].grade;
  return [...drafts.values()]
    .filter((d) => d.open.length + d.mark.length + d.narrow.length > 0)
    .map((d) => ({ trick: id, grade, ...d, caption: caption(id, d, view) }));
}

/** Lessons ordered by how near their cells are to where the player last acted. */
function nearest(lessons: Lesson[], near: Cell | null | undefined): Lesson[] {
  if (!near) return lessons;
  const distance = (l: Lesson): number => {
    let best = Infinity;
    for (const c of [...l.open, ...l.mark.map(([c]) => c), ...l.narrow.map(([c]) => c)]) {
      best = Math.min(best, Math.max(Math.abs(c.x - near.x), Math.abs(c.y - near.y)));
    }
    return best;
  };
  return lessons
    .map((l, i) => ({ l, i, d: distance(l) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.l);
}

// ------------------------------------------------------------------ captions

/** "2 or 5", or "empty" for the ground candidate alone. */
function list(mask: number): string {
  const tiers: string[] = [];
  for (let t = 0; t < 31; t++) if (mask & (1 << t)) tiers.push(t === 0 ? 'empty' : `${t}`);
  if (tiers.length <= 1) return tiers[0] ?? '';
  return `${tiers.slice(0, -1).join(', ')} or ${tiers[tiers.length - 1]}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "the 7", or "the 7 (4 hidden)" where some of it is on show. */
function the(c: Constraint): string {
  const n = c.cell.num;
  return c.residual === n ? `the ${n}` : `the ${n} (${c.residual} hidden)`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "all 5 covered cells are", "its one covered cell is"; or the count alone. */
function cells(c: Constraint, verb = true): string {
  const k = c.unknown.length;
  if (!verb) return plural(k, 'covered cell');
  return k === 1 ? 'its one covered cell is' : `all ${k} covered cells are`;
}

/** What a caption is written from. */
interface Told {
  readonly why: Why;
  readonly open: readonly Cell[];
  readonly struck: number;
}

type Captioner = (told: Told, view: View) => string;

/** The first number a proof read; every writer below that uses it is a trick that reads one. */
const first = (told: Told): Constraint => told.why.constraints[0]!;
const second = (told: Told): Constraint => told.why.constraints[1]!;

/** One writer per trick: the proof in a sentence, with its numbers filled in. */
const CAPTIONS: Readonly<Record<TrickId, Captioner>> = {
  'raw-ring': (t, v) => {
    const a = first(t);
    return (
      `The ${a.cell.num} is at or below your level ${v.level}, so nothing under it is stronger ` +
      `than a ${a.cell.num}: ${cells(a)} safe.`
    );
  },
  'named-kill': (t, v) =>
    `Your mark of ${t.why.cells[0]!.mark} is at or below your level ${v.level}: a free kill.`,
  'met-partner': () =>
    'Every creature has exactly one partner, and these have met theirs, so the ground beside ' +
    'them is empty.',
  corridor: () => TRICK_TEXT.corridor.rule,
  sprinkles: (t) =>
    t.open.length
      ? 'A covered cell with no sprinkle is empty ground, free at any level.'
      : 'A cell under a sprinkle is a creature, never empty ground.',
  'residual-ring': (t, v) => {
    const a = first(t);
    const n = a.cell.num;
    if (a.residual === 0) return `The ${n} has all of it on show, so ${cells(a)} empty ground.`;
    return (
      `The ${n} has ${n - a.residual} on show around it, so ${a.residual} is hidden over ` +
      `${cells(a, false)}: at or below your level ${v.level}, so all of them are safe.`
    );
  },
  'last-cell': (t, v) => {
    const a = first(t);
    const n = a.cell.num;
    const r = a.residual;
    const show = n === r ? '' : ` and ${n - r} on show`;
    const then =
      r <= v.level
        ? 'A free kill at your level.'
        : `Mark it and come back at level ${r}; the mark locks the cell until then.`;
    return `The ${n} has one covered neighbour left${show}, so that cell is a ${r}. ${then}`;
  },
  'census-ring': (t, v) => {
    const a = first(t);
    const k = a.creatures ?? 0;
    if (k === 0)
      return `No creatures are hidden around the ${a.cell.num}, so ${cells(a)} empty ground.`;
    return (
      `${plural(k, 'creature')} share the ${a.residual} hidden around the ${a.cell.num}. Each is ` +
      `at least 1, so none is above ${a.residual - k + 1}: at or below your level ${v.level}.`
    );
  },
  counters: (t, v) =>
    v.reading.top <= v.level
      ? `The counters show nothing left above tier ${v.reading.top}, at or below your level ` +
        `${v.level}: every covered cell is free.`
      : `The counters show no ${list(t.struck & ~1)}s left, so this cannot be one.`,
  'lone-dark': (t) => {
    const a = first(t);
    return (
      `Only one dark square is left around ${the(a)}, and the ${a.residual} hidden is even; a ` +
      'dark square carries odd tiers only, so it holds nothing.'
    );
  },
  'partner-number': () =>
    "A beaten creature's number is its partner's tier, since nothing else it touches is a " +
    'creature: the cell beside this one is that partner, or empty ground.',
  subtract: (t) => {
    const a = first(t);
    const b = second(t);
    return (
      `${cap(the(a))}'s covered cells all lie inside ${the(b)}'s, so the cells only ${the(b)} ` +
      `sees hold exactly ${b.residual - a.residual}.`
    );
  },
  overlap: (t) =>
    `${cap(the(first(t)))} and ${the(second(t))} share some covered cells but not all; what ` +
    'each sees alone is bounded by the other, which decides these cells.',
  bounds: (t, v) => {
    const a = first(t);
    const k = a.unknown.length;
    const floor = a.residual - (k - 1) * v.reading.top;
    const so =
      floor > 0
        ? `each holds at least ${floor}, so all of them are creatures`
        : 'only some tiers can share it that way';
    return `${cap(the(a))} spreads ${a.residual} over ${plural(k, 'cell')}: ${so}.`;
  },
  'colour-cap': (t) =>
    'Light squares carry even tiers and dark squares odd, so the colour caps what can hide ' +
    `under ${the(first(t))} on each square.`,
  'pack-gap': () =>
    'A pack is one creature of every tier. Beside this pack a cell holds a tier it has not ' +
    'shown yet, or nothing.',
  'what-if': (t) =>
    `Suppose this cell were ${list(t.struck)}: the ${plural(t.why.constraints.length, 'number')} ` +
    'around it could not all be made. So it is not.',
  'line-reach': () => TRICK_TEXT['line-reach'].rule,
  accounted: (t, v) => {
    const acc = t.why.constraints.reduce((s, c) => s + c.residual, 0);
    const total = v.reading.totalHiding;
    return (
      `${plural(t.why.constraints.length, 'number')} whose rings do not overlap account for ` +
      `${acc} of the ${total} tier still hidden; ${total - acc} is left for every other covered cell.`
    );
  },
  'last-of-tier': (t, v) => {
    const tier = highestTier(t.struck);
    const rings = plural(t.why.constraints.length, 'ring');
    return (
      `The last ${plural(v.reading.hiding[tier] ?? 1, `tier ${tier}`)} must be inside ${rings} ` +
      `that cannot be made without one, so no other cell holds a ${tier}.`
    );
  },
};

function caption(id: TrickId, told: Told, view: View): string {
  return CAPTIONS[id](told, view);
}
