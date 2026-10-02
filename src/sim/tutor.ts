/**
 * The tutor: the next provable move on the board as it stands, and why (docs/teaching-plan.md,
 * Part 1). One press is one pass of the graded player with a fresh pencil: the tricks are run a
 * grade at a time, lowest first, and the first grade that concludes a cell is the answer, each
 * of its proofs a `Lesson` with the cells it concluded and a caption (`captions.ts`).
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
import { expForTier } from '../engine/combat.js';
import { noteBit } from '../engine/notes.js';
import { fightCostFor } from '../engine/settings.js';
import { caption } from './captions.js';
import { type Constraint, type Reading, everyTier, readBoard, tiersUpTo } from './reader.js';
import { dungeonScaffold } from './scaffold.js';
import {
  GRADES,
  type Grade,
  type Moves,
  TRICKS,
  TRICKS_BY_GRADE,
  type TrickId,
  type View,
  type Why,
  runTrick,
} from './tricks.js';

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

/** What a press of the tutor may read, where it looks first, and how dear a trick it tries. */
export interface TutorOptions {
  /** Read a beaten creature's number even where the game hides it. */
  peek?: boolean;
  /** Where the player last acted; lessons nearest it come first. */
  near?: Cell | null;
  /** The dearest grade to try; every grade when left out. */
  most?: Grade;
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
  /** What to weigh at a guess, when nothing concludes a cell; null while something does. */
  readonly advice: Advice | null;
}

/**
 * The board at a guess, said in the catalogue's terms (docs/strategies.md, section 8): the cell
 * whose worst case is lowest, what that worst case is and costs, and how far the next level is
 * against the free kills still on the board. Facts about the rules; it names no cell to guess.
 */
export interface Advice {
  /** The covered cell with the lowest ceiling among those a number touches; null when none is. */
  readonly cell: Cell | null;
  /** The numbers that cap it. */
  readonly constraints: readonly Constraint[];
  /** The most the cell can hold. */
  readonly ceiling: number;
  readonly text: string;
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
  if (game.status !== 'playing') return { grade, lessons: [], steps, advice: null };
  const peek = options.peek ?? false;
  const pencil = new Pencil(game);

  for (let restart = 0; restart < MOST_RESTARTS; restart++) {
    let narrowedAny = false;
    for (const g of GRADES) {
      if (options.most !== undefined && g > options.most) break;
      const view = pencil.view(peek);
      const concluding: Lesson[] = [];
      let narrowed = 0;
      for (const id of TRICKS_BY_GRADE[g]) {
        const found = runTrick(id, view);
        const { before, changed } = pencil.absorb(found);
        narrowed += changed;
        for (const lesson of gather(id, found, view, before)) {
          (lesson.open.length || lesson.mark.length ? concluding : steps).push(lesson);
        }
      }
      if (concluding.length || narrowed) grade = Math.max(grade ?? 0, g) as Grade;
      if (concluding.length) {
        return { grade, lessons: nearest(concluding, options.near), steps, advice: null };
      }
      if (narrowed) {
        narrowedAny = true;
        break;
      }
    }
    if (!narrowedAny) break;
  }
  return { grade, lessons: [], steps, advice: advise(game, pencil.view(peek).reading) };
}

/** What the tricks up to some grade prove on the board as it stands, without a move being made. */
export interface Provable {
  /** Covered cells safe to open at the current level. */
  readonly open: ReadonlySet<Cell>;
  /** Covered cells named exactly, above the level. */
  readonly mark: ReadonlyMap<Cell, number>;
  /** Covered cells neither safe nor named whose candidates were narrowed, and what to. */
  readonly narrow: ReadonlyMap<Cell, number>;
  /** Every proof made on the way, as the tutor would teach it, in the order it was made. */
  readonly proofs: readonly Lesson[];
}

/**
 * Everything the tricks up to `most` can prove on the board as it stands, pencil work and all, as
 * `explain` reads it (trusting no mark it has not proven) but carrying on past the first grade that
 * concludes: what a player of that grade could open or name here without a guess and without
 * opening anything first. The school refuses a click on any cell not in `open`
 * (docs/teaching-plan.md, section 5.3) and holds its lessons to it. It never acts.
 */
export function provable(game: Game, most: Grade = 4): Provable {
  const open = new Set<Cell>();
  const mark = new Map<Cell, number>();
  const narrow = new Map<Cell, number>();
  const proofs: Lesson[] = [];
  if (game.status !== 'playing') return { open, mark, narrow, proofs };
  const pencil = new Pencil(game);
  const safe = tiersUpTo(game.level);
  for (let restart = 0; restart < MOST_RESTARTS; restart++) {
    let changed = 0;
    for (const g of GRADES) {
      if (g > most) break;
      const view = pencil.view(false);
      for (const id of TRICKS_BY_GRADE[g]) {
        const found = runTrick(id, view);
        const { before, changed: moved } = pencil.absorb(found);
        changed += moved;
        for (const cell of before.keys()) narrow.set(cell, pencil.domain(cell));
        proofs.push(...gather(id, found, view, before));
        for (const [cell, tier] of found.mark) if (!cell.open) mark.set(cell, tier);
        for (const cell of found.open) {
          if (cell.open || !game.inReach(cell) || open.has(cell)) continue;
          open.add(cell);
          mark.delete(cell);
          pencil.narrow(cell, safe);
          changed++;
        }
      }
      // The cheapest grade that moved anything is followed by a fresh look from grade 0.
      if (changed) break;
    }
    if (!changed) break;
  }
  for (const cell of [...open, ...mark.keys()]) narrow.delete(cell);
  return { open, mark, narrow, proofs };
}

/**
 * Proofs of one trick as one lesson, for pointing at them together: every number and cell they
 * read, what a cell was narrowed to last unless one of them concluded it, and each caption once,
 * in the reading order of the first number each read. Null for no proofs.
 */
export function merge(proofs: readonly Lesson[], width: number): Lesson | null {
  const first = (l: Lesson): number =>
    Math.min(Infinity, ...l.why.constraints.map((c) => c.cell.y * width + c.cell.x));
  const sorted = [...proofs].sort((a, b) => first(a) - first(b));
  const head = sorted[0];
  if (!head) return null;
  const open = new Set<Cell>();
  const mark = new Map<Cell, number>();
  const narrow = new Map<Cell, number>();
  for (const l of sorted) {
    for (const c of l.open) open.add(c);
    for (const [c, tier] of l.mark) mark.set(c, tier);
    for (const [c, mask] of l.narrow) narrow.set(c, mask);
  }
  for (const c of [...open, ...mark.keys()]) narrow.delete(c);
  const once = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
  return {
    trick: head.trick,
    grade: head.grade,
    why: {
      constraints: once(sorted.flatMap((l) => l.why.constraints)),
      cells: once(sorted.flatMap((l) => l.why.cells)),
    },
    open: [...open],
    mark: [...mark],
    narrow: [...narrow],
    struck: sorted.reduce((m, l) => m | l.struck, 0),
    caption: once(sorted.map((l) => l.caption)).join(' '),
  };
}

/**
 * A press's pencil: a candidate set for every covered cell, full to start with and only ever
 * narrowed, and the player's marks the press has proven, which are believed from then on.
 */
class Pencil {
  private readonly domains = new Map<Cell, number>();
  private readonly proven = new Set<Cell>();
  private readonly all: number;
  private readonly scaffold: ReadonlySet<Cell>;

  constructor(private readonly game: Game) {
    this.all = everyTier(game.config.tiers);
    this.scaffold = dungeonScaffold(game);
  }

  readonly domain = (cell: Cell): number => this.domains.get(cell) ?? this.all;

  /** The board as the press sees it now: every mark unknown but those it has proven. */
  view(peek: boolean): View {
    const reading = readBoard(this.game, peek, { trustMarks: false, trusted: this.proven });
    const { game, domain, scaffold } = this;
    return { game, reading, level: game.level, peek, domain, scaffold };
  }

  /** Narrow a cell to `mask`; what it held before, or null when that changed nothing. */
  narrow(cell: Cell, mask: number): number | null {
    const was = this.domain(cell);
    const now = was & mask;
    if (now === was || now === 0) return null;
    this.domains.set(cell, now);
    return was;
  }

  /**
   * Take in what a trick found: its narrowings, and its names, which go into the pencil too. A
   * name that agrees with the player's own mark makes that mark believed from here on: proven,
   * not trusted. Returns what each narrowed cell held before, and how much changed.
   */
  absorb(found: Moves): { before: Map<Cell, number>; changed: number } {
    const before = new Map<Cell, number>();
    let changed = 0;
    for (const [cell, mask] of found.narrow) {
      const was = this.narrow(cell, mask);
      if (was === null) continue;
      before.set(cell, was);
      changed++;
    }
    for (const [cell, tier] of found.mark) {
      if (this.narrow(cell, noteBit(tier)) !== null) changed++;
      if (cell.mark === tier && !this.proven.has(cell)) {
        this.proven.add(cell);
        changed++;
      }
    }
    return { before, changed };
  }
}

/** The catalogue's rules of guessing well, applied to this board: the worst case, and the levels. */
function advise(game: Game, reading: Reading): Advice {
  const { level, hp } = game;
  let cell: Cell | null = null;
  let ceiling = Infinity;
  let constraints: readonly Constraint[] = [];
  for (const [c, touching] of reading.touching) {
    if (c.mark > 0 || !game.inReach(c)) continue;
    const cap = Math.min(reading.top, ...touching.map((k) => k.residual));
    // The lowest ceiling, and among equals the cell more numbers see, which says more when opened.
    if (cap < ceiling || (cap === ceiling && touching.length > constraints.length)) {
      cell = c;
      ceiling = cap;
      constraints = touching;
    }
  }
  const toNext = game.progression.toNext();
  let free = 0;
  for (let t = 1; t <= Math.min(level, game.config.tiers); t++) {
    free += game.counterFor(t) * expForTier(t);
  }
  const levels =
    level >= game.config.tiers
      ? ''
      : free >= toNext
        ? ` Level ${level + 1} is ${toNext} EXP away and the free kills on the board pay ${free}: ` +
          'level up first.'
        : ` Level ${level + 1} is ${toNext} EXP away; the free kills on the board pay ${free}.`;
  if (!cell) {
    const average = reading.unknown.length ? reading.totalHiding / reading.unknown.length : 0;
    return {
      cell,
      constraints,
      ceiling,
      text:
        'Nothing more can be proven, and no number touches a covered cell. A cell is worth the ' +
        `board's average: ${reading.totalHiding} tier over ${reading.unknown.length} cells, ` +
        `${average.toFixed(1)} each.${levels}`,
    };
  }
  // Priced as the fight would be, through the creature-damage dial and capped by death, so the
  // number and the kill warning are the ones the player would meet.
  const cost = ceiling <= level ? 0 : fightCostFor(level, hp, ceiling, game.settings);
  const worst =
    level <= 0
      ? `a tier ${ceiling}, and on this board every creature ends it`
      : cost <= 0
        ? `a tier ${ceiling}, free at your level`
        : `a tier ${ceiling}, costing ${cost} of your ${hp} HP` +
          (cost >= hp ? ', which would kill you' : '');
  return {
    cell,
    constraints,
    ceiling,
    text:
      'Nothing more can be proven. The lowest worst case among the cells a number touches is ' +
      `${worst}.${levels}`,
  };
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
