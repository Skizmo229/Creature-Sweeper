/**
 * PATROL: creatures that walk. A tier-t creature walks the edge of a square t cells a side, one cell
 * per action, clockwise from the square's top-left corner, where every creature starts: t cells
 * right, t down, t left and t up, home again after 4t actions. The patrol placement rule deals the
 * routes so that no two share a cell (`placement/patrol.ts`), so two creatures never meet and a
 * beaten one lies where nobody else will ever walk. Numbers are sums of the creatures standing
 * round a cell now, living or beaten, and are worked out again after every step.
 *
 * A creature that walks onto ground the player has uncovered covers that cell again while it
 * stands there (`occupied`), so every rule and every proof reads it as unknown, and it is drawn as
 * a "?"; when it walks on, the cell is uncovered ground again.
 *
 * A mark here is a route rather than a claim: a mark of tier t draws the whole route of a tier-t
 * creature with the marked cell as its top-left corner, on every covered cell of it, so the mark
 * guard covers every cell that creature can step onto. Where routes overlap, a cell shows the
 * highest. Sweep does not read them, since a route is not where a creature stands.
 */

import type { BoardConfig, Cell, GameEvent } from './types.js';
import { type Grid, computeNumbers } from './grid.js';

/** Where on its route a tier-`tier` creature cornered at (x, y) stands after `moves` moves. */
export function routeStep(
  x: number,
  y: number,
  tier: number,
  moves: number,
): { x: number; y: number } {
  const p = moves % (4 * tier);
  if (p < tier) return { x: x + p, y };
  if (p < 2 * tier) return { x: x + tier, y: y + p - tier };
  if (p < 3 * tier) return { x: x + tier - (p - 2 * tier), y: y + tier };
  return { x, y: y + tier - (p - 3 * tier) };
}

/** Every cell of a tier-`tier` route cornered at (x, y), in the order it is walked. */
export function routeCells(x: number, y: number, tier: number): Array<{ x: number; y: number }> {
  return Array.from({ length: 4 * tier }, (_, m) => routeStep(x, y, tier, m));
}

/** Does the whole route lie on cells that exist? */
function routeFits(grid: Grid, x: number, y: number, tier: number): boolean {
  const h = grid.length;
  const w = grid[0]!.length;
  return (
    x + tier < w && y + tier < h && routeCells(x, y, tier).every((c) => grid[c.y]![c.x]!.present)
  );
}

/** What walking the creatures and drawing routes read and change. `Game` satisfies it. */
export interface PatrolHost {
  readonly grid: Grid;
  readonly config: BoardConfig;
  /** Write a mark, keeping the per-tier counters honest. */
  applyMark(cell: Cell, mark: number): void;
}

interface Walker {
  readonly x: number;
  readonly y: number;
  readonly tier: number;
  /** Where it stands now. Not alive once beaten there, and then it walks no further. */
  at: Cell;
}

export class Patrol {
  /** Actions taken, which is how far round its route every creature has walked. */
  moves = 0;
  private readonly walkers: Walker[] = [];
  /** The routes the player has marked, by the corner cell they were drawn from. */
  private readonly routes = new Map<Cell, number>();

  /** Read off the board as dealt, where every creature stands on its own route's corner. */
  constructor(grid: Grid) {
    for (const row of grid) {
      for (const cell of row) {
        if (cell.tier > 0) this.walkers.push({ x: cell.x, y: cell.y, tier: cell.tier, at: cell });
      }
    }
  }

  /** Every living creature takes one step, and the numbers and the routes are brought up to date. */
  step(host: PatrolHost): GameEvent[] {
    this.moves++;
    for (const w of this.walkers) {
      if (!w.at.alive) continue;
      const from = w.at;
      const next = routeStep(w.x, w.y, w.tier, this.moves);
      const to = host.grid[next.y]![next.x]!;
      to.tier = from.tier;
      to.alive = true;
      from.tier = 0;
      from.alive = false;
      if (from.occupied) {
        // Uncovered ground again: whatever was written on it while it was covered goes.
        from.occupied = false;
        from.open = true;
        host.applyMark(from, 0);
        from.notes = 0;
      }
      if (to.open) {
        to.open = false;
        to.occupied = true;
      }
      w.at = to;
    }
    computeNumbers(host.grid, host.config.topology, host.config.wrap);
    this.paintRoutes(
      host,
      [...this.routes.keys()].flatMap((c) => this.cellsOf(host, c)),
    );
    return [{ type: 'moved', moves: this.moves }];
  }

  /**
   * Mark, or take off, the tier-`tier` route cornered at `corner`. The same tier from the same
   * corner again takes it off, as re-marking a cell does elsewhere, and 0 takes off whatever is
   * cornered there. A route that would leave the board is refused.
   */
  mark(host: PatrolHost, corner: Cell, tier: number): GameEvent[] {
    const had = this.routes.get(corner);
    if (tier > 0 && tier !== had && !routeFits(host.grid, corner.x, corner.y, tier)) {
      return [{ type: 'blocked', reason: 'out-of-bounds' }];
    }
    const touched = had ? this.cellsOf(host, corner) : [];
    if (tier === 0 || tier === had) this.routes.delete(corner);
    else this.routes.set(corner, tier);
    return this.paintRoutes(host, [...touched, ...this.cellsOf(host, corner)]);
  }

  private cellsOf(host: PatrolHost, corner: Cell): Cell[] {
    const tier = this.routes.get(corner);
    if (!tier) return [];
    return routeCells(corner.x, corner.y, tier).map((c) => host.grid[c.y]![c.x]!);
  }

  /** Give each of these cells the highest route over it, or none if it is uncovered ground. */
  private paintRoutes(host: PatrolHost, cells: readonly Cell[]): GameEvent[] {
    const events: GameEvent[] = [];
    for (const cell of new Set(cells)) {
      let top = 0;
      if (!cell.open) {
        for (const [corner, tier] of this.routes) {
          if (tier <= top) continue;
          if (this.cellsOf(host, corner).includes(cell)) top = tier;
        }
      }
      if (cell.mark === top) continue;
      events.push({ type: 'marked', x: cell.x, y: cell.y, from: cell.mark, to: top });
      host.applyMark(cell, top);
    }
    return events;
  }
}
