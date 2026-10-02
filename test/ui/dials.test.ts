// @vitest-environment happy-dom
/**
 * The new gameplay dials on screen: the counters hidden, a budget of sweeps on the Sweep
 * button, a chord on an open number, Time Attack racing a share of the best, and a time limit
 * per board and over a run; and their rows on the settings screen.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../../src/engine/game.js';
import { ladders } from '../../src/ui/ladders.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { type AppDriver, mountApp, settingsRow } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
  app.progress.setUnlockAll(true);
});

const text = (selector: string): string =>
  document.querySelector<HTMLElement>(selector)?.textContent ?? '';
const status = (): string => text('.settings-status');

/** NORMAL's second board dealt from the first seed whose opening leaves a sweep something to find. */
function playSweepable(): Game {
  for (let seed = 1; seed < 200; seed++) {
    app.play('normal', 2, seed);
    if (app.current!.safeCells({ useMarks: false }).length > 0) return app.current!;
  }
  throw new Error('no seed under 200 opens NORMAL 2 with a proven cell');
}

describe('the counters hidden', () => {
  it('leaves the LV buttons as tiers alone, and records', () => {
    app.play('normal', 1, 7);
    expect(text('.counter[data-tier="1"]')).toMatch(/^LV 1\n×\d\d$/);
    app.settings.setGameplay({ countersHidden: true });
    app.play('normal', 1, 7);
    expect(text('.counter[data-tier="1"]')).toBe('LV 1');
    expect(document.querySelector('.counter.done')).toBeNull();
    app.showSettings(() => app.showTypes());
    expect(status()).toBe('Harder than tuned: everything records.');
  });
});

describe('a budget of sweeps', () => {
  it('shows on the Sweep button and runs out, and records nothing', () => {
    app.settings.setGameplay({ sweep: 'budget', sweepBudget: 2 });
    const game = playSweepable();
    expect(text('.sweep:not(.assist):not(.why)')).toMatch(/\(2 left\)$/);
    app.actions.doSweep(false);
    expect(game.sweepsLeft).toBe(1);
    expect(text('.sweep:not(.assist):not(.why)')).toMatch(/\(1 left\)$/);
    app.showSettings(() => app.showTypes());
    expect(status()).toMatch(/^Nothing will record: Sweep is easier/);
  });
});

describe('a chord', () => {
  it('sweeps an open number’s ring on a click when asked, and nothing otherwise', () => {
    app.settings.setGameplay({ sweep: 'on' });
    const game = playSweepable();
    const safe = new Set(game.safeCells({ useMarks: false }));
    const at = game.grid
      .flat()
      .find((c) => c.present && c.open && game.neighboursOf(c).some((n) => safe.has(n)))!;
    const target = game.neighboursOf(at).find((n) => safe.has(n))!;
    app.actions.onCellPrimary(at.x, at.y);
    expect(target.open).toBe(false);
    app.settings.setPresentation({ chord: true });
    app.actions.onCellPrimary(at.x, at.y);
    expect(target.open).toBe(true);
  });
});

describe('the clock’s dials', () => {
  it('race a share of the best, take the shorter of that and a limit, and limit a run per board', () => {
    app.progress.recordClear(ladders, 'normal', 1, { perfect: false, seconds: 100 });
    app.settings.setGameplay({ timeAttack: true, timeAttackRatio: 0.5 });
    app.play('normal', 1, 7);
    expect(app.clock.timeLimit).toBe(50);
    app.settings.setGameplay({ timeLimit: 30 });
    app.play('normal', 1, 7);
    expect(app.clock.timeLimit).toBe(30);
    app.settings.setGameplay({ timeAttack: false });
    app.play('normal', 2, 7);
    expect(app.clock.timeLimit).toBe(30);
    app.runFull('easy', 7);
    expect(app.clock.timeLimit).toBe(30 * 10);
    app.showSettings(() => app.showTypes());
    expect(status()).toBe('Harder than tuned: everything records.');
  });
});

describe('the rows', () => {
  it('are on the settings screen, and a save from before them reads as the tuned game', () => {
    app.showSettings(() => app.showTypes());
    const names = [...document.querySelectorAll('.settings-name')].map((n) => n.textContent);
    for (const name of [
      'Spell prices',
      'Starting mana',
      'Chord on a number',
      'Hide the counters',
      'Time limit per board',
    ]) {
      expect(names, name).toContain(name);
    }
    const sweep = settingsRow('Sweep');
    const select = sweep.querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map((o) => o.value)).toEqual(['on', 'charge', 'budget', 'off']);
    select.value = 'budget';
    select.dispatchEvent(new Event('change'));
    expect(app.settings.gameplay.sweep).toBe('budget');
    const subs = [...sweep.querySelectorAll<HTMLElement>('.settings-subrow')];
    expect(subs.map((s) => s.hidden)).toEqual([true, false]);

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, gameplay: { hpRatio: 2 } }));
    const g = Settings.load().gameplay;
    expect([g.sweepBudget, g.spellPriceRatio, g.startManaRatio, g.countersHidden]).toEqual([
      3,
      1,
      1,
      false,
    ]);
    expect([g.timeAttackRatio, g.timeLimit]).toEqual([1, 0]);
  });
});
