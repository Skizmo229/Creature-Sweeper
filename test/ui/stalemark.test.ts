// @vitest-environment happy-dom
/**
 * A right-button press whose release the canvas never sees (the button let go off-canvas) must
 * not linger: the next left click still opens its cell, and on a touch screen the next taps are
 * taps, not a phantom pinch. A right-click's own release still opens nothing.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { boardConfig } from '../../src/engine/config.js';
import { Game } from '../../src/engine/game.js';
import { BoardView, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { ladders } from '../../src/ui/ladders.js';
import { themeFor } from '../../src/ui/looks.js';

/** A board on screen, with what its input reports. */
function board(): {
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
    longPressMs: 0,
  });
  return { canvas, view, marks, opens };
}

/** A pointer event at a point on the canvas, from a mouse button or a finger. */
function pointer(
  canvas: HTMLCanvasElement,
  type: string,
  x: number,
  y: number,
  opts: { button?: number; pointerType?: string; pointerId?: number; ctrlKey?: boolean } = {},
): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(ev, {
    pointerType: { value: opts.pointerType ?? 'mouse' },
    pointerId: { value: opts.pointerId ?? 1 },
    clientX: { value: x },
    clientY: { value: y },
    button: { value: opts.button ?? 0 },
    ctrlKey: { value: opts.ctrlKey ?? false },
  });
  canvas.dispatchEvent(ev);
}

/** The middle of a cell, in client pixels, where the board is drawn. */
const at = (view: BoardView, cell: number, axis: 'x' | 'y'): number =>
  (axis === 'x' ? view.originX : view.originY) + view.cellSize * cell + view.cellSize / 2;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a right button released off the canvas', () => {
  it('does not swallow the next left click', () => {
    const { canvas, view, marks, opens } = board();
    pointer(canvas, 'pointerdown', at(view, 2, 'x'), at(view, 1, 'y'), { button: 2 });
    expect(marks).toEqual([[2, 1]]);
    // The button goes up off-canvas: no pointerup reaches the board.
    pointer(canvas, 'pointerdown', at(view, 3, 'x'), at(view, 1, 'y'));
    pointer(canvas, 'pointerup', at(view, 3, 'x'), at(view, 1, 'y'));
    expect(opens).toEqual([[3, 1]]);
  });

  it('does not turn the taps that follow into a pinch', () => {
    const { canvas, view, opens } = board();
    pointer(canvas, 'pointerdown', at(view, 2, 'x'), at(view, 1, 'y'), { button: 2 });
    const tap = (cell: number, pointerId: number): void => {
      pointer(canvas, 'pointerdown', at(view, cell, 'x'), at(view, 1, 'y'), {
        pointerType: 'touch',
        pointerId,
      });
      pointer(canvas, 'pointerup', at(view, cell, 'x'), at(view, 1, 'y'), {
        pointerType: 'touch',
        pointerId,
      });
    };
    tap(3, 11);
    tap(4, 12);
    tap(5, 13);
    expect(opens).toEqual([
      [3, 1],
      [4, 1],
      [5, 1],
    ]);
  });

  it('still opens nothing when the right button itself lifts on the canvas', () => {
    const { canvas, view, marks, opens } = board();
    pointer(canvas, 'pointerdown', at(view, 2, 'x'), at(view, 1, 'y'), { button: 2 });
    pointer(canvas, 'pointerup', at(view, 2, 'x'), at(view, 1, 'y'), { button: 2 });
    pointer(canvas, 'pointerdown', at(view, 4, 'x'), at(view, 1, 'y'), { ctrlKey: true });
    pointer(canvas, 'pointerup', at(view, 4, 'x'), at(view, 1, 'y'), { ctrlKey: true });
    expect(marks).toEqual([
      [2, 1],
      [4, 1],
    ]);
    expect(opens).toEqual([]);
  });
});
