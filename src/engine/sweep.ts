/**
 * Sweep's proof: which covered cells the board has already shown to be safe.
 *
 * The base rule: a revealed cell's number is the SUM of its neighbouring tiers, so if the part
 * still hidden is at or below your level, no single hidden neighbour can exceed your level, and
 * a creature at or below your level costs nothing to kill. The other proofs are the placement
 * rule's, asked through its `cap`, `ringProof` and `emptied` (docs/modes.md). With `useMarks` the
 * player's marks are subtracted from the sum too, which reaches further but is a claim rather than
 * a proof: a wrong mark can cost HP.
 *
 * Sweep must stay strictly weaker than any generator's solver, which is only not automatic on a
 * guess-free rule (SUDOKU, decision 0027): there it harvests written tiers and never reads the
 * rule. Pencil notes are never read as a claim of safety, only as a guard (docs/invariants.md).
 */

import type { BoardConfig, Cell, GameStatus, SweepOptions } from './types.js';
import { hasNotes, lowestNote } from './notes.js';
import { placementRule } from './placement/registry.js';
import type { Grid } from './grid.js';

/** What the proof reads off a game. `Game` satisfies it. */
export interface SweepView {
  readonly grid: Grid;
  readonly config: BoardConfig;
  readonly level: number;
  readonly status: GameStatus;
  neighboursOf(cell: Cell): Cell[];
}

/** Cells that Sweep would open. */
export function safeCells(game: SweepView, options: SweepOptions = {}): Cell[] {
  const useMarks = options.useMarks ?? true;
  if (game.status !== 'playing' || game.level <= 0) return [];
  const rule = placementRule(game.config.placement);
  if (rule.guessFree) return markedSafe(game, useMarks);

  const { level } = game;
  // Once per call, not per cell: a rule's proof may be shared across a whole group of creatures.
  const ringFree = rule.ringProof(game, level);
  const emptied = rule.emptied(game);

  const out: Cell[] = [];
  const seen = new Set<Cell>();
  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present || !cell.open) continue;
      const ring = game.neighboursOf(cell);
      const facts = readRing(cell, ring);

      const proven =
        provenBySum(facts, level) ||
        provenByCensus(cell, facts, level) ||
        (ringFree !== null && ringFree(cell, ring));
      const claimedSafe = useMarks && claimedByMarks(facts, level);
      // The rule's per-neighbour proofs: a cap on what one cell can hide, and cells proven empty.
      const cellProof = (n: Cell): boolean =>
        rule.cap(n, facts.hidden, facts.covered) <= level || emptied.has(n);

      if (!proven && !claimedSafe && !ring.some((n) => !n.open && cellProof(n))) continue;

      for (const n of ring) {
        if (n.open || seen.has(n)) continue;
        // The player's own lock always wins, written as a value or as a set.
        if (n.mark > level) continue;
        if (hasNotes(n.notes) && lowestNote(n.notes) > level) continue;
        if (!proven && !cellProof(n)) {
          // Only the mark-assisted bound is left, and it covers only the UNMARKED neighbours:
          // the marked ones are the assumption that produced it, never a conclusion from it.
          if (!claimedSafe || n.mark > 0) continue;
        }
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/** What one open cell's ring shows: the sum already known, the marks claimed, what is covered. */
interface RingFacts {
  /** The number's hidden remainder once open neighbours are subtracted. */
  hidden: number;
  /** Sum of the marks on covered neighbours. */
  claimed: number;
  hasClaims: boolean;
  openCreatures: number;
  /** The covered neighbours, marked or not: together they hold `hidden`. */
  covered: Cell[];
}

function readRing(cell: Cell, ring: Cell[]): RingFacts {
  // Open ground counts 0 and a defeated creature's tier is a fact: subtracting them is free
  // certainty. A 7 beside a dead tier-6 only hides a 1.
  let known = 0;
  let claimed = 0;
  let hasClaims = false;
  let openCreatures = 0;
  const covered: Cell[] = [];
  for (const n of ring) {
    if (n.open) {
      known += n.tier;
      if (n.tier > 0) openCreatures++;
    } else {
      covered.push(n);
      if (n.mark > 0) {
        claimed += n.mark;
        hasClaims = true;
      }
    }
  }
  return { hidden: cell.num - known, claimed, hasClaims, openCreatures, covered };
}

/** The covered neighbours together sum to at most your level, so no single one can exceed it. */
function provenBySum(facts: RingFacts, level: number): boolean {
  return facts.hidden <= level;
}

/**
 * Proven by counting. A Census says how many creatures share the hidden sum; each is worth at
 * least 1, so the biggest is capped at the sum less one for every other. A fact, so it stands
 * with the proofs rather than with the marks; without it a Census was information Sweep could not
 * act on.
 */
function provenByCensus(cell: Cell, facts: RingFacts, level: number): boolean {
  if (cell.census === null) return false;
  const hiddenCreatures = cell.census - facts.openCreatures;
  return hiddenCreatures > 0 && facts.hidden - (hiddenCreatures - 1) <= level;
}

/**
 * The same bound as `provenBySum`, after trusting the player's marks. A negative residual means
 * the marks contradict the number, so the claim is already known to be wrong and is not acted on.
 */
function claimedByMarks(facts: RingFacts, level: number): boolean {
  const residual = facts.hidden - facts.claimed;
  return facts.hasClaims && residual >= 0 && residual <= level;
}

/**
 * Sweep on a guess-free (Sudoku) board: harvest the cells whose tier is written down and within your level.
 * Givens under the strict button (the board talking), the player's marks under the assisted one.
 * Measured, the neighbour-sum proof finds nothing at this density, and this cannot run away,
 * because marks are player-authored and nothing regenerates them.
 */
function markedSafe(game: SweepView, useMarks: boolean): Cell[] {
  const out: Cell[] = [];
  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present || cell.open) continue;
      if (cell.mark <= 0 || cell.mark > game.level) continue;
      if (!cell.given && !useMarks) continue;
      out.push(cell);
    }
  }
  return out;
}
