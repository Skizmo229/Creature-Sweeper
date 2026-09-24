/**
 * What each spell does when cast. `Game.cast` does the checks every spell shares (the type offers
 * it, the mana is there, the target is on the board and within reach) and the bookkeeping after
 * (paying, WORKOUT's surcharge, the event); the effects themselves are here, one function per
 * spell. No spell removes a creature or skips its EXP (docs/invariants.md, fact 3).
 */

import { EXERCISE_LEVELS, type SpellId } from './spells.js';
import type { BlockReason, BoardConfig, Cell, GameEvent } from './types.js';
import { findBestOpening } from './opening.js';
import type { Grid } from './grid.js';

/** The engine operations a spell may perform. `Game` satisfies it. */
export interface SpellHost {
  readonly grid: Grid;
  readonly config: BoardConfig;
  exerciseCharge: number;
  neighboursOf(cell: Cell): Cell[];
  /** Uncover a cell, cascading through blanks; the cells opened. */
  reveal(start: Cell): Array<{ x: number; y: number }>;
  /** Open one cell without cascading; false if it was already open. */
  markOpen(cell: Cell): boolean;
  /** Write a mark, keeping the per-tier counters honest. */
  applyMark(cell: Cell, mark: number): void;
}

export type SpellOutcome = { blocked: BlockReason } | { events: GameEvent[]; detail: string };

/** The effects, keyed by spell. Targeted spells receive the cell; the others receive null. */
export const SPELL_EFFECTS: Record<
  SpellId,
  (host: SpellHost, target: Cell | null) => SpellOutcome
> = {
  reveal: (host, target) => revealSpell(host, target!),
  census: (host, target) => censusSpell(host, target!),
  exercise: (host) => exerciseSpell(host),
  beacon: (host) => beaconSpell(host),
};

/**
 * Reveal: what is here, as a GIVEN rather than a player mark, plus the empty ground touching it.
 *
 * A given is the board talking (gold, unerasable) and does not strengthen strict Sweep, which
 * consults `given` only on the Sudoku path. The ring gives nothing away, since a cell with no
 * creature was always free to open, and it cannot cascade off a creature: every neighbour of a
 * tier-N cell carries at least N in its number. The cells pay no exploration mana, like the dealt
 * opening's (decision 0005).
 */
function revealSpell(host: SpellHost, cell: Cell): SpellOutcome {
  if (cell.open) return { blocked: 'already-open' };
  const opened: Array<{ x: number; y: number }> = [];
  let detail: string;
  if (cell.tier === 0) {
    opened.push(...host.reveal(cell));
    detail = 'empty';
  } else {
    host.applyMark(cell, cell.tier);
    cell.given = true;
    detail = `tier ${cell.tier}`;
  }
  for (const n of host.neighboursOf(cell)) {
    if (!n.open && n.tier === 0) opened.push(...host.reveal(n));
  }
  const events: GameEvent[] = opened.length ? [{ type: 'revealed', cells: opened }] : [];
  return { events, detail };
}

/** Census: how many of the cell's neighbours are creatures. Sweep reads the count as a proof. */
function censusSpell(host: SpellHost, cell: Cell): SpellOutcome {
  if (cell.census !== null) return { blocked: 'no-effect' };
  cell.census = host.neighboursOf(cell).filter((n) => n.tier > 0).length;
  return { events: [], detail: `${cell.census} adjacent` };
}

/** Exercise: the next fight is fought a level higher. One charge at a time. */
function exerciseSpell(host: SpellHost): SpellOutcome {
  if (host.exerciseCharge > 0) return { blocked: 'no-effect' };
  host.exerciseCharge = EXERCISE_LEVELS;
  return { events: [], detail: `+${EXERCISE_LEVELS} level` };
}

/** Beacon: open the largest zero-region nobody has touched yet. */
function beaconSpell(host: SpellHost): SpellOutcome {
  const region = findBestOpening(host.grid, true, host.config.topology, host.config.wrap);
  if (!region) return { blocked: 'no-effect' };
  const opened: Array<{ x: number; y: number }> = [];
  for (const cell of region.cells) {
    if (host.markOpen(cell)) opened.push({ x: cell.x, y: cell.y });
  }
  if (opened.length === 0) return { blocked: 'no-effect' };
  return { events: [{ type: 'revealed', cells: opened }], detail: `${opened.length} cells` };
}
