// @vitest-environment happy-dom
/**
 * A school lesson is played at the tuned dials whatever the settings say: the lessons are written
 * for that game, the guessing lesson pricing its guess at 2 of 10 HP and the last reading the LV 5
 * counter, and the Brutal preset's half HP, double damage and hidden counters would make both
 * untrue. The ladders' boards keep the dials.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAMEPLAY } from '../../src/engine/settings.js';
import { LESSONS } from '../../src/ui/school/lessons.js';
import { type AppDriver, mountApp } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
  app.settings.setGameplay({ hpRatio: 0.5, enemyDamageRatio: 2, countersHidden: true });
});

const lesson = (id: string): number => LESSONS.findIndex((l) => l.id === id);

describe('a school lesson under hard dials', () => {
  it('is played at the tuned dials, at the HP its words quote', () => {
    app.teaching.startLesson(lesson('guessing'));
    expect(app.current!.settings).toEqual(DEFAULT_GAMEPLAY);
    expect(app.current!.maxHp).toBe(10);
    expect(LESSONS[lesson('guessing')]!.steps[0]!.say).toContain('2 of your 10 HP');
  });

  it('shows the counters its words read', () => {
    app.teaching.startLesson(lesson('last-of-tier'));
    const five = document.querySelector<HTMLElement>('.counter[data-tier="5"]')!;
    expect(five.textContent).toBe('LV 5\n×01');
  });

  it('leaves the dials on a ladder’s board', () => {
    app.play('normal', 1, 7);
    expect(app.current!.settings.countersHidden).toBe(true);
    expect(app.current!.settings.enemyDamageRatio).toBe(2);
  });
});
