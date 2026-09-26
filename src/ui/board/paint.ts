/**
 * Painting one cell: the covered tile with its mark or pencil notes, the open floor with its
 * number or creature, and the Census badge. Everything a pass needs is in the `Paint` it is
 * handed, so no painter reaches into the view.
 */

import type { Game } from '../../engine/game.js';
import { hasNote } from '../../engine/notes.js';
import { placementRule } from '../../engine/placement/registry.js';
import type { Cell } from '../../engine/types.js';
import { hexPoints, hexRadius } from '../hexgeom.js';
import {
  CENSUS_COLOR,
  GIVEN_COLOR,
  MARK_COLOR,
  MARK_OUTLINE,
  NOTE_COLOR,
  drawCreature,
} from '../theme.js';
import type { TypeTheme } from '../looktypes.js';
import type { GameFont } from '../typefaces.js';
import { setNumberFont } from './digits.js';
import { type Layout, contentBox } from './geometry.js';

/** What every draw pass reads. Built by the view once per render. */
export interface Paint {
  readonly ctx: CanvasRenderingContext2D;
  readonly layout: Layout;
  readonly game: Game;
  readonly theme: TypeTheme;
  readonly font: GameFont;
  /** Whether a defeated creature keeps its struck-through corner. */
  readonly strikeDefeated: boolean;
  /** The cell under the cursor (or pinned), if any. */
  readonly hovered: Cell | null;
  /** True while a board-clear effect has taken the creature glyphs over. */
  readonly creaturesHidden: boolean;
}

/** Trace a cell's outline, inset slightly so neighbours read as separate. */
export function tracePath(p: Paint, cx: number, cy: number, inset = 1): void {
  const { ctx, layout } = p;
  ctx.beginPath();
  if (!layout.hex) {
    const half = layout.cellPx / 2 - inset;
    ctx.rect(cx - half, cy - half, half * 2, half * 2);
    return;
  }
  const pts = hexPoints(cx, cy, hexRadius(layout.cellPx) - inset);
  pts.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

/**
 * The placement rule's wash (Sudoku's alternate boxes, the checkerboard's light squares). A
 * translucent wash rather than a second set of colours, so it derives from whichever theme is in
 * play and lands identically on tile and floor.
 */
function washesCell(game: Game, cell: Cell): boolean {
  return placementRule(game.config.placement).display.washes(cell);
}

/** The wash itself, over a path the caller has already traced. */
function fillWash(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.save();
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill();
  ctx.restore();
}

export function drawCovered(p: Paint, cell: Cell, cx: number, cy: number): void {
  const { ctx, theme } = p;
  const size = p.layout.cellPx;

  tracePath(p, cx, cy);
  ctx.fillStyle = theme.tile;
  ctx.fill();
  // Before the stroke, so the wash cannot wipe out the cell's own edge.
  if (washesCell(p.game, cell)) fillWash(ctx, 0.18);
  // A stroke reads as the bevel did on squares, and works at any cell shape.
  ctx.strokeStyle = theme.tileEdge;
  ctx.lineWidth = Math.max(1, size / 10);
  ctx.stroke();

  if (cell.mark > 0) {
    const box = contentBox(p.layout, cx, cy);
    // Outlined, because green alone vanishes on a light tile like EASY's olive.
    ctx.save();
    const { centre } = setNumberFont(ctx, p.font, box.size * 0.58);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, box.size * 0.16);
    ctx.strokeStyle = MARK_OUTLINE;
    const my = cy + centre;
    ctx.strokeText(String(cell.mark), cx, my);
    // A clue the board dealt and a claim the player made are different things, so they are
    // different colours. Same outline, because both have to survive whatever tile they land on.
    ctx.fillStyle = cell.given ? GIVEN_COLOR : MARK_COLOR;
    ctx.fillText(String(cell.mark), cx, my);
    ctx.restore();
  } else if (cell.notes) {
    drawNotes(p, cell, cx, cy);
  }
}

/**
 * Pencil marks, laid out as a fixed 3-wide grid of slots. Fixed is the point: a candidate always
 * sits in the same corner of the cell whether or not its neighbours are still in the set, so the
 * player reads the pattern rather than the digits. Slot 0 is empty ground and shows a dot,
 * because "0" next to a column of tiers reads as a tier. Outlined for the reason a mark is: the
 * dimmed green alone measured 1.22:1 on EASY, and 5.1 to 5.9:1 against its own halo.
 */
function drawNotes(p: Paint, cell: Cell, cx: number, cy: number): void {
  const { ctx } = p;
  const box = contentBox(p.layout, cx, cy);
  // Candidate slots a cell can hold: tier 0 (empty ground) through the top.
  const slots = p.game.config.tiers + 1;
  const cols = 3;
  const rows = Math.ceil(slots / cols);
  const pad = box.size * 0.12;
  const w = (box.size - pad * 2) / cols;
  const h = (box.size - pad * 2) / rows;
  const font = Math.round(Math.min(w, h) * 0.86);
  if (font < 5) return; // below this the pips are noise, not information

  ctx.save();
  const { centre } = setNumberFont(ctx, p.font, font);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, font * 0.3);
  ctx.strokeStyle = MARK_OUTLINE;
  ctx.fillStyle = NOTE_COLOR;
  const at: { glyph: string; x: number; y: number }[] = [];
  for (let t = 0; t < slots; t++) {
    if (!hasNote(cell.notes, t)) continue;
    at.push({
      glyph: t === 0 ? '·' : String(t),
      x: box.x + pad + w * (t % cols) + w / 2,
      y: box.y + pad + h * Math.floor(t / cols) + h / 2 + centre,
    });
  }
  // All the halos go down before any fill, so a halo can never bite into a neighbouring candidate.
  for (const { glyph, x, y } of at) ctx.strokeText(glyph, x, y);
  for (const { glyph, x, y } of at) ctx.fillText(glyph, x, y);
  ctx.restore();
}

/**
 * Open floor: its number, or its creature. A defeated creature under the cursor shows the number
 * underneath it instead (never on a pairing board, where that number is the partner's tier and
 * read as the creature's own; decision 0012). While a clear effect owns the glyphs the cell is
 * bare floor, and the effect draws the creature.
 */
export function drawOpen(p: Paint, cell: Cell, cx: number, cy: number): void {
  const { ctx, theme, game } = p;
  const box = contentBox(p.layout, cx, cy);

  tracePath(p, cx, cy);
  ctx.fillStyle = theme.floor;
  ctx.fill();
  // Lighter on the floor than on a tile: the floor is much darker, so the same alpha reads as a
  // bigger step there.
  if (washesCell(game, cell)) fillWash(ctx, 0.17);

  const hoverNumber =
    cell.tier > 0 &&
    !cell.alive &&
    cell === p.hovered &&
    !p.creaturesHidden &&
    placementRule(game.config.placement).display.hoverShowsNumber;

  if (cell.tier > 0 && !hoverNumber) {
    if (p.creaturesHidden) return;
    ctx.save();
    // Dim the glyph itself rather than washing it out with a floor overlay, which left defeated
    // creatures almost invisible.
    if (!cell.alive) ctx.globalAlpha = 0.55;
    drawCreature(ctx, box.x, box.y, box.size, cell.tier, theme);
    ctx.restore();
    // A struck-through corner reads as "dealt with" at a glance. Optional, because at small
    // cell sizes the stroke crosses the pips.
    if (!cell.alive && p.strikeDefeated) {
      ctx.save();
      ctx.strokeStyle = theme.ink;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = Math.max(1, box.size / 16);
      ctx.beginPath();
      ctx.moveTo(box.x + box.size * 0.18, box.y + box.size * 0.82);
      ctx.lineTo(box.x + box.size * 0.82, box.y + box.size * 0.18);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  const showNumber = cell.tier > 0 ? hoverNumber : cell.num > 0;
  if (!showNumber) return;

  const text = String(cell.num);
  ctx.save();
  // Red on a creature's own cell, ink on open ground, as in the original.
  ctx.fillStyle = cell.tier > 0 ? theme.hot : theme.ink;
  const scale = text.length > 1 ? 0.5 : 0.62;
  const { centre } = setNumberFont(ctx, p.font, box.size * scale);
  ctx.textAlign = 'center';
  ctx.fillText(text, cx, cy + centre);
  ctx.restore();
}

/**
 * Census sits in the top-left corner rather than the middle, so it can never be confused with the
 * cell's own number or a mark, both of which are centred. On hex the content box is inset, which
 * keeps it off the edge.
 */
export function drawCensus(p: Paint, cell: Cell, cx: number, cy: number): void {
  const { ctx } = p;
  const box = contentBox(p.layout, cx, cy);
  const size = box.size;
  const x = box.x;
  const y = box.y;
  const r = Math.max(5, size * 0.3);
  ctx.save();
  ctx.fillStyle = 'rgba(6, 12, 18, 0.85)';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + r * 2, y);
  ctx.lineTo(x, y + r * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = CENSUS_COLOR;
  const { ascent } = setNumberFont(ctx, p.font, size * 0.32);
  ctx.textAlign = 'left';
  ctx.fillText(
    String(cell.census),
    x + Math.max(1, size * 0.04),
    y + Math.max(0, size * 0.02) + ascent,
  );
  ctx.restore();
}
