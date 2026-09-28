// @vitest-environment happy-dom
/**
 * Starting boards at the zoom ceiling: a board just set opens at the ceiling, panning when it
 * does not fit, and F fits it as ever; off, and by default, it opens fitted to the stage.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { boardConfig } from '../../src/engine/config.js';
import { Game } from '../../src/engine/game.js';
import { App } from '../../src/ui/app.js';
import { BoardView, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { ladders } from '../../src/ui/ladders.js';
import { themeFor } from '../../src/ui/looks.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

/** A NORMAL board in a stage 120 pixels wide, the least a stage can be, so it cannot fit at 48. */
function shown(startAtCeiling: boolean): BoardView {
  const canvas = document.createElement('canvas');
  const view = new BoardView(canvas, {
    onOpen: () => undefined,
    onCycleMark: () => undefined,
    onHover: () => undefined,
  });
  document.body.append(canvas);
  view.setGame(Game.create(boardConfig(ladders, 'normal', 1), 7), themeFor('normal'), {
    ...DEFAULT_DISPLAY,
    maxCell: 48,
    startAtCeiling,
  });
  return view;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('starting at the ceiling', () => {
  it('opens a board at the ceiling, and F fits it', () => {
    const view = shown(true);
    expect(view.fittedCell).toBeLessThan(48);
    expect(view.cellSize).toBe(48);
    expect(view.canPan).toBe(true);
    view.fit();
    expect(view.cellSize).toBe(view.fittedCell);
  });

  it('opens a board fitted when off', () => {
    const view = shown(false);
    expect(view.cellSize).toBe(view.fittedCell);
    expect(view.cellSize).toBeLessThan(48);
  });

  it('is a toggle beside the zoom ceiling, and reads a save without it as off', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = new App(document.getElementById('app')!) as unknown as {
      showSettings(back: () => void): void;
      showTypes(): void;
      settings: Settings;
    };
    app.showSettings(() => app.showTypes());
    const names = [...document.querySelectorAll('.settings-name')].map((n) => n.textContent);
    expect(names.indexOf('Start boards at the maximum zoom')).toBe(
      names.indexOf('Maximum zoom in') + 1,
    );
    const row = [...document.querySelectorAll('.settings-row')].find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Start boards at the maximum zoom',
    )!;
    row.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    expect(Settings.load().presentation.startAtCeiling).toBe(true);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.startAtCeiling).toBe(false);
  });
});
