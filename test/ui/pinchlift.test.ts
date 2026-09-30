// @vitest-environment happy-dom
/**
 * A pinch that loses a finger goes on with the fingers still down, measured from where they are
 * then: the pair it began with is gone, and measuring the new pair against the old spread and the
 * old midpoint would jump the zoom and the board at the next move.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardInput, type InputHost } from '../../src/ui/board/input.js';

type View = { cell: number; originX: number; originY: number };

/** An input on a bare canvas, with a host that keeps the view each pinch asks for. */
function fingers(): {
  views: View[];
  touch: (type: string, id: number, x: number, y: number) => void;
} {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const views: View[] = [];
  const host = {
    canvas,
    ready: true,
    cellPx: 20,
    originX: 0,
    originY: 0,
    fittedCell: 10,
    maxCell: 80,
    canPan: false,
    longPressMs: 0,
    hovered: null,
    cellAtClient: () => null,
    zoomAt: () => undefined,
    panTo: () => undefined,
    pinchTo(cell: number, originX: number, originY: number) {
      Object.assign(host, { cellPx: cell, originX, originY });
      views.push({ cell, originX, originY });
    },
    hover: () => undefined,
    leave: () => undefined,
    onOpen: () => undefined,
    onCycleMark: () => undefined,
  } satisfies InputHost;
  new BoardInput(host).attach();
  const touch = (type: string, id: number, x: number, y: number): void => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(ev, {
      pointerType: { value: 'touch' },
      pointerId: { value: id },
      clientX: { value: x },
      clientY: { value: y },
      button: { value: 0 },
      ctrlKey: { value: false },
    });
    canvas.dispatchEvent(ev);
  };
  return { views, touch };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a pinch that loses a finger', () => {
  for (const end of ['pointerup', 'pointercancel']) {
    it(`goes on from where the fingers still down are, after a ${end}`, () => {
      const { views, touch } = fingers();
      touch('pointerdown', 1, 100, 100);
      touch('pointerdown', 2, 200, 100);
      touch('pointermove', 2, 220, 100);
      const zoomed = views.at(-1)!;
      expect(zoomed.cell).toBe(24);
      // A third finger lands, and the first of the pinch lifts.
      touch('pointerdown', 3, 400, 300);
      touch(end, 1, 100, 100);
      touch('pointermove', 2, 221, 100);
      const next = views.at(-1)!;
      expect(next.cell).toBe(zoomed.cell);
      expect(Math.abs(next.originX - zoomed.originX)).toBeLessThanOrEqual(1);
      expect(Math.abs(next.originY - zoomed.originY)).toBeLessThanOrEqual(1);
    });
  }

  it('is over when one finger is left, which then moves nothing', () => {
    const { views, touch } = fingers();
    touch('pointerdown', 1, 100, 100);
    touch('pointerdown', 2, 200, 100);
    touch('pointermove', 2, 220, 100);
    const count = views.length;
    touch('pointerup', 1, 100, 100);
    touch('pointermove', 2, 300, 200);
    expect(views).toHaveLength(count);
  });
});
