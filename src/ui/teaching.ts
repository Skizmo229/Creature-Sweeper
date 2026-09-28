/**
 * The teaching on the app (docs/teaching-plan.md): the tutor on the board being played, the rules
 * card, the field guide, opened at the trick the tutor is showing or led by a ladder's own notes,
 * and the school's lesson being taken. App keeps the screens and routes the keys and buttons here.
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import type { Lesson } from '../sim/tutor.js';
import { boardDisplayFor } from './dress.js';
import { Tutor } from './game/tutor.js';
import { GUESSING_WELL, ownEntries } from './guide/entries.js';
import { ladders } from './ladders.js';
import type { Modal } from './overlays/modal.js';
import type { Progress } from './progress.js';
import { type GuideTarget, buildGuide, buildLadderCard } from './screens/guide.js';
import { buildLessonDone, buildSchoolList } from './screens/school.js';
import { LESSONS } from './school/lessons.js';
import { LessonRun } from './school/run.js';
import type { Settings } from './settings.js';

/** What the line under a lesson board says: the step, whether it waits for Next, a refusal. */
export interface LessonLine {
  readonly say: string;
  readonly next: boolean;
  readonly refused: string | null;
}

/** The field guide's diagrams' cell size before the preview-size setting scales it, in CSS pixels. */
const GUIDE_CELL = 40;

/** What the teaching reads of App, and the screens it asks App for. */
export interface TeachingHost {
  readonly settings: Settings;
  readonly progress: Progress;
  readonly modal: Modal;
  /** The ladder the player is on or last looked at, whose look the guide's diagrams wear. */
  typeId(): string;
  /** Put a screen up in place of whatever is showing. */
  show(screen: HTMLElement): void;
  /** Put a board up to be played, as a lesson: no records, no best time. */
  play(game: Game): void;
  refresh(): void;
  /** Back to the ladder list. */
  ladders(): void;
}

export class Teaching {
  /** The tutor on the board being played: what it last found, and the hints asked. */
  readonly tutor = new Tutor();
  /** The school's lesson, when the board on screen is one; and which of the nine it is. */
  lesson: LessonRun | null = null;
  private lessonIndex = 0;
  /** Why the last click on a lesson board was refused, until the next move. */
  private refused: string | null = null;

  constructor(private readonly host: TeachingHost) {}

  /** The rules card, which offers the field guide and the school. */
  howTo(): void {
    this.host.modal.howTo(
      () => this.guide(),
      () => this.school(),
    );
  }

  /**
   * A ladder opened: the first time, if its rules add a trick of its own, its card says how to play
   * it. Shown once, and never required.
   */
  opened(typeId: string): void {
    const { progress, modal } = this.host;
    const ladder = ladders.find((t) => t.id === typeId);
    if (!ladder || progress.ladderCardSeen(typeId) || !ownEntries(ladder).length) return;
    progress.markLadderCardSeen(typeId);
    const { overlay, focus } = buildLadderCard(
      ladder,
      () => this.guide(undefined, typeId),
      () => modal.close(),
    );
    modal.show(overlay, focus);
  }

  /** The school: its nine lessons, and whether each has been taken. */
  school(): void {
    this.leaveLesson();
    this.host.show(
      buildSchoolList({
        progress: this.host.progress,
        back: () => this.host.ladders(),
        start: (i) => this.startLesson(i),
      }),
    );
  }

  /**
   * The field guide over whatever is on screen, open at `target` if one is given and led by how to
   * play `ladderId` if one is, its diagrams in the look of the ladder the player is on or last
   * looked at.
   */
  guide(target?: GuideTarget, ladderId?: string): void {
    const { settings, modal } = this.host;
    const typeId = this.host.typeId();
    const { overlay, focus, show } = buildGuide({
      ladders,
      ladder: ladders.find((t) => t.id === ladderId),
      theme: settings.themeFor(typeId),
      // A diagram's beaten creatures are part of what it teaches, so they stay creatures.
      display: { ...boardDisplayFor(settings, typeId), beatenNumbers: false },
      cell: Math.round(GUIDE_CELL * settings.presentation.previewSize),
      close: () => modal.close(),
    });
    if (modal.show(overlay, focus)) show(target);
  }

  /** Begin one of the nine lessons, on its own board. */
  startLesson(index: number): void {
    this.lessonIndex = index;
    this.refused = null;
    this.lesson = new LessonRun(LESSONS[index]!, { settings: this.host.settings.gameplay });
    this.host.play(this.lesson.game);
  }

  leaveLesson(): void {
    this.lesson = null;
    this.refused = null;
  }

  /** The board's label while a lesson is being taken. */
  lessonTitle(): string | null {
    return this.lesson
      ? `SCHOOL — lesson ${this.lessonIndex + 1}: ${this.lesson.lesson.title}`
      : null;
  }

  /**
   * Whether a click opening this cell is refused, as the lesson's rule has it; the reason is said
   * under the board until the next move. The engine never sees a refused click.
   */
  refuse(cell: Cell | null): boolean {
    this.refused = this.lesson && cell ? this.lesson.refusal(cell) : null;
    if (this.refused) this.host.refresh();
    return this.refused !== null;
  }

  /** After a move on a lesson board: the refusal is spent, and the lesson moves on if it can. */
  moved(): void {
    this.refused = null;
    this.lesson?.settle();
  }

  /** The player says to go on. */
  next(): void {
    this.refused = null;
    this.lesson?.next();
    this.host.refresh();
    this.ended();
  }

  /** Once a lesson's last step is behind the player: it is written down, and a card offers more. */
  ended(): void {
    const run = this.lesson;
    if (!run?.finished) return;
    this.host.progress.markLessonDone(run.lesson.id);
    const next = this.lessonIndex + 1 < LESSONS.length ? this.lessonIndex + 1 : null;
    const { overlay, focus } = buildLessonDone(
      run.lesson.title,
      next === null ? null : () => this.startLesson(next),
      () => this.school(),
    );
    this.host.modal.show(overlay, focus);
  }

  /** What the line under the board says while a lesson is up. */
  lessonLine(): LessonLine | null {
    const step = this.lesson?.step;
    if (!step) return null;
    return { say: step.say, next: 'next' in step.wait, refused: this.refused };
  }

  /** What to point at on the board: the tutor's own lesson if asked, else the step's. */
  pointer(): Lesson | null {
    return this.tutor.pointer() ?? this.lesson?.pointer() ?? null;
  }

  /** The guide from a board: at the trick the tutor is showing, or at guessing well at a guess. */
  guideFromBoard(): void {
    const topic = this.tutor.topic();
    const at =
      topic === 'guess' ? { section: GUESSING_WELL } : topic ? { trick: topic } : undefined;
    this.guide(at, this.host.typeId());
  }
}
