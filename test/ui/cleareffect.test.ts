// @vitest-environment happy-dom
/**
 * The board-clear effect's options: when it plays, on every clear or a board's first only; what
 * holds the clear card back, the effect, a click, or nothing; and how fast it runs.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { autoplayTierOrder } from '../../src/sim/autoplay.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { effectDuration } from '../../src/ui/victory/play.js';
import { type AppDriver, mountApp, settingsRow, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

const clear = (board: number): void => {
  app.play('normal', board, 7);
  autoplayTierOrder(app.current!);
  app.finish();
};
const playing = (): boolean => document.querySelector('.stage .victory-layer') !== null;
const overlay = (): HTMLElement => document.querySelector<HTMLElement>('.overlay')!;

describe('when the effect plays', () => {
  it('plays on every clear by default, and on a first clear only when asked', () => {
    clear(1);
    expect(playing()).toBe(true);
    clear(1);
    expect(playing()).toBe(true);
    app.settings.setPresentation({ victoryWhen: 'first' });
    clear(1);
    expect(playing()).toBe(false);
    clear(2);
    expect(playing()).toBe(true);
  });
});

describe('what holds the card', () => {
  it('is the effect by default, a click, or nothing', () => {
    clear(1);
    expect(overlay().classList.contains('held')).toBe(true);

    app.settings.setPresentation({ cardHold: 'click' });
    clear(2);
    expect(overlay().classList.contains('held')).toBe(false);
    expect(overlay().classList.contains('held-click')).toBe(true);
    overlay().click();
    expect(overlay().classList.contains('held-click')).toBe(false);

    app.settings.setPresentation({ cardHold: 'none' });
    clear(3);
    expect([...overlay().classList].some((c) => c.startsWith('held'))).toBe(false);
  });
});

describe('the speed', () => {
  it('shortens or lengthens an effect by its multiple', () => {
    expect(effectDuration('confetti', 2)).toBe(effectDuration('confetti', 1) / 2);
    expect(effectDuration('cascade', 0.5)).toBe(effectDuration('cascade', 1) * 2);
  });
});

describe('the settings', () => {
  it('are three rows above the effect, and read from a save without them as before', () => {
    app.showSettings(() => app.showTypes());
    const names = [...document.querySelectorAll('.settings-name')].map((n) => n.textContent);
    const effect = names.indexOf('Board clear effect');
    expect(names.slice(effect - 3, effect)).toEqual([
      'Play the clear effect',
      'Clear card',
      'Clear effect speed',
    ]);
    tiles(settingsRow('Clear card'))[1]!.click();
    expect(Settings.load().presentation.cardHold).toBe('click');
    const speed =
      settingsRow('Clear effect speed').querySelector<HTMLInputElement>('input[type=range]')!;
    speed.value = '1.5';
    speed.dispatchEvent(new Event('input'));
    expect(Settings.load().presentation.effectSpeed).toBe(1.5);

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    const p = Settings.load().presentation;
    expect([p.victoryWhen, p.cardHold, p.effectSpeed]).toEqual(['every', 'effect', 1]);
  });
});
