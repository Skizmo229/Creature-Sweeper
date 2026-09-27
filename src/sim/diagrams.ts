/**
 * The catalogue's diagrams as boards (docs/strategies.md): what each draws, what is under it, the
 * level its text reads it at, and what the trick it sits under concludes there.
 * `test/strategies.test.ts` holds every diagram in the catalogue to one of these, token for token,
 * and each to its trick; the field guide draws them (docs/teaching-plan.md, section 6).
 *
 * A diagram is a patch of a five-tier board, as the catalogue's legend says: nothing beyond the
 * patch touches its numbers, and the rest of the board holds the creatures that set the level and
 * the counters. The rest has to exist, because on a drawn board every threshold is `C_k` and the
 * level is at least the weakest tier alive. `diagramGame` builds the whole: the patch, a column of
 * holes, and the rest beside it, covered.
 */

import { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { type Grade, TRICKS, type TrickId } from './tricks.js';
import { type Lesson, explain } from './tutor.js';

/** The catalogue's boards have five tiers. */
const TIERS = 5;

/**
 * The rest of the board where a diagram does not say, by tier from 1: a creature of every tier,
 * and enough weak ones to hold every diagram at the level its text gives.
 */
const REST: readonly number[] = [4, 2, 1, 1, 1];

export interface Diagram {
  /** The trick it illustrates: the catalogue's bold heading above it. */
  readonly trick: TrickId;
  /** What the player sees, as the catalogue draws it (`readLayout`'s notation). */
  readonly shown: readonly string[];
  /** What is there. */
  readonly truth: readonly string[];
  /** The player's level, as the text gives it. */
  readonly level: number;
  /** Creatures of each tier on the rest of the board, index 0 tier 1; `REST` when absent. */
  readonly rest?: readonly number[];
  /**
   * What the trick concludes on the patch, a token per cell: `-` nothing, `o` safe to open, a tier
   * named, or the candidates it narrows to, as `4/5`.
   */
  readonly taught: readonly string[];
  /** What it concludes on every covered cell of the rest of the board, in the same tokens. */
  readonly taughtRest?: string;
}

export const DIAGRAMS: readonly Diagram[] = [
  {
    trick: 'raw-ring',
    shown: ['? ? ?', '? 2 1', '? 1 .'],
    truth: ['. . 1', '. . .', '1 . .'],
    level: 2,
    taught: ['o o o', 'o - -', 'o - -'],
  },
  {
    trick: 'residual-ring',
    shown: ['? ?', '5 5', 'k3 3'],
    truth: ['1 1', '. .', '3 .'],
    level: 2,
    taught: ['o o', '- -', '- -'],
  },
  {
    trick: 'last-cell',
    shown: ['. 4 4', '. 4 ?', '. 4 4'],
    truth: ['. . .', '. . 4', '. . .'],
    level: 1,
    taught: ['- - -', '- - 4', '- - -'],
  },
  {
    trick: 'subtract',
    shown: ['? ? ? ?', '2 5 3 3', '. . . .'],
    truth: ['2 . 3 .', '. . . .', '. . . .'],
    level: 1,
    taught: ['- o 3 -', '- - - -', '- - - -'],
  },
  {
    trick: 'bounds',
    shown: ['? ?', '9 9', '. .'],
    truth: ['4 5', '. .', '. .'],
    level: 2,
    taught: ['4/5 4/5', '- -', '- -'],
  },
  {
    // Only 2s and 5s left: the counters leave gaps, and the sum falls through them.
    trick: 'bounds',
    shown: ['9 ?', '? ?'],
    truth: ['. 2', '5 2'],
    level: 2,
    rest: [0, 3, 0, 0, 2],
    taught: ['- 2/5', '2/5 2/5'],
  },
  {
    trick: 'what-if',
    shown: ['3 ? 3', '? ? ?', '? 3 ?'],
    truth: ['. . .', '. 3 .', '. . .'],
    level: 2,
    taught: ['- - -', 'o - o', '- - -'],
  },
  {
    // One 5 left, and it is in the pair; every other covered cell is on the rest of the board.
    trick: 'last-of-tier',
    shown: ['? ?', '9 9'],
    truth: ['4 5', '. .'],
    level: 4,
    rest: [4, 2, 1, 2, 0],
    taught: ['- -', '- -'],
    taughtRest: 'o',
  },
];

/** Build a diagram's board: the patch, a column of holes, and the rest of the board, covered. */
export function diagramGame(d: Diagram): Game {
  const height = d.shown.length;
  const pool = (d.rest ?? REST).flatMap((n, i) => new Array<number>(n).fill(i + 1));
  const width = Math.max(1, Math.ceil(pool.length / height));
  const truth = d.truth.map((row) => `${row} #`);
  const shown = d.shown.map((row) => `${row} #`);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      truth[y] += ` ${pool[x * height + y] ?? '.'}`;
      shown[y] += ' ?';
    }
  }
  return Game.fromLayout(truth, shown, { startLevel: d.level, tiers: TIERS });
}

/**
 * The patch alone, as the catalogue draws it: for drawing, not for reading. Its cells stand where
 * the diagram board's do, so a lesson read from `diagramGame` draws on it in place; its level and
 * counters are the patch's own, so nothing should be worked out from it.
 */
export function diagramPicture(d: Diagram): Game {
  return Game.fromLayout(d.truth, d.shown, { tiers: TIERS });
}

/** One press of the tutor on a diagram's board, and what the diagram's trick taught in it. */
export interface DiagramPress {
  readonly game: Game;
  /** The press's grade, which is the trick's when the diagram is right. */
  readonly grade: Grade | null;
  /**
   * Every proof of the diagram's trick in the press, pencil work included, as one lesson: what a
   * cell was narrowed to last, unless the trick also concluded it, and each proof's caption in the
   * reading order of the numbers it read. Null when the trick taught nothing there.
   */
  readonly lesson: Lesson | null;
}

/** Press the tutor on a diagram's board, and gather what its trick taught. */
export function pressDiagram(d: Diagram): DiagramPress {
  const game = diagramGame(d);
  const press = explain(game);
  const first = (l: Lesson): number =>
    Math.min(Infinity, ...l.why.constraints.map((c) => c.cell.y * game.config.width + c.cell.x));
  const proofs = [...press.lessons, ...press.steps]
    .filter((l) => l.trick === d.trick)
    .sort((a, b) => first(a) - first(b));
  if (!proofs.length) return { game, grade: press.grade, lesson: null };
  const open = new Set<Cell>();
  const mark = new Map<Cell, number>();
  const narrow = new Map<Cell, number>();
  for (const l of proofs) {
    for (const c of l.open) open.add(c);
    for (const [c, tier] of l.mark) mark.set(c, tier);
    for (const [c, mask] of l.narrow) narrow.set(c, mask);
  }
  for (const c of [...open, ...mark.keys()]) narrow.delete(c);
  const once = <T>(xs: readonly T[]): T[] => [...new Set(xs)];
  const lesson: Lesson = {
    trick: d.trick,
    grade: TRICKS[d.trick].grade,
    why: {
      constraints: once(proofs.flatMap((l) => l.why.constraints)),
      cells: once(proofs.flatMap((l) => l.why.cells)),
    },
    open: [...open],
    mark: [...mark],
    narrow: [...narrow],
    struck: proofs.reduce((m, l) => m | l.struck, 0),
    caption: once(proofs.map((l) => l.caption)).join(' '),
  };
  return { game, grade: press.grade, lesson };
}
