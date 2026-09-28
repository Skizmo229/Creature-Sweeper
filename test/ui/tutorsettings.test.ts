// @vitest-environment happy-dom
/**
 * The tutor's two settings: how much it says, the whole lesson or only where to look, and the
 * dearest grade it tries; and what it says when nothing under that grade proves a move.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../../src/engine/game.js';
import type { Lesson } from '../../src/sim/tutor.js';
import { explain } from '../../src/sim/tutor.js';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { LESSONS } from '../../src/ui/school/lessons.js';
import { LessonRun } from '../../src/ui/school/run.js';
import { Settings } from '../../src/ui/settings.js';

interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  readonly current: Game | null;
  readonly settings: Settings;
  readonly teaching: { pointer(): Lesson | null };
  showSettings(back: () => void): void;
  showTypes(): void;
}

let app: Driver;

const key = (k: string): boolean =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
const hint = (): string => document.querySelector('.hint')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

describe('the grade cap', () => {
  it('stops the reading at the grade asked', () => {
    // The school's third lesson is subtraction, a grade-1 trick, on a board nothing cheaper proves.
    const lesson = LESSONS.find((l) => l.id === 'subtract')!;
    const game = new LessonRun(lesson).game;
    expect(explain(game).lessons.length).toBeGreaterThan(0);
    expect(explain(game, { most: 0 }).lessons).toEqual([]);
  });

  it('says so in the hint line rather than calling the board a guess', () => {
    app.settings.setPresentation({ tutorGrade: 0 });
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Take the lessons')!
      .click();
    document.querySelectorAll<HTMLButtonElement>('.board-card')[2]!.click();
    key('h');
    expect(hint()).toMatch(/^Nothing up to grade 0 proves a move here/);
  });
});

describe('the hint style', () => {
  it('says where to look and points at the numbers alone', () => {
    app.settings.setPresentation({ tutorStyle: 'where' });
    app.play('normal', 1, 7);
    key('h');
    expect(hint()).toMatch(/^Grade \d · .*: look at the \d/);
    const pointer = app.teaching.pointer()!;
    expect(pointer.why.constraints.length).toBeGreaterThan(0);
    expect(pointer.open).toEqual([]);
    expect(pointer.mark).toEqual([]);
    expect(pointer.narrow).toEqual([]);
    // A press is a hint whatever it says.
    app.settings.setPresentation({ tutorStyle: 'full' });
    app.play('normal', 1, 7);
    key('h');
    expect(
      app.teaching.pointer()!.open.length + app.teaching.pointer()!.mark.length,
    ).toBeGreaterThan(0);
  });
});

describe('the settings', () => {
  it('are a gallery and a slider beside the Tutor toggle, read from a save without them as before', () => {
    app.showSettings(() => app.showTypes());
    const names = [...document.querySelectorAll('.settings-name')].map((n) => n.textContent);
    const tutor = names.indexOf('Tutor');
    expect(names.slice(tutor, tutor + 3)).toEqual(['Tutor', 'Hint style', 'Tutor grade']);
    const row = (name: string): HTMLElement =>
      [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
        (r) => r.querySelector('.settings-name')?.textContent === name,
      )!;
    row('Hint style').querySelectorAll<HTMLButtonElement>('.preview-chip')[1]!.click();
    expect(Settings.load().presentation.tutorStyle).toBe('where');
    const grade = row('Tutor grade').querySelector<HTMLInputElement>('input[type=range]')!;
    expect(row('Tutor grade').querySelector('.settings-value')!.textContent).toBe(
      'Grade 4, everything',
    );
    grade.value = '2';
    grade.dispatchEvent(new Event('input'));
    expect(Settings.load().presentation.tutorGrade).toBe(2);
    expect(row('Tutor grade').querySelector('.settings-value')!.textContent).toBe('Grade 2');

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.tutorStyle).toBe('full');
    expect(Settings.load().presentation.tutorGrade).toBe(4);
  });
});
