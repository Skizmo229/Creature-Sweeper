// @vitest-environment happy-dom
/**
 * The cursor highlight's fourth shape and its thickness: 'seen' lights the open numbers and
 * beaten creatures that constrain a covered cell, and what an open cell sees; the line is drawn
 * as thick as the setting says, the cross over a refused cell with it.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../../src/engine/game.js';
import { App } from '../../src/ui/app.js';
import { type BoardDisplay, BoardView, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { themeFor } from '../../src/ui/looks.js';
import { HIGHLIGHT_NAMES, type HighlightStyle } from '../../src/ui/presentation.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { MARK_COLOR, OUT_OF_REACH_COLOR } from '../../src/ui/theme.js';

/** Every `stroke()` on a canvas made while this runs: its colour and its width. */
function recordStrokes(): { strokes: { color: string; width: number }[]; stop: () => void } {
  const strokes: { color: string; width: number }[] = [];
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    let color = '';
    let width = 1;
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'stroke') return () => strokes.push({ color, width });
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'strokeStyle') color = String(value);
        if (prop === 'lineWidth') width = Number(value);
        return prop === 'strokeStyle' || prop === 'lineWidth' || Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { strokes, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

/**
 * A board with a covered creature at (2,1) seen by five numbers and a beaten creature: the 2 and
 * the 3 above it, the 3 to its left, the beaten 1 below left, and the 3 and the 2 below; its two
 * covered neighbours to the right count for nothing.
 */
const board = (): Game =>
  Game.fromLayout(
    ['. . . 1 .', '. . 2 . .', '. 1 . . .'],
    ['0 2 3 ? 1', '1 3 ? ? 1', '1 k1 3 2 ?'],
    { startLevel: 2 },
  );

let recording: ReturnType<typeof recordStrokes>;
beforeEach(() => {
  recording = recordStrokes();
});
afterEach(() => recording.stop());

/** Draw the board with `cell` held under the cursor, and count the strokes in a colour. */
function lit(
  style: HighlightStyle,
  cell: { x: number; y: number },
  over: Partial<BoardDisplay> = {},
): { boxes: number; crosses: number; widths: number[] } {
  recording.strokes.length = 0;
  const view = new BoardView(
    document.createElement('canvas'),
    { onOpen: () => undefined, onCycleMark: () => undefined, onHover: () => undefined },
    { interactive: false, fixedCell: 26 },
  );
  view.setGame(board(), themeFor('normal'), { ...DEFAULT_DISPLAY, highlight: style, ...over });
  view.pinHover(cell.x, cell.y);
  const boxes = recording.strokes.filter((s) => s.color === MARK_COLOR);
  return {
    boxes: boxes.length,
    crosses: recording.strokes.filter((s) => s.color === OUT_OF_REACH_COLOR).length,
    widths: [...new Set(boxes.map((s) => s.width))],
  };
}

describe('the seen highlight', () => {
  it('lights the numbers and beaten creatures that see a covered cell, and the cell', () => {
    // Six open cells with something to say touch (2,1); its covered neighbours do not count.
    expect(lit('seen', { x: 2, y: 1 }).boxes).toBe(6 + 1);
    // Over an open cell it lights what that cell sees, as the true neighbours do.
    expect(lit('seen', { x: 1, y: 1 }).boxes).toBe(lit('neighbours', { x: 1, y: 1 }).boxes);
  });

  it('is named among the shapes, and draws as thick as the setting says', () => {
    expect(Object.keys(HIGHLIGHT_NAMES)).toContain('seen');
    expect(lit('neighbours', { x: 2, y: 1 }).widths).toEqual([2]);
    expect(lit('neighbours', { x: 2, y: 1 }, { highlightWidth: 4 }).widths).toEqual([4]);
  });
});

describe('the settings', () => {
  it('offer the shape and the thickness, and read a save without a thickness as 2', () => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    const app = new App(document.getElementById('app')!) as unknown as {
      showSettings(back: () => void): void;
      showTypes(): void;
      settings: Settings;
    };
    app.showSettings(() => app.showTypes());
    const rows = [...document.querySelectorAll<HTMLElement>('.settings-row')];
    const shape = rows.find(
      (r) => r.querySelector('.settings-name')?.textContent === '3×3 cursor highlight',
    )!;
    expect([...shape.querySelectorAll('.chip-label')].map((l) => l.textContent)).toContain(
      HIGHLIGHT_NAMES.seen,
    );
    const width = rows.find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Cursor highlight thickness',
    )!;
    const input = width.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(input.value).toBe('2');
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    expect(width.querySelector('.highlight-width-demo canvas')).not.toBeNull();
    input.dispatchEvent(new Event('change'));
    expect(app.settings.presentation.highlightWidth).toBe(3);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.highlightWidth).toBe(2);
  });
});
