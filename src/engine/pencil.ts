/**
 * The pencil: what a player may pencil on a covered cell, and pencilling or rubbing it out. The
 * mask itself is `notes.ts`; what the placement rule allows is its `candidates`. `Game`'s
 * `toggleNote`, `noteCandidates`, `canNote` and `clearNotes` are these.
 */

import { allNotes, hasNote, noteBit, toggleNote as toggleNoteBit } from './notes.js';
import { placementRule } from './placement/registry.js';
import type { RuleView } from './placement/rule.js';
import type { Cell, GameEvent, GameStatus } from './types.js';

/** The board the pencil works on: `Game`, which is also the view a placement rule reads. */
export interface PencilHost extends RuleView {
  readonly status: GameStatus;
  cellAt(x: number, y: number): Cell | null;
  /** Write a mark, keeping the per-tier counters honest. */
  applyMark(cell: Cell, mark: number): void;
}

/**
 * Add or remove one candidate tier from a covered cell's pencil marks.
 * Tier 0 is a candidate like any other — "this might just be empty".
 *
 * Notes and a mark are mutually exclusive: pencilling on a marked cell
 * erases the mark, the way you rub out a written digit before pencilling
 * alternatives back in. Clearing the last candidate leaves the cell blank
 * rather than impossible.
 */
export function toggleNote(game: PencilHost, x: number, y: number, tier: number): GameEvent[] {
  if (game.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
  const cell = game.cellAt(x, y);
  if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];
  if (cell.open) return [{ type: 'blocked', reason: 'already-open' }];
  if (cell.given) return [{ type: 'blocked', reason: 'given' }];
  if (tier < 0 || tier > game.config.tiers) {
    return [{ type: 'blocked', reason: 'out-of-bounds' }];
  }
  // Before the mark is rubbed out, so a refused candidate changes nothing.
  if (!canNote(game, cell, tier)) return [{ type: 'blocked', reason: 'ruled-out' }];

  const events: GameEvent[] = [];
  if (cell.mark > 0) {
    const wasMark = cell.mark;
    game.applyMark(cell, 0);
    events.push({ type: 'marked', x, y, from: wasMark, to: 0 });
  }

  const from = cell.notes;
  const to = toggleNoteBit(from, tier);
  if (from === to) return events;
  cell.notes = to;
  events.push({ type: 'noted', x, y, from, to });
  return events;
}

/**
 * The tiers this covered cell could still be holding by the placement rule
 * alone, as a note mask: what the pencil may offer here. The rule's own
 * `candidates`, read off what is on screen, and tier 0 refused where the
 * opening uncovered every empty cell.
 *
 * Deliberately not anything that takes deduction, or it becomes the
 * auto-candidates convenience that turns Sweep back into a solve button.
 * Sound one way only: the tier a cell really holds is never taken out, which
 * the tests check on every covered cell of real boards played part-way
 * (decision 0010).
 */
export function noteCandidates(game: RuleView, cell: Cell): number {
  const rule = placementRule(game.config.placement);
  let mask = allNotes(game.config.tiers);
  if (!rule.coveredCanBeEmpty) mask &= ~noteBit(0);
  const allowed = rule.candidates(cell, game);
  if (allowed !== null) mask &= allowed;
  return mask;
}

/**
 * Would `toggleNote` accept this tier on this cell? Taking a candidate OFF is
 * always allowed — a note pencilled before the board ruled it out has to stay
 * erasable — so only adding one is held to `noteCandidates`.
 */
export function canNote(game: RuleView, cell: Cell, tier: number): boolean {
  return hasNote(cell.notes, tier) || hasNote(noteCandidates(game, cell), tier);
}

/** Rub out a cell's pencil marks entirely. */
export function clearNotes(game: PencilHost, x: number, y: number): GameEvent[] {
  if (game.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
  const cell = game.cellAt(x, y);
  if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];
  const from = cell.notes;
  if (from === 0) return [];
  cell.notes = 0;
  return [{ type: 'noted', x, y, from, to: 0 }];
}
