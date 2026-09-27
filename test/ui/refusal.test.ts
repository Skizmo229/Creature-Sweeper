// @vitest-environment happy-dom
/**
 * The cursor on a cell a click would not land on: crossed out, where a cell it would land on is
 * boxed, so the refusal reads without its red. Corner to corner of the tile on both grids and at
 * the smallest cell a board is drawn at, over a dark outline, never dashed like a wrap seam
 * (decision 0051).
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Game } from '../../src/engine/game.js';
import type { Cell } from '../../src/engine/types.js';
import { App } from '../../src/ui/app.js';
import { type Layout, MIN_CELL, centreOf } from '../../src/ui/board/geometry.js';
import { TILE_INSET } from '../../src/ui/board/paint.js';
import { type BoardDisplay, BoardView } from '../../src/ui/board/view.js';
import { hexPoints, hexRadius } from '../../src/ui/hexgeom.js';
import { themeFor } from '../../src/ui/looks.js';
import { HIGHLIGHT_PIN, highlightSampleBoard } from '../../src/ui/preview.js';
import type { HighlightStyle } from '../../src/ui/settings.js';
import { MARK_COLOR, MARK_OUTLINE, OUT_OF_REACH_COLOR } from '../../src/ui/theme.js';
import { FONTS } from '../../src/ui/typefaces.js';

type Point = readonly [number, number];

/** One `stroke()`: the state it was drawn in, and its path as the points each sub-path runs through. */
interface Stroke {
  style: string;
  width: number;
  alpha: number;
  dash: readonly number[];
  lines: Point[][];
}

interface DrawState {
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  dash: number[];
}

/** Every `stroke()` drawn on a canvas made while this runs, with its path and the state it used. */
function recordStrokes(): { strokes: Stroke[]; stop: () => void } {
  const strokes: Stroke[] = [];
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    let state: DrawState = { strokeStyle: '', lineWidth: 1, globalAlpha: 1, dash: [] };
    const saved: DrawState[] = [];
    let lines: Point[][] = [];
    const calls: Record<string, (...args: never[]) => void> = {
      save: () => saved.push({ ...state }),
      restore: () => {
        state = saved.pop() ?? state;
      },
      beginPath: () => {
        lines = [];
      },
      moveTo: (x: number, y: number) => lines.push([[x, y]]),
      lineTo: (x: number, y: number) => lines.at(-1)?.push([x, y]),
      rect: (x: number, y: number, w: number, h: number) =>
        lines.push([
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
          [x, y],
        ]),
      closePath: () => {
        const line = lines.at(-1);
        if (line?.[0]) line.push(line[0]);
      },
      setLineDash: (dash: number[]) => {
        state.dash = [...dash];
      },
      stroke: () =>
        strokes.push({
          style: state.strokeStyle,
          width: state.lineWidth,
          alpha: state.globalAlpha,
          dash: state.dash,
          lines: lines.map((l) => [...l]),
        }),
    };
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'strokeStyle' || prop === 'lineWidth' || prop === 'globalAlpha') {
          return state[prop];
        }
        if (typeof prop === 'string' && prop in calls) return calls[prop];
        return Reflect.get(target, prop) as unknown;
      },
      set(_target, prop, value) {
        if (prop === 'strokeStyle') state.strokeStyle = String(value);
        if (prop === 'lineWidth') state.lineWidth = Number(value);
        if (prop === 'globalAlpha') state.globalAlpha = Number(value);
        return true;
      },
    });
  } as unknown as typeof noop;
  return { strokes, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

let recording: ReturnType<typeof recordStrokes>;
beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  recording = recordStrokes();
});
afterEach(() => recording.stop());

const display = (highlight: HighlightStyle | null, highlightColor = MARK_COLOR): BoardDisplay => ({
  maxCell: 48,
  font: FONTS['jetbrains-mono'],
  highlight,
  highlightColor,
  strikeDefeated: true,
});

/** A board drawn with `cell` held under the cursor, and the strokes the rendering made. */
function draw(
  game: Game,
  pin: { x: number; y: number },
  shown: BoardDisplay,
  lands: (cell: Cell) => boolean,
  cellPx: number,
): { strokes: Stroke[]; layout: Layout } {
  const view = new BoardView(
    document.createElement('canvas'),
    { onOpen: () => undefined, onCycleMark: () => undefined, onHover: () => undefined, lands },
    { interactive: false, fixedCell: cellPx },
  );
  view.setGame(game, themeFor('normal'), shown);
  recording.strokes.length = 0;
  view.pinHover(pin.x, pin.y);
  const layout = (view as unknown as { layout: Layout }).layout;
  return { strokes: [...recording.strokes], layout };
}

/**
 * The strokes the cursor highlight adds: the board drawn with it, less the same board drawn
 * without, which is every stroke up to where the highlight begins.
 */
function highlightStrokes(
  game: Game,
  pin: { x: number; y: number },
  lands: (cell: Cell) => boolean,
  options: { style?: HighlightStyle; color?: string; cellPx?: number } = {},
): { strokes: Stroke[]; layout: Layout } {
  const cellPx = options.cellPx ?? 26;
  const bare = draw(game, pin, display(null), lands, cellPx);
  const lit = draw(game, pin, display(options.style ?? 'cell', options.color), lands, cellPx);
  expect(lit.strokes.slice(0, bare.strokes.length)).toEqual(bare.strokes);
  return { strokes: lit.strokes.slice(bare.strokes.length), layout: lit.layout };
}

const refuseAll = (): boolean => false;
const landAll = (): boolean => true;

/** The two diagonals of a cross, as their end points; null if the path is anything else. */
function asCross(stroke: Stroke): [Point, Point, Point, Point] | null {
  if (stroke.lines.length !== 2 || stroke.lines.some((l) => l.length !== 2)) return null;
  const [[a, b], [c, d]] = stroke.lines as [[Point, Point], [Point, Point]];
  return [a, b, c, d];
}

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const samePoint = (p: Point, q: Point): boolean => near(p[0], q[0]) && near(p[1], q[1]);

/** How far a point is from the nearest side of a polygon. */
function offOutline(point: Point, corners: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < corners.length; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[(i + 1) % corners.length]!;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - ax) * (bx - ax) + (point[1] - ay) * (by - ay)) /
          ((bx - ax) ** 2 + (by - ay) ** 2),
      ),
    );
    best = Math.min(
      best,
      Math.hypot(point[0] - (ax + t * (bx - ax)), point[1] - (ay + t * (by - ay))),
    );
  }
  return best;
}

describe('a cell a click would not land on', () => {
  it('is crossed out in red over a dark outline, where one it would land on is boxed', () => {
    const game = highlightSampleBoard('square');
    const landing = highlightStrokes(game, HIGHLIGHT_PIN, landAll).strokes;
    expect(landing).toHaveLength(1);
    expect(landing[0]!.style).toBe(MARK_COLOR);
    expect(landing[0]!.lines).toHaveLength(1);
    expect(landing[0]!.lines[0]).toHaveLength(5);
    expect(asCross(landing[0]!)).toBeNull();

    const refused = highlightStrokes(game, HIGHLIGHT_PIN, refuseAll).strokes;
    expect(refused.map((s) => s.style)).toEqual([MARK_OUTLINE, OUT_OF_REACH_COLOR]);
    // The outline is the same cross, wider, so the red has a dark edge on either side.
    expect(refused[0]!.lines).toEqual(refused[1]!.lines);
    expect(refused[0]!.width).toBeGreaterThan(refused[1]!.width);
    expect(refused[1]!.width).toBe(landing[0]!.width);
    expect(asCross(refused[1]!)).not.toBeNull();
  });

  it('still says no to a player whose highlight colour is the red itself', () => {
    const game = highlightSampleBoard('square');
    const geometry = (strokes: Stroke[]) => strokes.map((s) => s.lines);
    const landing = highlightStrokes(game, HIGHLIGHT_PIN, landAll, { color: OUT_OF_REACH_COLOR });
    const refused = highlightStrokes(game, HIGHLIGHT_PIN, refuseAll, { color: OUT_OF_REACH_COLOR });
    expect(landing.strokes.map((s) => s.style)).toEqual([OUT_OF_REACH_COLOR]);
    expect(geometry(refused.strokes)).not.toContainEqual(geometry(landing.strokes)[0]);
  });

  for (const topology of ['square', 'hex'] as const) {
    for (const cellPx of [MIN_CELL, 12, 26, 48]) {
      it(`runs corner to corner of its tile on a ${topology} grid at ${cellPx}px`, () => {
        const game = highlightSampleBoard(topology);
        const { strokes, layout } = highlightStrokes(game, HIGHLIGHT_PIN, refuseAll, { cellPx });
        const cross = asCross(strokes.at(-1)!)!;
        expect(cross).not.toBeNull();
        const { cx, cy } = centreOf(layout, HIGHLIGHT_PIN.x, HIGHLIGHT_PIN.y);
        const [a, b, c, d] = cross;
        // Two diagonals at 45 degrees, crossing at the cell's centre.
        for (const [p, q] of [
          [a, b],
          [c, d],
        ] as const) {
          expect(samePoint([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], [cx, cy])).toBe(true);
          expect(near(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]))).toBe(true);
        }
        // Every end on the tile's own outline: its corners on a square, its sides on a hex. The
        // box the cursor draws round a cell that lands is inset further, so the cross is the
        // larger shape and does not close up into a blob at the smallest cells.
        const tile = layout.hex
          ? hexPoints(cx, cy, hexRadius(cellPx) - TILE_INSET)
          : ([
              [cx - cellPx / 2 + TILE_INSET, cy - cellPx / 2 + TILE_INSET],
              [cx + cellPx / 2 - TILE_INSET, cy - cellPx / 2 + TILE_INSET],
              [cx + cellPx / 2 - TILE_INSET, cy + cellPx / 2 - TILE_INSET],
              [cx - cellPx / 2 + TILE_INSET, cy + cellPx / 2 - TILE_INSET],
            ] as const);
        for (const end of cross) expect(offOutline(end, tile)).toBeLessThan(1e-6);
        if (!layout.hex)
          for (const end of cross) expect(tile.some((t) => samePoint(end, t))).toBe(true);
      });
    }
  }

  it('is never dashed, so it cannot be taken for a wrap seam', () => {
    const game = highlightSampleBoard('square');
    for (const style of ['cell', 'neighbours', 'block'] as const) {
      const { strokes } = highlightStrokes(game, HIGHLIGHT_PIN, refuseAll, { style });
      expect(strokes.length).toBeGreaterThan(0);
      for (const s of strokes) expect(s.dash).toEqual([]);
    }
  });
});

interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  readonly current: Game | null;
  readonly view: { readonly display: BoardDisplay; pinHover(x: number, y: number): void } | null;
}

describe('the edge of reach on a board in play', () => {
  it('boxes every cell a click would land on and crosses out every other, on DUNGEON', () => {
    const app = new App(document.getElementById('app')!) as unknown as Driver;
    app.play('dungeon', 1);
    const game = app.current!;
    // A cell in reach with cells out of reach around it: where the edge of the crawl runs.
    const cells = game.grid.flat().filter((c) => c.present);
    const edge = cells.find(
      (c) => !c.open && game.inReach(c) && game.neighboursOf(c).some((n) => !game.inReach(n)),
    )!;
    expect(edge).toBeDefined();
    const around = game.neighboursOf(edge);
    const outOfReach = around.filter((n) => !game.inReach(n)).length;

    recording.strokes.length = 0;
    app.view!.pinHover(edge.x, edge.y);
    const color = app.view!.display.highlightColor;
    const inRed = recording.strokes.filter((s) => s.style === OUT_OF_REACH_COLOR);
    const inColor = recording.strokes.filter((s) => s.style === color);
    expect(inRed).toHaveLength(outOfReach);
    for (const s of inRed) expect(asCross(s)).not.toBeNull();
    // The rest of the ring and the cell itself.
    expect(inColor).toHaveLength(around.length + 1 - outOfReach);
    for (const s of inColor) expect(asCross(s)).toBeNull();
  });
});
