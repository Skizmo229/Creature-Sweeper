/**
 * Where things are on the canvas: cell centres, content boxes, hit-testing and the fitted cell
 * size, for square and hex grids. Pure arithmetic over a `Layout`; nothing here draws.
 *
 * Sizing quantises the CELL, not a zoom multiplier. Every whole pixel size is available (17,
 * 18, 19...) rather than just multiples of 16, and an integer cell size keeps every edge on a
 * pixel boundary, so the art stays crisp without a zoom factor at all.
 */

import type { Game } from '../../engine/game.js';
import type { Cell } from '../../engine/types.js';
import { hexAt, hexBoardSize, hexCentre, hexRadius, hexRowStep } from '../hexgeom.js';

/**
 * Floor used only when fitting, for boards too large to fit even when shrunk; below this the
 * board pans instead. Manual zoom never reaches it: the fitted size is the smallest the player
 * can get to.
 */
export const MIN_CELL = 8;

/**
 * Cells of a wrapped board shown beyond each joined edge. One is enough: what the player needs
 * is to see the cells immediately across the seam, because those are the ones that are genuinely
 * adjacent. More than that just shrinks the real board.
 */
export const GHOST_CELLS = 1;

/** The numbers every position on the canvas is derived from. */
export interface Layout {
  readonly hex: boolean;
  readonly cellPx: number;
  readonly originX: number;
  readonly originY: number;
  readonly cols: number;
  readonly rows: number;
}

/** The board's size in CSS pixels at this layout's cell size. */
export function boardSize(layout: Layout): { w: number; h: number } {
  const { cols, rows, cellPx } = layout;
  return layout.hex ? hexBoardSize(cols, rows, cellPx) : { w: cellPx * cols, h: cellPx * rows };
}

/** Centre of a cell, in canvas pixels. */
export function centreOf(layout: Layout, col: number, row: number): { cx: number; cy: number } {
  const { cellPx, originX, originY } = layout;
  if (!layout.hex) {
    return { cx: originX + col * cellPx + cellPx / 2, cy: originY + row * cellPx + cellPx / 2 };
  }
  const { cx, cy } = hexCentre(col, row, cellPx);
  return { cx: originX + cx, cy: originY + cy };
}

/**
 * The square a glyph or number is drawn into. On hex it has to shrink so the corners stay inside
 * the slanted sides.
 */
export function contentBox(
  layout: Layout,
  cx: number,
  cy: number,
): { x: number; y: number; size: number } {
  const size = layout.hex ? layout.cellPx * 0.78 : layout.cellPx;
  return { x: cx - size / 2, y: cy - size / 2, size };
}

/** The grid coordinate under a canvas point, before wrapping is folded in. */
export function coordsAt(layout: Layout, px: number, py: number): { col: number; row: number } {
  const x = px - layout.originX;
  const y = py - layout.originY;
  if (!layout.hex)
    return { col: Math.floor(x / layout.cellPx), row: Math.floor(y / layout.cellPx) };
  // Hexes do not tile a rectangle, so flooring cannot work. hexgeom does the cube-rounding, and
  // is unit-tested against every cell at several zooms.
  return hexAt(x, y, layout.cellPx);
}

/**
 * Map a grid coordinate to a cell, folding wrapped edges back in. On a wrapped board this is what
 * makes the ghost band clickable: a click on the repeat lands on the real cell it is showing.
 */
export function resolveWrapped(game: Game, x: number, y: number): Cell | null {
  const w = game.config.width;
  const h = game.config.height;
  const wrap = game.config.wrap;
  const wx = wrap !== 'none' ? ((x % w) + w) % w : x;
  const wy = wrap === 'both' ? ((y % h) + h) % h : y;
  return game.cellAt(wx, wy);
}

/**
 * The largest whole-pixel cell that fits the board into a stage of this size. Hex rows nest, so
 * height costs 0.75 of a hex per row plus one row's overhang, and odd rows push the board half a
 * cell wider. A wrapped edge needs a band of board drawn beyond it, so room is reserved for it.
 */
export function fittedCellFor(game: Game, availW: number, availH: number): number {
  const hex = game.config.topology === 'hex';
  const padX = game.config.wrap !== 'none' ? 2 * GHOST_CELLS : 0;
  const padY = game.config.wrap === 'both' ? 2 * GHOST_CELLS : 0;
  const byW = hex ? availW / (game.config.width + padX + 0.5) : availW / (game.config.width + padX);
  const byH = hex
    ? availH / (hexRowStep(1) * (game.config.height - 1) + 2 * hexRadius(1))
    : availH / (game.config.height + padY);
  return Math.floor(Math.min(byW, byH));
}

/**
 * Which neighbour lies beyond each edge of a cell, for the board's outline. The order matches the
 * order the corners come in, so edge `i` runs from corner `i` to corner `i+1` and faces the
 * neighbour at `dirs[i]`. Squares: top, right, bottom, left.
 */
export const SQUARE_EDGE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Hexes: `hexPoints` starts at the top vertex and runs clockwise, so the edges face up-right,
 * right, down-right, down-left, left, up-left. Which grid cell that is depends on the row's
 * parity, exactly as the engine's hex directions do: odd rows sit half a hex to the right.
 */
export const HEX_EDGE_DIRS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // even rows
  [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ],
  // odd rows
  [
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
];

/** A square cell's corners, clockwise from the top-left. */
export function squareCorners(cx: number, cy: number, half: number): Array<[number, number]> {
  return [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
  ];
}
