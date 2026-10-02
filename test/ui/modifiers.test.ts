// @vitest-environment happy-dom
/**
 * A key with Ctrl, Cmd or Alt held is the browser's, never the board's, and a click with Control
 * held marks, as a right click does (decision 0082).
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { boardConfig } from '../../src/engine/config.js';
import { Game } from '../../src/engine/game.js';
import { BoardView, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { ladders } from '../../src/ui/ladders.js';
import { themeFor } from '../../src/ui/looks.js';
import { key, startApp } from './driver.js';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});

describe('a shortcut with a modifier held', () => {
  it('is left to the browser', () => {
    const app = startApp();
    app.play('normal', 1, 7);
    for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      key('p', held);
      expect(document.querySelector('.stage'), JSON.stringify(held)).not.toBeNull();
    }
    key('p');
    expect(document.querySelector('.stage')).toBeNull();
  });
});

describe('Enter on a board', () => {
  /** Press Enter at `target`, and whether the board claimed it from the browser. */
  const claimed = (target: EventTarget): boolean => {
    const press = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    target.dispatchEvent(press);
    return press.defaultPrevented;
  };

  it('is the browser’s outside a lesson, so a focused button still takes it', () => {
    const app = startApp();
    app.play('normal', 1, 7);
    const pause = [...document.querySelectorAll<HTMLButtonElement>('.screen.game button')][0]!;
    pause.focus();
    expect(claimed(pause)).toBe(false);
    expect(claimed(window)).toBe(false);
  });

  it('goes on with a lesson, unless a focused control takes it', () => {
    const app = startApp();
    app.teaching.startLesson(0);
    expect(claimed(window)).toBe(true);
    const button = document.querySelector<HTMLButtonElement>('.screen.game button')!;
    button.focus();
    expect(claimed(button)).toBe(false);
  });
});

/** A board on screen, with what its input reports. */
function board(): { canvas: HTMLCanvasElement; marks: number; opens: number } {
  const canvas = document.createElement('canvas');
  const counts = { canvas, marks: 0, opens: 0 };
  const view = new BoardView(canvas, {
    onOpen: () => counts.opens++,
    onCycleMark: () => counts.marks++,
    onHover: () => undefined,
  });
  document.body.append(canvas);
  view.setGame(Game.create(boardConfig(ladders, 'normal', 1), 7), themeFor('normal'), {
    ...DEFAULT_DISPLAY,
  });
  return counts;
}

/** A pointer event as a mouse makes it, at a point on the canvas. */
function mouse(canvas: HTMLCanvasElement, type: string, init: Record<string, unknown>): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(
    ev,
    Object.fromEntries(
      Object.entries({ pointerType: 'mouse', pointerId: 1, clientX: 30, clientY: 30, ...init }).map(
        ([k, v]) => [k, { value: v }],
      ),
    ),
  );
  canvas.dispatchEvent(ev);
}

describe('a click with Control held', () => {
  it('marks as a right click does, and its lift opens nothing', () => {
    const b = board();
    mouse(b.canvas, 'pointerdown', { button: 0, ctrlKey: true });
    mouse(b.canvas, 'pointerup', { button: 0, ctrlKey: true });
    expect(b).toMatchObject({ marks: 1, opens: 0 });
    // The key may have been let go before the lift; the press still counts as the mark.
    mouse(b.canvas, 'pointerdown', { button: 0, ctrlKey: true });
    mouse(b.canvas, 'pointerup', { button: 0, ctrlKey: false });
    expect(b).toMatchObject({ marks: 2, opens: 0 });
    // A plain click still opens.
    mouse(b.canvas, 'pointerdown', { button: 0, ctrlKey: false });
    mouse(b.canvas, 'pointerup', { button: 0, ctrlKey: false });
    expect(b).toMatchObject({ marks: 2, opens: 1 });
  });
});
