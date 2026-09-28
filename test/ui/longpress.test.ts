// @vitest-environment happy-dom
/**
 * A long press on a touch screen does what a right-click does: a finger held still on a covered
 * cell for the setting's time marks it and its lift opens nothing; a finger that wanders, lifts
 * early or is joined by a second does not; and at 0 a hold is only a slow tap.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardConfig } from '../../src/engine/config.js';
import { Game } from '../../src/engine/game.js';
import { App } from '../../src/ui/app.js';
import { BoardView, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { ladders } from '../../src/ui/ladders.js';
import { themeFor } from '../../src/ui/looks.js';
import { DEFAULT_LONG_PRESS } from '../../src/ui/presentation.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

/** A board on screen, with what its input reports. */
function board(longPressMs: number): {
  canvas: HTMLCanvasElement;
  view: BoardView;
  marks: [number, number][];
  opens: [number, number][];
} {
  const canvas = document.createElement('canvas');
  const marks: [number, number][] = [];
  const opens: [number, number][] = [];
  const view = new BoardView(canvas, {
    onOpen: (x, y) => opens.push([x, y]),
    onCycleMark: (x, y) => marks.push([x, y]),
    onHover: () => undefined,
  });
  document.body.append(canvas);
  view.setGame(Game.create(boardConfig(ladders, 'normal', 1), 7), themeFor('normal'), {
    ...DEFAULT_DISPLAY,
    longPressMs,
  });
  return { canvas, view, marks, opens };
}

/** A pointer event as a finger makes it, at a point on the canvas. */
function finger(
  canvas: HTMLCanvasElement,
  type: string,
  x: number,
  y: number,
  pointerId = 1,
): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    pointerType: { value: 'touch' },
    pointerId: { value: pointerId },
    clientX: { value: x },
    clientY: { value: y },
    button: { value: 0 },
  });
  canvas.dispatchEvent(ev);
}

/** The middle of a cell, in client pixels, where the board is drawn. */
const at = (view: BoardView, cell: number, axis: 'x' | 'y'): number =>
  (axis === 'x' ? view.originX : view.originY) + view.cellSize * cell + view.cellSize / 2;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('a long press', () => {
  it('marks the cell under a finger held still, and its lift opens nothing', () => {
    const { canvas, view, marks, opens } = board(500);
    finger(canvas, 'pointerdown', at(view, 2, 'x'), at(view, 1, 'y'));
    vi.advanceTimersByTime(499);
    expect(marks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(marks).toEqual([[2, 1]]);
    finger(canvas, 'pointerup', at(view, 2, 'x'), at(view, 1, 'y'));
    expect(opens).toEqual([]);
  });

  it('is a tap when the finger lifts early, and nothing when it wanders', () => {
    const { canvas, view, marks, opens } = board(500);
    finger(canvas, 'pointerdown', at(view, 2, 'x'), at(view, 1, 'y'));
    vi.advanceTimersByTime(200);
    finger(canvas, 'pointerup', at(view, 2, 'x'), at(view, 1, 'y'));
    expect(opens).toEqual([[2, 1]]);
    expect(marks).toEqual([]);

    finger(canvas, 'pointerdown', at(view, 3, 'x'), at(view, 1, 'y'));
    finger(canvas, 'pointermove', at(view, 3, 'x') + 12, at(view, 1, 'y'));
    vi.advanceTimersByTime(600);
    expect(marks).toEqual([]);
  });

  it('is cancelled by a second finger, and never happens at 0', () => {
    const { canvas, view, marks } = board(500);
    finger(canvas, 'pointerdown', at(view, 2, 'x'), at(view, 1, 'y'));
    finger(canvas, 'pointerdown', at(view, 5, 'x'), at(view, 2, 'y'), 2);
    vi.advanceTimersByTime(600);
    expect(marks).toEqual([]);

    const off = board(0);
    finger(off.canvas, 'pointerdown', at(off.view, 2, 'x'), at(off.view, 1, 'y'));
    vi.advanceTimersByTime(2000);
    expect(off.marks).toEqual([]);
  });
});

describe('the setting', () => {
  it('is a slider in the Interface section, and reads a save without it as half a second', () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    const app = new App(document.getElementById('app')!) as unknown as {
      showSettings(back: () => void): void;
      showTypes(): void;
      settings: Settings;
    };
    app.showSettings(() => app.showTypes());
    const row = [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Long press to mark',
    )!;
    const input = row.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(row.querySelector('.settings-value')!.textContent).toBe('500 ms');
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    expect(row.querySelector('.settings-value')!.textContent).toBe('Off');
    expect(app.settings.presentation.longPress).toBe(0);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.longPress).toBe(DEFAULT_LONG_PRESS);
  });
});
