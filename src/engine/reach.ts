/**
 * The crawl rule: on a board with a `reach`, a cell may only be opened, or targeted by a spell,
 * within that many steps of ground already uncovered. Distance is measured through
 * `neighbours()`, so it is how far you could WALK: it stops at a wall and needs no special case
 * for hex boards or wrapped seams. Its one exception keeps the zero-damage guarantee: the dungeon
 * never forces a fight you cannot win for free (decision 0004).
 */

import type { BoardConfig, Cell } from './types.js';
import type { Grid } from './grid.js';

/** What the rule reads off a game. `Game` satisfies it. */
export interface ReachView {
  readonly grid: Grid;
  readonly config: BoardConfig;
  readonly level: number;
  neighboursOf(cell: Cell): Cell[];
}

/**
 * Is this cell within reach of open ground? Measured outward from the candidate rather than
 * inward from every open cell: the answer is the same because distance is symmetric, and the work
 * is a couple of dozen cells instead of a sweep of the board, which matters because the renderer
 * asks this nine times a frame. A board with nothing open at all is entirely in reach, so a reach
 * rule over `opening: 'none'` cannot present a board the player is forbidden to touch.
 *
 * The caller answers `sealedIn` first; this is the geometry alone.
 */
export function withinReach(game: ReachView, cell: Cell): boolean {
  const { reach } = game.config;
  const seen = new Set<Cell>([cell]);
  let frontier: Cell[] = [cell];

  for (let step = 0; step < reach; step++) {
    const next: Cell[] = [];
    for (const at of frontier) {
      for (const n of game.neighboursOf(at)) {
        if (seen.has(n)) continue;
        seen.add(n);
        if (n.open) return true;
        next.push(n);
      }
    }
    frontier = next;
  }

  // Nothing within reach is open. Before refusing, check the board has an open cell anywhere.
  for (const row of game.grid) {
    for (const c of row) if (c.open) return false;
  }
  return true;
}

/**
 * Has the board sealed the player in: is there no covered cell within reach of open ground that
 * can be opened at their level? One flood from every open cell at once, `reach` rings deep.
 * Read off `level` alone, not `level + exerciseCharge`: the question is whether the BOARD has
 * sealed you, not whether you hold a purchase that would open it.
 */
export function computeSealed(game: ReachView): boolean {
  let frontier: Cell[] = [];
  const seen = new Set<Cell>();
  for (const row of game.grid) {
    for (const cell of row) {
      if (cell.present && cell.open) {
        frontier.push(cell);
        seen.add(cell);
      }
    }
  }
  // A board with nothing open is not sealed: everything is in reach there.
  if (!frontier.length) return false;

  for (let step = 0; step < game.config.reach; step++) {
    const next: Cell[] = [];
    for (const at of frontier) {
      for (const n of game.neighboursOf(at)) {
        if (seen.has(n)) continue;
        seen.add(n);
        if (n.tier <= game.level) return false;
        next.push(n);
      }
    }
    frontier = next;
  }
  return true;
}
