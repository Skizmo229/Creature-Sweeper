/**
 * What is drawn over or around the cells: the ghost band beyond a wrapped edge, the board's
 * silhouette, the placement rule's box rules and bonds, the wrap seams, and the
 * cursor highlight. Each is its own pass over the finished board, because a cell drawn later would
 * paint over its neighbour's half of a shared line.
 */

import { placementRule } from '../../engine/placement/registry.js';
import type { Cell } from '../../engine/types.js';
import { hexPoints, hexRadius } from '../hexgeom.js';
import type { HighlightStyle } from '../settings.js';
import { BOARD_OUTLINE, BOND_COLOR, BOX_RULE, MARK_COLOR, OUT_OF_REACH_COLOR } from '../theme.js';
import {
  GHOST_CELLS,
  HEX_EDGE_DIRS,
  SQUARE_EDGE_DIRS,
  boardSize,
  centreOf,
  squareCorners,
} from './geometry.js';
import { type Paint, drawCovered, drawOpen, tracePath } from './paint.js';

/**
 * Repeat the board's far edge just beyond each joined edge, dimmed, so a wrapped board reads as
 * continuous instead of simply stopping.
 */
export function drawGhostBand(p: Paint): void {
  const { ctx, game, layout } = p;
  const wrap = game.config.wrap;
  if (wrap === 'none') return;
  const wrapY = wrap === 'both';

  const offsets: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
  ];
  if (wrapY) offsets.push([0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]);

  const w = game.config.width;
  const h = game.config.height;
  const size = boardSize(layout);
  ctx.save();
  ctx.globalAlpha = 0.3;

  for (const [ox, oy] of offsets) {
    const dx = ox * size.w;
    const dy = oy * size.h;
    for (const row of game.grid) {
      for (const cell of row) {
        // Only the strip that will actually land next to the seam.
        if (ox === -1 && cell.x < w - GHOST_CELLS) continue;
        if (ox === 1 && cell.x >= GHOST_CELLS) continue;
        if (oy === -1 && cell.y < h - GHOST_CELLS) continue;
        if (oy === 1 && cell.y >= GHOST_CELLS) continue;

        if (!cell.present) continue;
        const { cx, cy } = centreOf(layout, cell.x, cell.y);
        if (cell.open) drawOpen(p, cell, cx + dx, cy + dy);
        else drawCovered(p, cell, cx + dx, cy + dy);
      }
    }
  }
  ctx.restore();
}

/**
 * The white line where the board meets the background: only the edges with nothing on the other
 * side, the outer rim and the rim of every hole. On a rectangle that is a box; on a shaped board
 * it IS the shape. Worked out per cell rather than by stroking every cell under the fills, which
 * does not work because the fills are inset (decision 0007). Adjacency here is deliberately not
 * `neighboursOf`, which wraps: the board plainly stops at the left edge whatever the rules say.
 */
export function drawSilhouette(p: Paint): void {
  const { ctx, game, layout } = p;
  const solid = (x: number, y: number): boolean => game.grid[y]?.[x]?.present === true;

  ctx.save();
  ctx.strokeStyle = BOARD_OUTLINE;
  ctx.lineWidth = Math.max(1.5, layout.cellPx / 12);
  ctx.lineCap = 'square';
  ctx.beginPath();

  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present) continue;
      const { cx, cy } = centreOf(layout, cell.x, cell.y);
      // The cell's true bounds, not the inset path the fills use, so the outline lands on the
      // board's actual edge.
      const corners = layout.hex
        ? hexPoints(cx, cy, hexRadius(layout.cellPx))
        : squareCorners(cx, cy, layout.cellPx / 2);
      const dirs = layout.hex ? HEX_EDGE_DIRS[cell.y & 1]! : SQUARE_EDGE_DIRS;

      for (let i = 0; i < corners.length; i++) {
        const [dx, dy] = dirs[i]!;
        if (solid(cell.x + dx, cell.y + dy)) continue;
        const [ax, ay] = corners[i]!;
        const [bx, by] = corners[(i + 1) % corners.length]!;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    }
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Heavier rules along the placement rule's box boundaries (Sudoku's 3x3 boxes). Every cell already
 * carries a ~size/10 edge, so a rule of similar weight is invisible among them; it has to be
 * decisively heavier to read as a boundary. One stroke of constant width over the whole board is
 * what makes it read as structure.
 */
export function drawBoxRules(p: Paint): void {
  const { ctx, game, layout } = p;
  const box = placementRule(game.config.placement).display.boxRules;
  if (box === 0) return;
  const { width, height } = game.config;
  const size = layout.cellPx;
  const origin = centreOf(layout, 0, 0);
  const left = origin.cx - size / 2;
  const top = origin.cy - size / 2;

  ctx.save();
  ctx.strokeStyle = BOX_RULE;
  ctx.lineWidth = Math.max(3, size / 4.5);
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (let i = 0; i <= Math.max(width, height); i += box) {
    const at = i * size;
    if (i <= width) {
      ctx.moveTo(left + at, top);
      ctx.lineTo(left + at, top + height * size);
    }
    if (i <= height) {
      ctx.moveTo(left, top + at);
      ctx.lineTo(left + width * size, top + at);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Tie open creatures that touch, where the placement rule says touching means belonging together:
 * the two halves of a pair, the consecutive members of a congo line (orthogonal contacts only).
 * Only where BOTH are open, because that is exactly when the player knows which cell the partner
 * is. Read through `neighboursOf`, so a bond across a seam or between hexes needs no special case;
 * a wrapped pair is a board apart on screen and is not drawn, the seam already says the edges are
 * joined.
 */
export function drawBonds(p: Paint): void {
  const { ctx, game, layout } = p;
  const bonds = placementRule(game.config.placement).display.bonds;
  if (bonds === 'none') return;
  const orthogonal = bonds === 'orthogonal';
  ctx.save();
  ctx.strokeStyle = BOND_COLOR;
  ctx.lineWidth = Math.max(1, layout.cellPx / 12);
  ctx.lineCap = 'round';
  ctx.beginPath();

  const w = game.config.width;
  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present || !cell.open || cell.tier === 0) continue;
      for (const n of game.neighboursOf(cell)) {
        if (!n.open || n.tier === 0) continue;
        // The `<` keeps each bond from being drawn twice, once from either end.
        if (n.y * w + n.x < cell.y * w + cell.x) continue;
        if (orthogonal && n.x !== cell.x && n.y !== cell.y) continue;
        const a = centreOf(layout, cell.x, cell.y);
        const b = centreOf(layout, n.x, n.y);
        if (Math.abs(a.cx - b.cx) > layout.cellPx * 2 || Math.abs(a.cy - b.cy) > layout.cellPx * 2)
          continue;
        // Inset off both centres, so the tie sits in the gap between the two cells and neither
        // glyph is painted over.
        const t = 0.3;
        ctx.moveTo(a.cx + (b.cx - a.cx) * t, a.cy + (b.cy - a.cy) * t);
        ctx.lineTo(b.cx - (b.cx - a.cx) * t, b.cy - (b.cy - a.cy) * t);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Dashed line where the board truly ends and the repeat begins. Drawn per cell rather than as
 * one line down the bounding box, because on a shaped board most of a joined edge is hole; on a
 * rectangle every cell of the edge is there, so this is the same line it always drew.
 */
export function drawSeams(p: Paint): void {
  const { ctx, game, layout } = p;
  const wrap = game.config.wrap;
  if (wrap === 'none') return;
  ctx.save();
  ctx.strokeStyle = MARK_COLOR;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();

  const w = game.config.width;
  const h = game.config.height;
  const half = layout.cellPx / 2;
  const seam = (cell: { x: number; y: number }, vertical: boolean, far: boolean): void => {
    const { cx, cy } = centreOf(layout, cell.x, cell.y);
    const at = (vertical ? cx : cy) + (far ? half : -half);
    if (vertical) {
      ctx.moveTo(at, cy - half);
      ctx.lineTo(at, cy + half);
    } else {
      ctx.moveTo(cx - half, at);
      ctx.lineTo(cx + half, at);
    }
  };

  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present) continue;
      if (cell.x === 0) seam(cell, true, false);
      if (cell.x === w - 1) seam(cell, true, true);
      if (wrap === 'both') {
        if (cell.y === 0) seam(cell, false, false);
        if (cell.y === h - 1) seam(cell, false, true);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Light the cell under the cursor, and depending on the style its surroundings too.
 * 'neighbours' asks the engine what is genuinely adjacent (six on hex, across a seam on a wrapped
 * board); 'block' is the literal 3x3 of grid coordinates and deliberately does not fold wrapped
 * edges in. Colour says whether the click would land: each cell is asked for itself, so hovering
 * the edge of your reach shows the boundary rather than just which side the centre is on.
 */
export function drawHighlight(
  p: Paint,
  hovered: Cell,
  style: HighlightStyle,
  lands: (cell: Cell) => boolean,
): void {
  const { ctx, game, layout } = p;
  ctx.save();
  ctx.lineWidth = 2;

  if (style !== 'cell') {
    ctx.globalAlpha = 0.4;
    const around: Cell[] = [];
    if (style === 'neighbours') {
      around.push(...game.neighboursOf(hovered));
    } else {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          // Clipped to cells that exist rather than drawn over holes and off-board space.
          const cell = game.cellAt(hovered.x + dx, hovered.y + dy);
          if (cell) around.push(cell);
        }
      }
    }
    for (const n of around) {
      const c = centreOf(layout, n.x, n.y);
      ctx.strokeStyle = lands(n) ? MARK_COLOR : OUT_OF_REACH_COLOR;
      tracePath(p, c.cx, c.cy, 3);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const { cx, cy } = centreOf(layout, hovered.x, hovered.y);
  ctx.strokeStyle = lands(hovered) ? MARK_COLOR : OUT_OF_REACH_COLOR;
  tracePath(p, cx, cy, 2);
  ctx.stroke();
  ctx.restore();
}
