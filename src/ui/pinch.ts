/**
 * Pinch-zoom arithmetic, kept apart from `BoardView` so it can be tested.
 *
 * The test pass compiles with no DOM library at all, and `boardview.ts` is
 * made of canvas calls, so anything a test needs from it has to live somewhere
 * a Node test can import without dragging `CanvasRenderingContext2D` along —
 * the same reason `preview.ts` builds boards and renders nothing.
 */

/** What was true when the second finger landed. */
export interface PinchStart {
  /** Distance between the two fingers, in CSS pixels. */
  readonly dist: number;
  /** Cell size at that moment. */
  readonly cell: number;
  /** The board point under the midpoint, in cells, so it can be kept there. */
  readonly bx: number;
  readonly by: number;
}

export interface PinchView {
  readonly cell: number;
  readonly originX: number;
  readonly originY: number;
}

/** Record the start of a pinch from the two fingers and the current view. */
export function pinchStart(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  view: PinchView,
): PinchStart {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  return {
    dist: Math.max(1, Math.hypot(ax - bx, ay - by)),
    cell: view.cell,
    bx: (mx - view.originX) / view.cell,
    by: (my - view.originY) / view.cell,
  };
}

/**
 * The view for the fingers where they are now.
 *
 * Cell size scales with the spread of the fingers, clamped to the same limits
 * the wheel respects, and the board point that started under the midpoint is
 * kept under the midpoint wherever it has moved to — which is what makes one
 * gesture zoom and pan at once, the way a map does. Whole pixels, because the
 * board is drawn on a pixel grid and a fractional cell blurs every edge.
 */
export function pinchTo(
  start: PinchStart,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  minCell: number,
  maxCell: number,
): PinchView {
  const dist = Math.max(1, Math.hypot(ax - bx, ay - by));
  const cell = Math.max(minCell, Math.min(maxCell, Math.round((start.cell * dist) / start.dist)));
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  return {
    cell,
    originX: Math.round(mx - start.bx * cell),
    originY: Math.round(my - start.by * cell),
  };
}
