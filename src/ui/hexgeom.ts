/**
 * Pointy-top hex geometry, in odd-r offset coordinates.
 *
 * Pure maths, no canvas: hexes do not tile a rectangle, so "which cell is
 * under this pixel" cannot be a division, and getting it subtly wrong is the
 * kind of bug that only shows up as clicks landing one row off. Keeping it
 * here means it can be tested exhaustively.
 *
 * `cellPx` is the hex's WIDTH (flat side to flat side), so it means the same
 * thing as a square cell's size and the zoom code needs no special case.
 * Odd rows sit half a cell to the right.
 */

const SQRT3 = Math.sqrt(3);

/** Circumradius: centre to a point. Height is twice this. */
export function hexRadius(cellPx: number): number {
  return cellPx / SQRT3;
}

/** Rows nest, so each one advances only three quarters of a hex height. */
export function hexRowStep(cellPx: number): number {
  return 1.5 * hexRadius(cellPx);
}

/** Centre of a cell, relative to the board's top-left. */
export function hexCentre(col: number, row: number, cellPx: number): { cx: number; cy: number } {
  const indent = (row & 1) ? cellPx / 2 : 0;
  return {
    cx: indent + col * cellPx + cellPx / 2,
    cy: row * hexRowStep(cellPx) + hexRadius(cellPx),
  };
}

/** Total pixels a hex board occupies. */
export function hexBoardSize(cols: number, rows: number, cellPx: number): { w: number; h: number } {
  return {
    // The half is the overhang from the indented odd rows.
    w: cellPx * (cols + 0.5),
    h: hexRowStep(cellPx) * (rows - 1) + 2 * hexRadius(cellPx),
  };
}

/**
 * Which cell contains this point, relative to the board's top-left.
 *
 * Converts to fractional axial coordinates about the centre of cell (0,0),
 * rounds in cube space — where rounding is well defined for hexes — then steps
 * back to offset rows. May return coordinates outside the board; the caller
 * bounds-checks.
 */
export function hexAt(px: number, py: number, cellPx: number): { col: number; row: number } {
  const s = hexRadius(cellPx);
  const localX = px - cellPx / 2;
  const localY = py - s;

  const q = ((SQRT3 / 3) * localX - (1 / 3) * localY) / s;
  const r = ((2 / 3) * localY) / s;

  // Cube rounding: round all three, then correct whichever moved furthest so
  // the coordinates still sum to zero.
  let rx = Math.round(q);
  let rz = Math.round(r);
  let ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dz = Math.abs(rz - r);
  const dy = Math.abs(ry - (-q - r));
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  // Math.round yields -0 for small negatives, which compares unequal to 0 and
  // poisons anything keyed on the coordinate. Normalise it away.
  const norm = (n: number): number => (n === 0 ? 0 : n);
  return { col: norm(rx + (rz - (rz & 1)) / 2), row: norm(rz) };
}

/** Outline of a hex, as points, for stroking or filling. */
export function hexPoints(cx: number, cy: number, radius: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90); // one vertex straight up
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}
