/**
 * The tutor on the game screen (docs/teaching-plan.md, Part 1): what the last press of `H` found,
 * which of its lessons is showing, what the hint line says about it, and how many times it has
 * been asked, on this board and over this run. The reading itself is `src/sim/tutor.ts`; this is
 * the face. It never touches the game.
 */

import type { Game } from '../../engine/game.js';
import type { Cell } from '../../engine/types.js';
import { TRICK_TEXT } from '../../sim/tricktext.js';
import type { TrickId } from '../../sim/tricks.js';
import { tiersUpTo } from '../../sim/reader.js';
import { type Advice, type Explanation, type Lesson, explain } from '../../sim/tutor.js';

export class Tutor {
  /** The last press: what it found, and which lesson is showing. Null once the board has moved. */
  private last: { explanation: Explanation; index: number } | null = null;
  private advicePointer: Lesson | null = null;
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
  press(game: Game, near: Cell | null): void {
    if (game.status !== 'playing') return;
    if (this.last && this.lessons().length > 1) this.last.index++;
    else {
      this.advicePointer = null;
      this.last = { explanation: explain(game, { near }), index: 0 };
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
    return [...lessons, ...steps, ...(advice?.cell ? [this.pointer(advice)] : [])];
  }

  /** The advice as something the board can point at: its cell, ringed dashed, with its ceiling. */
  private pointer(advice: Advice): Lesson {
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

  /** The lesson to point at on the board, or null. */
  shown(): Lesson | null {
    const all = this.lessons();
    if (!this.last || !all.length) return null;
    return all[this.last.index % all.length] ?? null;
  }

  /** What the hint line says while the tutor is showing something, or null when it is not. */
  text(): string | null {
    if (!this.last) return null;
    const lesson = this.shown();
    const { advice } = this.last.explanation;
    // The board is at a guess: the catalogue's rules of guessing well, applied to it.
    if (!lesson) return advice?.text ?? 'Nothing more can be proven from what is open.';
    if (lesson === this.advicePointer) return `At a guess. ${lesson.caption}`;
    const all = this.lessons();
    const pencil = lesson.open.length + lesson.mark.length === 0 ? ' (pencil work)' : '';
    const which =
      all.length > 1
        ? ` — ${(this.last.index % all.length) + 1} of ${all.length}, H for the next`
        : '';
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
