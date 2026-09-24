/**
 * Pointer, wheel and touch input on the board canvas: clicks, right-clicks, panning when the
 * board is bigger than its stage, and two-finger pinch-zoom. Owns the drag and touch state and
 * talks to the view through `InputHost`, which is everything the input is allowed to do.
 */

import type { Cell } from '../../engine/types.js';
import { type PinchStart, pinchStart, pinchTo } from '../pinch.js';

export interface InputHost {
  readonly canvas: HTMLCanvasElement;
  /** False before a game is set; input is ignored. */
  readonly ready: boolean;
  readonly cellPx: number;
  readonly originX: number;
  readonly originY: number;
  /** Zoom bounds for a pinch. */
  readonly fittedCell: number;
  readonly maxCell: number;
  /** Only true when the board is larger than the viewport, so panning exists. */
  readonly canPan: boolean;
  readonly hovered: Cell | null;
  cellAtClient(clientX: number, clientY: number): Cell | null;
  /** Scale about a canvas point, so wheel-zoom keeps what is under the cursor put. */
  zoomAt(nextCell: number, px: number, py: number): void;
  /** Move the board's origin (a pan); the host clamps and repaints. */
  panTo(originX: number, originY: number): void;
  /** A pinch's result: a new cell size and origin at once. */
  pinchTo(cell: number, originX: number, originY: number): void;
  /** The cursor moved onto a cell, or off the board. */
  hover(cell: Cell | null): void;
  /** The cursor left the canvas. */
  leave(): void;
  onOpen(x: number, y: number): void;
  onCycleMark(x: number, y: number): void;
}

export class BoardInput {
  private dragging = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0, ox: 0, oy: 0 };
  /**
   * Fingers on the board, for pinch-zoom. Touch only: a mouse has one pointer, and a mouse
   * button released outside the window can leave its pointer behind, which here would turn the
   * next touch into a phantom pinch.
   */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch: PinchStart | null = null;
  /**
   * This touch has been a pinch at some point, so no lift in it may open a cell. A two-finger
   * touch used to do exactly that, which on a phone is a way to end a run by zooming.
   */
  private gesture = false;

  constructor(private readonly host: InputHost) {}

  attach(): void {
    const { host } = this;
    const c = host.canvas;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Auto-fit picks a sensible size, but big boards still reward leaning in.
    c.addEventListener(
      'wheel',
      (e) => {
        if (!host.ready) return;
        e.preventDefault();
        const rect = c.getBoundingClientRect();
        const step = e.deltaY < 0 ? 2 : -2;
        host.zoomAt(host.cellPx + step, e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );

    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        const cell = host.cellAtClient(e.clientX, e.clientY);
        if (cell) host.onCycleMark(cell.x, cell.y);
        return;
      }
      if (e.pointerType === 'touch') {
        if (!this.touches.size) this.gesture = false;
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          this.beginPinch();
          return;
        }
        if (this.touches.size > 2) return;
      }
      this.dragMoved = false;
      // Only arm a drag when there is somewhere to drag to. On a board that fits, a click is
      // unambiguous and never has to survive drag tracking.
      if (host.canPan) {
        this.dragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY, ox: host.originX, oy: host.originY };
        try {
          c.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic or already-released pointers cannot be captured; the click path below
          // still works without capture.
        }
      }
    });

    c.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch && this.touches.size >= 2) {
          this.movePinch();
          return;
        }
        if (this.gesture) return;
      }
      if (this.dragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          this.dragMoved = true;
          host.panTo(this.dragStart.ox + dx, this.dragStart.oy + dy);
        }
        return;
      }
      const cell = host.cellAtClient(e.clientX, e.clientY);
      if (cell !== host.hovered) host.hover(cell);
    });

    const endDrag = (e: PointerEvent) => {
      if (e.button === 2) return; // right-click was handled on pointerdown
      if (this.touches.delete(e.pointerId)) {
        if (this.touches.size < 2) this.pinch = null;
        // The lift that ends a pinch opens nothing, and nor does the last finger of it coming
        // up later.
        if (this.gesture) return;
      }
      if (this.dragging) {
        this.dragging = false;
        try {
          if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
        } catch {
          // Capture may already be gone; nothing to release.
        }
      }
      if (this.dragMoved) return; // a pan, not a click
      const cell = host.cellAtClient(e.clientX, e.clientY);
      if (cell) host.onOpen(cell.x, cell.y);
    };
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', (e) => {
      this.dragging = false;
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
    });

    c.addEventListener('pointerleave', () => host.leave());
  }

  /**
   * Two fingers are down: from here the gesture is a pinch, whatever the first finger was doing,
   * and it stays one until every finger is up. Both are captured so the pinch survives a finger
   * straying off the canvas.
   */
  private beginPinch(): void {
    const { host } = this;
    const [a, b] = [...this.touches.values()];
    const rect = host.canvas.getBoundingClientRect();
    this.pinch = pinchStart(a!.x - rect.left, a!.y - rect.top, b!.x - rect.left, b!.y - rect.top, {
      cell: host.cellPx,
      originX: host.originX,
      originY: host.originY,
    });
    this.gesture = true;
    this.dragging = false;
    this.dragMoved = true;
    for (const id of this.touches.keys()) {
      try {
        host.canvas.setPointerCapture(id);
      } catch {
        /* already released */
      }
    }
  }

  private movePinch(): void {
    if (!this.pinch) return;
    const { host } = this;
    const [a, b] = [...this.touches.values()];
    const rect = host.canvas.getBoundingClientRect();
    const next = pinchTo(
      this.pinch,
      a!.x - rect.left,
      a!.y - rect.top,
      b!.x - rect.left,
      b!.y - rect.top,
      host.fittedCell,
      Math.max(host.fittedCell, host.maxCell),
    );
    host.pinchTo(next.cell, next.originX, next.originY);
  }
}
