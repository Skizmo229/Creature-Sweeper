// @vitest-environment happy-dom
/**
 * The hint line under the board as a setting: off, the line is hidden while it would only say
 * what a click does, and shown while the tutor or a lesson speaks there.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  readonly settings: Settings;
  readonly actions: { onCellPrimary(x: number, y: number): void };
  readonly current: { safeCells(o: { useMarks: boolean }): { x: number; y: number }[] } | null;
  showSettings(back: () => void): void;
  showTypes(): void;
}

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

const hint = (): HTMLElement => document.querySelector<HTMLElement>('.hint')!;
const key = (k: string): boolean =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('the hint line setting', () => {
  it('shows the line by default and hides it when off, until the tutor speaks', () => {
    app.play('normal', 1, 7);
    expect(hint().hidden).toBe(false);
    expect(hint().textContent).toMatch(/^Click to open/);

    app.settings.setPresentation({ hintLine: false });
    app.play('normal', 1, 7);
    expect(hint().hidden).toBe(true);
    key('h');
    expect(hint().hidden).toBe(false);
    expect(hint().textContent).toMatch(/^Grade \d/);
    // A move dismisses the lesson, and the line goes with it.
    const safe = app.current!.safeCells({ useMarks: false })[0]!;
    app.actions.onCellPrimary(safe.x, safe.y);
    expect(hint().hidden).toBe(true);
  });

  it('keeps the line for a lesson', () => {
    app.settings.setPresentation({ hintLine: false });
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Take the lessons')!
      .click();
    document.querySelectorAll<HTMLButtonElement>('.board-card')[0]!.click();
    expect(hint().hidden).toBe(false);
    expect(hint().classList.contains('teaching')).toBe(true);
  });

  it('is a toggle on the settings screen, and reads a save from before it as on', () => {
    app.showSettings(() => app.showTypes());
    const row = [...document.querySelectorAll('.settings-row')].find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Hint line',
    )!;
    const box = row.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.checked).toBe(true);
    box.click();
    expect(Settings.load().presentation.hintLine).toBe(false);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.hintLine).toBe(true);
  });
});
