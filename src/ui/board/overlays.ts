/**
 * What is drawn over or around the cells: the ghost band beyond a wrapped edge, the board's
 * silhouette, the placement rule's box rules and bonds, the wrap seams, and the
 * cursor highlight. Each is its own pass over the finished board, because a cell drawn later would
 * paint over its neighbour's half of a shared line.
 */

import { placementRule } from '../../engine/placement/registry.js';
import type { Cell } from '../../engine/types.js';
import type { Lesson } from '../../sim/tutor.js';
import { hexPoints, hexRadius } from '../hexgeom.js';
import type { HighlightStyle } from '../settings.js';
import {
  BOARD_OUTLINE,
  BOND_COLOR,
  BOX_RULE,
  MARK_COLOR,
  MARK_OUTLINE,
  OUT_OF_REACH_COLOR,
  TUTOR_COLOR,
  tierColor,
} from '../theme.js';
import { setNumberFont } from './digits.js';
import {
  GHOST_CELLS,
  HEX_EDGE_DIRS,
  SQUARE_EDGE_DIRS,
  boardSize,
  centreOf,
  contentBox,
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

/** How far a sprinkle reaches past the centre of each of its cells, in cells. */
const SPRINKLE_REACH = 0.24;
/** A sprinkle's half-width, in cells. */
const SPRINKLE_HALF_WIDTH = 0.15;
/** Its rim, drawn round the fill so a sprinkle reads on a pale tile and on a dark one. */
const SPRINKLE_RIM = 'rgba(40, 8, 24, 0.5)';
/** The shine along a sprinkle, drawn only where a cell is big enough for it to read as one. */
const SPRINKLE_SHINE = 'rgba(255, 255, 255, 0.4)';
const SPRINKLE_SHINE_MIN_CELL = 16;

/**
 * Every covered creature where it stands, where the placement rule shows them (SPRINKLE DONUT):
 * each pair as one sprinkle lying across its two cells, in the palette's danger colour, so two
 * pairs that touch are still two sprinkles. Once one of a pair is beaten, the half left covered
 * keeps its end of the sprinkle, broken off where the two cells meet.
 */
export function drawSprinkles(p: Paint): void {
  const { ctx, game, layout } = p;
  if (!placementRule(game.config.placement).display.showsCreatures) return;
  const s = layout.cellPx;
  const reach = s * SPRINKLE_REACH;
  const half = Math.max(1.5, s * SPRINKLE_HALF_WIDTH);
  const rim = Math.max(1, s / 20);
  const w = game.config.width;
  const pieces: Array<[number, number, number, number]> = [];

  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present || cell.open || cell.occupied || cell.tier === 0 || !cell.partner) continue;
      const mate = game.grid[cell.partner.y]![cell.partner.x]!;
      const covered = !mate.open && !mate.occupied;
      // Both covered: one sprinkle, drawn from the end with the lower index.
      if (covered && mate.y * w + mate.x < cell.y * w + cell.x) continue;
      const a = centreOf(layout, cell.x, cell.y);
      const b = centreOf(layout, mate.x, mate.y);
      const length = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      const ux = (b.cx - a.cx) / length;
      const uy = (b.cy - a.cy) / length;
      // A round cap adds `half` to each end, so the line stops that much short of where it ends.
      const from = reach - half;
      const to = covered ? length + reach - half : length / 2 - half;
      pieces.push([a.cx - ux * from, a.cy - uy * from, a.cx + ux * to, a.cy + uy * to]);
    }
  }
  if (!pieces.length) return;

  ctx.save();
  ctx.lineCap = 'round';
  // One sprinkle at a time, rim, fill and shine, so where two cross the later lies on top.
  const stroke = (piece: readonly number[], style: string, width: number, nudge = 0): void => {
    const [x0, y0, x1, y1] = piece as [number, number, number, number];
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0 - nudge, y0 - nudge);
    ctx.lineTo(x1 - nudge, y1 - nudge);
    ctx.stroke();
  };
  for (const piece of pieces) {
    stroke(piece, SPRINKLE_RIM, 2 * (half + rim));
    stroke(piece, p.theme.hot, 2 * half);
    if (s >= SPRINKLE_SHINE_MIN_CELL) stroke(piece, SPRINKLE_SHINE, half * 0.5, half * 0.3);
  }
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
 * edges in. Colour says whether the click would land, in the player's `color` where it would and
 * red where it would not: each cell is asked for itself, so hovering the edge of your reach shows
 * the boundary rather than just which side the centre is on.
 */
export function drawHighlight(
  p: Paint,
  hovered: Cell,
  style: HighlightStyle,
  color: string,
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
      ctx.strokeStyle = lands(n) ? color : OUT_OF_REACH_COLOR;
      tracePath(p, c.cx, c.cy, 3);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const { cx, cy } = centreOf(layout, hovered.x, hovered.y);
  ctx.strokeStyle = lands(hovered) ? color : OUT_OF_REACH_COLOR;
  tracePath(p, cx, cy, 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Point at a lesson (docs/teaching-plan.md, Part 1): the numbers and cells its proof read, ringed
 * in the tutor's colour with the covered cells each number sees lit faintly around it; what it
 * concludes, washed in the mark green where it is safe to open, ringed in the tier's colour with
 * the tier written on it where it is named, and ringed dashed with the candidates where it is
 * only narrowed. Nothing here is a mark: the player still writes every one.
 */
export function drawLesson(p: Paint, lesson: Lesson): void {
  const { ctx, layout } = p;
  ctx.save();
  ctx.lineWidth = 2;

  // The rings each number sees, faint, so the shape of the proof is visible before its parts.
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = TUTOR_COLOR;
  for (const c of lesson.why.constraints) {
    for (const n of c.unknown) {
      const { cx, cy } = centreOf(layout, n.x, n.y);
      tracePath(p, cx, cy, 3);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  for (const cell of [...lesson.why.constraints.map((c) => c.cell), ...lesson.why.cells]) {
    const { cx, cy } = centreOf(layout, cell.x, cell.y);
    ctx.strokeStyle = TUTOR_COLOR;
    ctx.lineWidth = 3;
    tracePath(p, cx, cy, 2);
    ctx.stroke();
  }
  // A beaten creature's number shows only while hovered, and a proof that read one has to be
  // checkable without the cursor leaving the lesson, so the number is written on it for now.
  for (const c of lesson.why.constraints) {
    if (c.cell.tier > 0) {
      const { cx, cy } = centreOf(layout, c.cell.x, c.cell.y);
      writeOnCell(p, cx, cy, String(c.cell.num), TUTOR_COLOR, 0.5);
    }
  }

  ctx.lineWidth = 2;
  for (const cell of lesson.open) {
    const { cx, cy } = centreOf(layout, cell.x, cell.y);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = MARK_COLOR;
    tracePath(p, cx, cy, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = MARK_COLOR;
    ctx.stroke();
  }

  for (const [cell, tier] of lesson.mark) {
    const { cx, cy } = centreOf(layout, cell.x, cell.y);
    ctx.strokeStyle = tierColor(tier);
    tracePath(p, cx, cy, 2);
    ctx.stroke();
    writeOnCell(p, cx, cy, String(tier), tierColor(tier), 0.58);
  }

  ctx.setLineDash([4, 3]);
  for (const [cell, mask] of lesson.narrow) {
    const { cx, cy } = centreOf(layout, cell.x, cell.y);
    ctx.strokeStyle = TUTOR_COLOR;
    tracePath(p, cx, cy, 2);
    ctx.stroke();
    const tiers: string[] = [];
    for (let t = 0; t < 31; t++) if (mask & (1 << t)) tiers.push(String(t));
    // Candidates running from empty up to a ceiling are the ceiling, which is what a bound says.
    const capped = (mask & (mask + 1)) === 0 && tiers.length > 2;
    const label = capped ? `\u2264${tiers.length - 1}` : tiers.join('');
    writeOnCell(p, cx, cy, label, TUTOR_COLOR, label.length > 2 ? 0.3 : 0.42);
  }
  ctx.restore();
}

/** Text centred on a cell, outlined as a mark is so it survives any tile. */
function writeOnCell(p: Paint, cx: number, cy: number, text: string, color: string, scale: number) {
  const { ctx } = p;
  const box = contentBox(p.layout, cx, cy);
  ctx.save();
  ctx.setLineDash([]);
  const { centre } = setNumberFont(ctx, p.font, box.size * scale);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, box.size * 0.16);
  ctx.strokeStyle = MARK_OUTLINE;
  ctx.strokeText(text, cx, cy + centre);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy + centre);
  ctx.restore();
}
