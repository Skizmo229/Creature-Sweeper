/**
 * Pinch-zoom arithmetic. The gesture itself is canvas plumbing and is checked
 * in the browser; what can go wrong quietly is the geometry — a zoom that
 * drifts the board out from under the fingers, or ignores the zoom limits.
 */

import { describe, expect, it } from 'vitest';
import { pinchStart, pinchTo } from '../src/ui/pinch.js';

const view = { cell: 20, originX: 10, originY: 30 };

describe('pinch-zoom', () => {
  it('scales the cell size with the spread of the fingers', () => {
    const s = pinchStart(100, 100, 200, 100, view);
    expect(pinchTo(s, 50, 100, 250, 100, 8, 64).cell).toBe(40);   // twice as far apart
    expect(pinchTo(s, 125, 100, 175, 100, 8, 64).cell).toBe(10);  // half
  });

  it('keeps the board point under the midpoint where it was', () => {
    const s = pinchStart(100, 100, 200, 100, view);
    const v = pinchTo(s, 50, 100, 250, 100, 8, 64);
    // The midpoint (150, 100) sat over board point ((150-10)/20, (100-30)/20).
    expect((150 - v.originX) / v.cell).toBeCloseTo((150 - view.originX) / view.cell, 1);
    expect((100 - v.originY) / v.cell).toBeCloseTo((100 - view.originY) / view.cell, 1);
  });

  it('pans with two fingers moving together', () => {
    const s = pinchStart(100, 100, 200, 100, view);
    const v = pinchTo(s, 130, 140, 230, 140, 8, 64);
    expect(v.cell).toBe(20);
    expect([v.originX, v.originY]).toEqual([view.originX + 30, view.originY + 40]);
  });

  it('respects the zoom limits the wheel respects', () => {
    const s = pinchStart(100, 100, 110, 100, view);
    expect(pinchTo(s, 0, 100, 1000, 100, 8, 48).cell).toBe(48);
    expect(pinchTo(s, 104, 100, 106, 100, 12, 48).cell).toBe(12);
  });

  it('survives two fingers landing on the same spot', () => {
    const s = pinchStart(100, 100, 100, 100, view);
    expect(Number.isFinite(pinchTo(s, 100, 100, 120, 100, 8, 64).cell)).toBe(true);
  });
});
