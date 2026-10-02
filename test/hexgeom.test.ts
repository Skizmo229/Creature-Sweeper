/**
 * The board's drawn geometry, kept DOM-free so it can be tested here (`src/ui/hexgeom.ts`,
 * `src/ui/board/geometry.ts`): hex hit testing and layout, drawn adjacency against the engine's,
 * and the repeat drawn beyond a wrapped edge.
 */

import { describe, expect, it } from 'vitest';
import {
  hexAt,
  hexBoardSize,
  hexCentre,
  hexPoints,
  hexRadius,
  hexRowStep,
} from '../src/ui/hexgeom.js';
import {
  GHOST_CELLS,
  type Layout,
  centreOf,
  fittedCellFor,
  wrapPeriod,
} from '../src/ui/board/geometry.js';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { neighbours, makeCell, type Grid } from '../src/engine/grid.js';
import { ladders } from './helpers.js';

const SIZES = [8, 13, 21, 32, 48];
const COLS = 30;
const ROWS = 16;

describe('hex hit testing', () => {
  it('round-trips every cell centre back to itself', () => {
    for (const cellPx of SIZES) {
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const { cx, cy } = hexCentre(col, row, cellPx);
          const hit = hexAt(cx, cy, cellPx);
          expect(hit, `cellPx ${cellPx} at (${col},${row})`).toEqual({ col, row });
        }
      }
    }
  });

  it('round-trips points jittered well inside each cell', () => {
    const cellPx = 32;
    const r = hexRadius(cellPx);
    // Stay inside the inradius so the point cannot belong to a neighbour.
    const inradius = cellPx / 2;
    const offsets: Array<[number, number]> = [];
    for (let a = 0; a < 360; a += 45) {
      const rad = (Math.PI / 180) * a;
      offsets.push([Math.cos(rad) * inradius * 0.7, Math.sin(rad) * inradius * 0.7]);
    }
    expect(r).toBeGreaterThan(inradius); // sanity: points are further than flats

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { cx, cy } = hexCentre(col, row, cellPx);
        for (const [dx, dy] of offsets) {
          expect(hexAt(cx + dx, cy + dy, cellPx), `(${col},${row}) +(${dx},${dy})`).toEqual({
            col,
            row,
          });
        }
      }
    }
  });

  it('never maps two different cells to the same pixel', () => {
    const cellPx = 24;
    const seen = new Map<string, string>();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { cx, cy } = hexCentre(col, row, cellPx);
        const key = `${Math.round(cx)},${Math.round(cy)}`;
        expect(seen.has(key), `centre collision at ${key}`).toBe(false);
        seen.set(key, `${col},${row}`);
      }
    }
  });
});

describe('hex layout', () => {
  it('indents odd rows by exactly half a cell', () => {
    const cellPx = 32;
    expect(hexCentre(3, 1, cellPx).cx - hexCentre(3, 0, cellPx).cx).toBeCloseTo(cellPx / 2);
  });

  it('nests rows at three quarters of a hex height', () => {
    const cellPx = 32;
    const height = 2 * hexRadius(cellPx);
    expect(hexRowStep(cellPx)).toBeCloseTo(height * 0.75);
  });

  it('reports a board size that actually contains every cell', () => {
    for (const cellPx of SIZES) {
      const { w, h } = hexBoardSize(COLS, ROWS, cellPx);
      const r = hexRadius(cellPx);
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const { cx, cy } = hexCentre(col, row, cellPx);
          expect(cx - cellPx / 2).toBeGreaterThanOrEqual(-0.001);
          expect(cy - r).toBeGreaterThanOrEqual(-0.001);
          expect(cx + cellPx / 2).toBeLessThanOrEqual(w + 0.001);
          expect(cy + r).toBeLessThanOrEqual(h + 0.001);
        }
      }
    }
  });

  it('draws a pointy-top hex — one vertex straight up', () => {
    const pts = hexPoints(100, 100, 10);
    expect(pts).toHaveLength(6);
    expect(pts[0]![0]).toBeCloseTo(100);
    expect(pts[0]![1]).toBeCloseTo(90); // straight up, y grows downward
  });
});

describe('drawn geometry agrees with engine adjacency', () => {
  it('the six nearest cells by distance are exactly the six neighbours', () => {
    const cellPx = 32;
    const grid: Grid = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) row.push(makeCell(x, y));
      grid.push(row);
    }

    // Interior cells only, so edge clipping does not shorten the list.
    for (let row = 2; row < ROWS - 2; row++) {
      for (let col = 2; col < COLS - 2; col++) {
        const me = hexCentre(col, row, cellPx);
        const ranked = grid
          .flat()
          .filter((c) => !(c.x === col && c.y === row))
          .map((c) => {
            const p = hexCentre(c.x, c.y, cellPx);
            return { c, d: Math.hypot(p.cx - me.cx, p.cy - me.cy) };
          })
          .sort((a, b) => a.d - b.d)
          .slice(0, 6)
          .map(({ c }) => `${c.x},${c.y}`)
          .sort();

        const engine = neighbours(grid, col, row, 'hex')
          .map((c) => `${c.x},${c.y}`)
          .sort();

        expect(ranked, `mismatch at (${col},${row})`).toEqual(engine);
      }
    }
  });
});

/**
 * No ladder wraps a hex board yet, but config allows it, and the band beyond a joined edge is what
 * a click on the repeat resolves through: drawn at the drawn size rather than the lattice's period,
 * it sat half a hex to the side of the cells it showed.
 */
describe('the repeat beyond a wrapped edge', () => {
  const offsets: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
  ];

  it('draws each ghost cell where the lattice puts the cell across the seam', () => {
    for (const hex of [false, true]) {
      const layout: Layout = { hex, cellPx: 32, originX: 5, originY: 7, cols: COLS, rows: ROWS };
      const period = wrapPeriod(layout);
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const shown = centreOf(layout, col, row);
          for (const [ox, oy] of offsets) {
            const across = centreOf(layout, col + ox * COLS, row + oy * ROWS);
            const where = `${hex ? 'hex' : 'square'} (${col},${row}) by (${ox},${oy})`;
            expect(shown.cx + ox * period.w, where).toBeCloseTo(across.cx);
            expect(shown.cy + oy * period.h, where).toBeCloseTo(across.cy);
          }
        }
      }
    }
  });

  it('leaves room for the band above and below a hex board wrapped top to bottom', () => {
    const hive = ladders.find((t) => t.id === 'hive')!;
    const game = Game.create(boardConfig([{ ...hive, wrap: 'both' }], hive.id, 1), 1);
    const availH = 600;
    const cellPx = fittedCellFor(game, 4000, availH);
    const rows = game.config.height + 2 * GHOST_CELLS;
    expect(hexBoardSize(game.config.width, rows, cellPx).h).toBeLessThanOrEqual(availH);
  });
});
