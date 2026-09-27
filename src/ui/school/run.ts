/**
 * One lesson being taken (docs/teaching-plan.md, section 5.3): its board, which step is up, what the
 * tutor points at for it, and which clicks the school lets through. Headless, so
 * `test/school.test.ts` takes every lesson through it; the school screen draws it and hands it the
 * player's actions. It never acts on the board itself.
 *
 * On a lesson board a click that no trick has proven is refused, with the reason, rather than
 * fought, except where guessing is the lesson: a lesson that derails into a death teaches the
 * wrong thing, and a refused click is itself a lesson, since it is a cell the player has not
 * proven. The refusal is the UI's; the engine never sees the click.
 */

import { damageIfSurvived } from '../../engine/combat.js';
import { Game, type GameOptions } from '../../engine/game.js';
import { hasNotes, lowestNote, noteBit } from '../../engine/notes.js';
import type { Cell } from '../../engine/types.js';
import { type Lesson, merge, provable } from '../../sim/tutor.js';
import type { SchoolLesson, Spot, Step, Wait } from './lessons.js';

/** The catalogue's boards, and so the school's, have five tiers. */
const TIERS = 5;

export class LessonRun {
  readonly game: Game;
  private at = 0;

  constructor(
    readonly lesson: SchoolLesson,
    options: GameOptions = {},
  ) {
    this.game = Game.fromLayout(lesson.truth, lesson.shown, {
      ...options,
      startLevel: lesson.level,
      tiers: TIERS,
      typeId: 'school',
      // Sweep would do the lesson's work for the player, as it would EASY's.
      sweep: false,
    });
    this.settle();
  }

  /** The step up now, or null once the lesson is over. */
  get step(): Step | null {
    return this.lesson.steps[this.at] ?? null;
  }

  /** How many steps are behind the player. */
  get done(): number {
    return this.at;
  }

  get finished(): boolean {
    return this.at >= this.lesson.steps.length;
  }

  /** The player says to go on: moves past a step that waits for that, and nothing else. */
  next(): void {
    if (this.step && 'next' in this.step.wait) {
      this.at++;
      this.settle();
    }
  }

  /** After the board has changed: move past every step whose wait is met. */
  settle(): void {
    while (this.step && this.met(this.step.wait)) this.at++;
  }

  private met(wait: Wait): boolean {
    if ('next' in wait) return false;
    if ('open' in wait) return wait.open.every((s) => this.cell(s).open);
    if ('mark' in wait) return this.cell(wait.mark).mark === wait.tier;
    const mask = wait.tiers.reduce((m, t) => m | noteBit(t), 0);
    return this.cell(wait.pencil).notes === mask;
  }

  private cell([x, y]: Spot): Cell {
    const cell = this.game.cellAt(x, y);
    if (!cell) throw new Error(`${this.lesson.id}: ${x},${y} is not a cell of the board`);
    return cell;
  }

  /**
   * Why a click may not open this cell, or null when it may: a cell the tricks have proven safe,
   * anything at all where guessing is the lesson, or a cell the engine will refuse itself (open, or
   * locked by a mark or the pencil). A cell proven to be a creature above the level is refused with
   * its cost, and any other with the number to look at.
   */
  refusal(cell: Cell): string | null {
    const { game } = this;
    if (this.lesson.grade === null || cell.open || game.status !== 'playing') return null;
    if (cell.mark > game.level) return null;
    if (hasNotes(cell.notes) && lowestNote(cell.notes) > game.level) return null;
    const proven = provable(game);
    if (proven.open.has(cell)) return null;
    const tier = proven.mark.get(cell);
    if (tier !== undefined) {
      return (
        `That cell is a ${tier}, above your level ${game.level}: the fight would cost ` +
        `${damageIfSurvived(game.level, tier)} HP. Mark it and come back.`
      );
    }
    const look = (this.pointer() ?? proven.proofs.find((l) => l.open.length))?.why.constraints[0];
    return `Nothing proves that cell yet${look ? `; look at the ${look.cell.num}` : ''}.`;
  }

  /**
   * What the tutor points at for the step: the proofs of its trick on the board as it stands,
   * those that conclude a cell the step waits for when any do, as one lesson.
   */
  pointer(): Lesson | null {
    const step = this.step;
    if (!step?.point || this.game.status !== 'playing') return null;
    const proofs = provable(this.game).proofs.filter((l) => l.trick === step.point);
    const wanted = new Set(spots(step.wait).map((s) => this.cell(s)));
    const aimed = proofs.filter((l) =>
      [...l.open, ...l.mark.map(([c]) => c), ...l.narrow.map(([c]) => c)].some((c) =>
        wanted.has(c),
      ),
    );
    return merge(aimed.length ? aimed : proofs, this.game.config.width);
  }
}

/** The cells a wait is about. */
export function spots(wait: Wait): readonly Spot[] {
  if ('open' in wait) return wait.open;
  if ('mark' in wait) return [wait.mark];
  if ('pencil' in wait) return [wait.pencil];
  return [];
}
