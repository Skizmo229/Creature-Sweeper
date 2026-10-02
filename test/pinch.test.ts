/**
 * Pinch-zoom arithmetic. The gesture itself is canvas plumbing and is checked
 * in the browser; what can go wrong quietly is the geometry — a zoom that
 * drifts the board out from under the fingers, or ignores the zoom limits.
 */

import { describe, expect, it } from 'vitest';
import { pinchStart, pinchView } from '../src/ui/pinch.js';

const view = { cell: 20, originX: 10, originY: 30 };

describe('pinch-zoom', () => {
  it('scales the cell size with the spread of the fingers', () => {
    const s = pinchStart({ x: 100, y: 100 }, { x: 200, y: 100 }, view);
    expect(pinchView(s, { x: 50, y: 100 }, { x: 250, y: 100 }, 8, 64).cell).toBe(40); // twice as far apart
    expect(pinchView(s, { x: 125, y: 100 }, { x: 175, y: 100 }, 8, 64).cell).toBe(10); // half
  });

  it('keeps the board point under the midpoint where it was', () => {
    const s = pinchStart({ x: 100, y: 100 }, { x: 200, y: 100 }, view);
    const v = pinchView(s, { x: 50, y: 100 }, { x: 250, y: 100 }, 8, 64);
    // The midpoint (150, 100) sat over board point ((150-10)/20, (100-30)/20).
    expect((150 - v.originX) / v.cell).toBeCloseTo((150 - view.originX) / view.cell, 1);
    expect((100 - v.originY) / v.cell).toBeCloseTo((100 - view.originY) / view.cell, 1);
  });

  it('pans with two fingers moving together', () => {
    const s = pinchStart({ x: 100, y: 100 }, { x: 200, y: 100 }, view);
    const v = pinchView(s, { x: 130, y: 140 }, { x: 230, y: 140 }, 8, 64);
    expect(v.cell).toBe(20);
    expect([v.originX, v.originY]).toEqual([view.originX + 30, view.originY + 40]);
  });

  it('respects the zoom limits the wheel respects', () => {
    const s = pinchStart({ x: 100, y: 100 }, { x: 110, y: 100 }, view);
    expect(pinchView(s, { x: 0, y: 100 }, { x: 1000, y: 100 }, 8, 48).cell).toBe(48);
    expect(pinchView(s, { x: 104, y: 100 }, { x: 106, y: 100 }, 12, 48).cell).toBe(12);
  });

  it('survives two fingers landing on the same spot', () => {
    const s = pinchStart({ x: 100, y: 100 }, { x: 100, y: 100 }, view);
    expect(Number.isFinite(pinchView(s, { x: 100, y: 100 }, { x: 120, y: 100 }, 8, 64).cell)).toBe(
      true,
    );
  });
});
