/**
 * The tutor on the game screen (docs/teaching-plan.md, Part 1): what the last press of `H` found,
 * which of its lessons is showing, what the hint line says about it, and how many times it has
 * been asked, on this board and over this run. The reading itself is `src/sim/tutor.ts`; this is
 * the face. It never touches the game.
 */

import type { Game } from '../../engine/game.js';
import type { Cell } from '../../engine/types.js';
import { TRICK_TEXT } from '../../sim/tricktext.js';
import { GRADES, type Grade, type TrickId } from '../../sim/tricks.js';
import { tiersUpTo } from '../../sim/reader.js';
import { type Advice, type Explanation, type Lesson, explain } from '../../sim/tutor.js';
import type { TutorStyle } from '../presentation.js';

/** The two settings a press reads: how much the tutor says, and the dearest grade it tries. */
export interface TutorSettings {
  readonly tutorStyle: TutorStyle;
  readonly tutorGrade: number;
}

const EVERY_GRADE: Grade = GRADES[GRADES.length - 1]!;

/** A saved grade as one the tricks have: whole, and within them. */
const gradeOf = (n: number): Grade => Math.max(0, Math.min(EVERY_GRADE, Math.round(n))) as Grade;

export class Tutor {
  /** The last press: what it found, and which lesson is showing. Null once the board has moved. */
  private last: { explanation: Explanation; index: number } | null = null;
  private advicePointer: Lesson | null = null;
  /** How the last press was asked: what to say, and how far up the grades to look. */
  private style: TutorStyle = 'full';
  private most: Grade = EVERY_GRADE;
  /** Times the tutor was asked on this board, and over this run. A hinted clear sets no best time. */
  hints = 0;
  runHints = 0;

  /** A new board: the lesson and the board's count go; the run's count stays. */
  resetBoard(): void {
    this.dismiss();
    this.hints = 0;
  }

  resetRun(): void {
    this.runHints = 0;
  }

  /** Any action on the board dismisses the lesson: the board it was read from is gone. */
  dismiss(): void {
    this.last = null;
    this.advicePointer = null;
  }

  /**
   * A press. The first reads the board and shows the lesson nearest `near`; each press after
   * shows the next, the proofs that conclude a cell first and the pencil work after, round and
   * round. Every press is a hint. It opens nothing.
   */
  press(
    game: Game,
    near: Cell | null,
    settings: TutorSettings = { tutorStyle: 'full', tutorGrade: EVERY_GRADE },
  ): void {
    if (game.status !== 'playing') return;
    this.style = settings.tutorStyle;
    this.most = gradeOf(settings.tutorGrade);
    if (this.last && this.lessons().length > 1) this.last.index++;
    else {
      this.advicePointer = null;
      this.last = { explanation: explain(game, { near, most: this.most }), index: 0 };
    }
    this.hints++;
    this.runHints++;
  }

  /**
   * Every lesson of the last press: the ones that conclude a cell, the pencil work, and last,
   * when nothing concluded, the advice at a guess pointed at the cell it weighed.
   */
  private lessons(): readonly Lesson[] {
    if (!this.last) return [];
    const { lessons, steps, advice } = this.last.explanation;
    // Under a cap, nothing found is not a guess: the dearer grades were never tried, so the
    // advice at a guess is not offered.
    const guess = advice?.cell && this.most === EVERY_GRADE ? [this.adviceLesson(advice)] : [];
    return [...lessons, ...steps, ...guess];
  }

  /** The advice as something the board can point at: its cell, ringed dashed, with its ceiling. */
  private adviceLesson(advice: Advice): Lesson {
    this.advicePointer ??= {
      trick: 'bounds',
      grade: 2,
      why: { constraints: advice.constraints, cells: [] },
      open: [],
      mark: [],
      narrow: [[advice.cell!, tiersUpTo(advice.ceiling)]],
      struck: 0,
      caption: advice.text,
    };
    return this.advicePointer;
  }

  /**
   * What the tutor is showing, as a place in the field guide: the trick of the lesson showing, or
   * `guess` when the board is at a guess; null when it is showing nothing.
   */
  topic(): TrickId | 'guess' | null {
    if (!this.last) return null;
    const lesson = this.shown();
    return !lesson || lesson === this.advicePointer ? 'guess' : lesson.trick;
  }

  /** The lesson showing, or null. */
  shown(): Lesson | null {
    const all = this.lessons();
    if (!this.last || !all.length) return null;
    return all[this.last.index % all.length] ?? null;
  }

  /**
   * The lesson to point at on the board: the one showing, or, when the tutor is asked only where
   * to look, the numbers and cells it read with nothing it concluded, so the conclusion is the
   * player's to draw.
   */
  pointer(): Lesson | null {
    const lesson = this.shown();
    if (!lesson || this.style === 'full' || lesson === this.advicePointer) return lesson;
    return { ...lesson, open: [], mark: [], narrow: [] };
  }

  /** "the 7 and the beaten 3": the numbers a lesson read, for saying where to look. */
  private lookAt(lesson: Lesson): string {
    const seen = lesson.why.constraints.map((c) =>
      c.cell.tier > 0 ? `the beaten ${c.cell.tier}` : `the ${c.cell.num}`,
    );
    if (lesson.why.cells.length) seen.push('the cells ringed');
    if (!seen.length) return 'the board’s own rule';
    return seen.length === 1 ? seen[0]! : `${seen.slice(0, -1).join(', ')} and ${seen.at(-1)}`;
  }

  /** What the hint line says while the tutor is showing something, or null when it is not. */
  text(): string | null {
    if (!this.last) return null;
    const lesson = this.shown();
    const { advice } = this.last.explanation;
    // Nothing found under a grade the player capped the tutor at is not a guess: the dearer
    // grades were never tried.
    if (!lesson && this.most < EVERY_GRADE) {
      return `Nothing up to grade ${this.most} proves a move here. The tutor’s grade is set in Settings.`;
    }
    // The board is at a guess: the catalogue's rules of guessing well, applied to it.
    if (!lesson) return advice?.text ?? 'Nothing more can be proven from what is open.';
    if (lesson === this.advicePointer) return `At a guess. ${lesson.caption}`;
    const all = this.lessons();
    const pencil = lesson.open.length + lesson.mark.length === 0 ? ' (pencil work)' : '';
    const which =
      all.length > 1
        ? ` — ${(this.last.index % all.length) + 1} of ${all.length}, H for the next`
        : '';
    if (this.style === 'where') {
      return `Grade ${lesson.grade} · ${TRICK_TEXT[lesson.trick].name}: look at ${this.lookAt(lesson)}.${which}`;
    }
    // A name that disagrees with the player's own mark says so: the mark is theirs to change.
    const disagreed = lesson.mark
      .filter(([cell, tier]) => cell.mark > 0 && cell.mark !== tier)
      .map(([cell, tier]) => ` You marked it ${cell.mark}; it is a ${tier}.`)
      .join('');
    return (
      `Grade ${lesson.grade} · ${TRICK_TEXT[lesson.trick].name}${pencil}. ` +
      `${lesson.caption}${disagreed}${which}`
    );
  }
}
