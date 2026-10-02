// @vitest-environment happy-dom
/**
 * Back pauses without asking: with the setting on, leaving a board or a run with a move in it
 * pauses it at once, the question never shown; off, the question asks as before.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { ladders } from '../../src/ui/ladders.js';
import { pausedGames } from '../../src/ui/paused.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { type AppDriver, key, mountApp, settingsRow } from './driver.js';

let app: AppDriver;

const onGame = (): boolean => document.querySelector('.screen.game') !== null;

/**
 * Open the lowest free cell through the board's own click, so the board has a move in it. False
 * when there is none left.
 */
function freeMove(): boolean {
  const game = app.current!;
  const cell = game.grid
    .flat()
    .filter((c) => c.present && !c.open && c.mark === 0 && c.tier <= game.level && game.inReach(c))
    .sort((a, b) => a.tier - b.tier)[0];
  if (!cell) return false;
  app.actions.onCellPrimary(cell.x, cell.y);
  return true;
}

beforeEach(() => {
  app = mountApp();
  app.progress.setUnlockAll(true);
});

describe('back pauses without asking', () => {
  it('asks by default, and pauses at once when on', () => {
    app.play('normal', 3, 7);
    freeMove();
    key('Escape');
    expect(document.querySelector('.overlay h2')?.textContent).toBe('LEAVE BOARD 3?');
    key('Escape');
    expect(onGame()).toBe(true);

    app.settings.setPresentation({ backPauses: true });
    key('Escape');
    expect(document.querySelector('.overlay')).toBeNull();
    expect(onGame()).toBe(false);
    expect(pausedGames.get({ typeId: 'normal', board: 3 })).not.toBeNull();
  });

  it('pauses a run the same way', () => {
    app.settings.setPresentation({ backPauses: true });
    app.runFull('easy', 7);
    freeMove();
    [...document.querySelectorAll<HTMLButtonElement>('.hud button')]
      .find((b) => b.textContent === 'Back')!
      .click();
    expect(document.querySelector('.overlay')).toBeNull();
    expect(pausedGames.get({ typeId: 'easy', run: true })).not.toBeNull();
    expect(app.progress.runRecord(ladders, 'easy').attempts).toBe(0);
  });

  it('leaves the mid-run card Abandon run alone: that button asks, then abandons', () => {
    app.settings.setPresentation({ backPauses: true });
    app.runFull('easy', 7);
    while (app.current!.status === 'playing' && freeMove());
    expect(document.querySelector('.overlay h2')?.textContent).toBe('BOARD 1 CLEAR');
    const abandon = (): HTMLButtonElement[] =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
        (b) => b.textContent === 'Abandon run',
      );
    abandon()[0]!.click();
    expect(onGame()).toBe(true);
    expect([...document.querySelectorAll('.overlay h2')].map((h) => h.textContent)).toContain(
      'LEAVE RUN?',
    );
    abandon().at(-1)!.click();
    expect(onGame()).toBe(false);
    expect(pausedGames.get({ typeId: 'easy', run: true })).toBeNull();
    expect(app.progress.runRecord(ladders, 'easy').attempts).toBe(1);
  });

  it('is a toggle on the settings screen, and reads a save without it as off', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Back pauses without asking');
    const box = row.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.checked).toBe(false);
    box.click();
    expect(Settings.load().presentation.backPauses).toBe(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.backPauses).toBe(false);
  });
});
