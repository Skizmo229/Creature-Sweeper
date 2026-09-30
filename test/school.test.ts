/**
 * The school (`src/ui/school/`): every lesson is taken, step by step, by the tricks at its grade
 * with no guess and no HP lost, and where the lesson's trick is needed the grade below cannot make
 * the move; its words are the trick text's; the tutor points at every step that names a trick; and
 * a click nothing has proven is refused, with a reason, except where guessing is the lesson.
 */

import { describe, expect, it } from 'vitest';
import { noteBit } from '../src/engine/notes.js';
import { DEFAULT_GAMEPLAY, fightCostFor } from '../src/engine/settings.js';
import type { Cell } from '../src/engine/types.js';
import { type Grade, TRICKS } from '../src/sim/tricks.js';
import { TRICK_TEXT } from '../src/sim/tricktext.js';
import { provable } from '../src/sim/tutor.js';
import { LESSONS, type SchoolLesson } from '../src/ui/school/lessons.js';
import { LessonRun, spots } from '../src/ui/school/run.js';

/** Whether a player of this grade could make the step's move on the board as it stands. */
function canMake(run: LessonRun, grade: number): boolean {
  const wait = run.step!.wait;
  if (grade < 0) return false;
  const p = provable(run.game, grade as Grade);
  const cell = ([x, y]: readonly [number, number]): Cell => run.game.cellAt(x, y)!;
  if ('open' in wait) return wait.open.every((s) => cell(s).open || p.open.has(cell(s)));
  if ('mark' in wait) return p.mark.get(cell(wait.mark)) === wait.tier;
  if ('pencil' in wait) {
    const mask = wait.tiers.reduce((m, t) => m | noteBit(t), 0);
    return p.narrow.get(cell(wait.pencil)) === mask;
  }
  return true;
}

/** Make the step's move, as the player would. */
function make(run: LessonRun): void {
  const wait = run.step!.wait;
  const { game } = run;
  if ('next' in wait) run.next();
  if ('open' in wait) for (const [x, y] of wait.open) if (!game.cellAt(x, y)!.open) game.open(x, y);
  if ('mark' in wait) game.setMark(wait.mark[0], wait.mark[1], wait.tier);
  if ('pencil' in wait)
    for (const t of wait.tiers) game.toggleNote(wait.pencil[0], wait.pencil[1], t);
  run.settle();
}

const grade = (l: SchoolLesson): number => l.grade ?? 4;

describe('the school', () => {
  it('has the nine lessons of the plan, each once', () => {
    expect(LESSONS.map((l) => l.id)).toEqual([
      'sum',
      'shield',
      'subtract',
      'last-cell',
      'counters',
      'one-two-one',
      'bounds',
      'guessing',
      'last-of-tier',
    ]);
  });

  it('is taken by the tricks at each lesson’s grade, and the grade below fails where it must', () => {
    for (const lesson of LESSONS) {
      const run = new LessonRun(lesson);
      const { game } = run;
      let keys = 0;
      while (!run.finished) {
        const step = run.step!;
        const at = `${lesson.id} step ${run.done + 1}`;
        expect(canMake(run, grade(lesson)), `${at}: at grade ${grade(lesson)}`).toBe(true);
        if (step.key) {
          keys++;
          expect(canMake(run, grade(lesson) - 1), `${at}: at the grade below`).toBe(false);
        }
        const before = run.done;
        make(run);
        expect(run.done, `${at} moved on`).toBeGreaterThan(before);
        expect(game.hp, `${at}: no HP lost`).toBe(game.maxHp);
      }
      if (lesson.grade !== null) expect(keys, `${lesson.id} has a key step`).toBe(1);
    }
  });

  it("speaks the trick text's sentence where it teaches a trick, at the trick's grade", () => {
    for (const lesson of LESSONS) {
      if (!lesson.trick) continue;
      const said = lesson.steps.map((s) => s.say).join(' ');
      expect(said, lesson.id).toContain(TRICK_TEXT[lesson.trick].rule);
      expect(TRICKS[lesson.trick].grade, lesson.id).toBe(lesson.grade);
    }
  });

  it('points at a proof of the trick every step names, on the cells it waits for', () => {
    for (const lesson of LESSONS) {
      const run = new LessonRun(lesson);
      while (!run.finished) {
        const step = run.step!;
        if (step.point) {
          const pointer = run.pointer();
          const at = `${lesson.id} step ${run.done + 1}`;
          expect(pointer?.trick, at).toBe(step.point);
          const named = [...pointer!.open, ...pointer!.mark.map(([c]) => c)].map(
            (c) => `${c.x},${c.y}`,
          );
          const waited = spots(step.wait).map(([x, y]) => `${x},${y}`);
          if (waited.length && ('open' in step.wait || 'mark' in step.wait)) {
            expect(
              waited.some((w) => named.includes(w)),
              `${at} points at ${named.join(' ')}`,
            ).toBe(true);
          }
        }
        make(run);
      }
    }
  });

  it('refuses a click nothing has proven, and says why, except in the guessing lesson', () => {
    let refused = 0;
    for (const lesson of LESSONS) {
      const run = new LessonRun(lesson);
      const proven = provable(run.game);
      for (const cell of run.game.grid.flat()) {
        if (!cell.present || cell.open) continue;
        const why = run.refusal(cell);
        if (lesson.grade === null || proven.open.has(cell) || cell.mark > run.game.level) {
          expect(why, `${lesson.id} ${cell.x},${cell.y}`).toBeNull();
          continue;
        }
        refused++;
        expect(why, `${lesson.id} ${cell.x},${cell.y}`).toMatch(/^(Nothing proves|That cell is)/);
      }
    }
    expect(refused).toBeGreaterThan(10);
  });

  it('prices a proven creature as the fight would go, through the dials, and says when it kills', () => {
    const lesson = LESSONS.find((l) => l.id === 'last-cell')!;
    const harder = { ...DEFAULT_GAMEPLAY, enemyDamageRatio: 2, hpRatio: 0.5 };
    const said: string[] = [];
    for (const settings of [DEFAULT_GAMEPLAY, harder]) {
      const run = new LessonRun(lesson, { settings });
      const { game } = run;
      for (const [cell, tier] of provable(game).mark) {
        if (cell.open || tier <= game.level) continue;
        const cost = fightCostFor(game.level, game.hp, tier, settings);
        const why = run.refusal(cell)!;
        expect(why, `${tier} at ${game.hp} HP`).toContain(
          cost >= game.hp ? 'the fight would kill you' : `the fight would cost ${cost} HP`,
        );
        said.push(why);
      }
    }
    // Both kinds are met: a fight the player survives, and one that kills.
    expect(said.some((s) => s.includes('would cost'))).toBe(true);
    expect(said.some((s) => s.includes('would kill you'))).toBe(true);
  });
});
