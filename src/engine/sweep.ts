/**
 * Sweep's proof: which covered cells the board has already shown to be safe.
 *
 * The base rule: a revealed cell's number is the SUM of its neighbouring tiers, so if the part
 * still hidden is at or below your level, no single hidden neighbour can exceed your level, and
 * a creature at or below your level costs nothing to kill. The other proofs are the placement
 * rules read the same way (docs/modes.md). With `useMarks` the player's marks are subtracted from
 * the sum too, which reaches further but is a claim rather than a proof: a wrong mark can cost HP.
 *
 * Sweep must stay strictly weaker than any generator's solver, which is only not automatic on
 * SUDOKU (decision 0027): there it harvests the player's own marks and never reads the Sudoku
 * rule. Pencil notes are never read as a claim of safety, only as a guard (docs/invariants.md).
 */

import type { BoardConfig, Cell, GameStatus, SweepOptions } from './types.js';
import { hiddenCap, shadeOf } from './placement/checker.js';
import { congoClear } from './placement/congo.js';
import { hasNotes, lowestNote } from './notes.js';
import { isPacked, missingFrom } from './placement/packs.js';
import { isPaired, ringIsFree } from './placement/pairs.js';
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
  if (game.config.placement === 'sudoku') return markedSafe(game, useMarks);

  const { level } = game;
  const checkered = game.config.placement === 'checker';
  const paired = isPaired(game.config.placement);
  // The strongest tier each open creature's pack could still be hiding, worked out once per call
  // because a pack's piece is shared by every creature in it. A congo line is a pack.
  const packGaps = isPacked(game.config.placement)
    ? missingFrom(game.grid.flat(), (c) => game.neighboursOf(c), game.config.tiers)
    : null;
  // Cells the congo line's own shape has proven empty; decided per cell, like the parity proof.
  const lineClear =
    game.config.placement === 'congo' ? congoClear(game.grid, game.config.tiers) : null;

  const out: Cell[] = [];
  const seen = new Set<Cell>();
  for (const row of game.grid) {
    for (const cell of row) {
      if (!cell.present || !cell.open) continue;
      const ring = game.neighboursOf(cell);
      const facts = readRing(cell, ring, checkered);

      const proven =
        provenBySum(facts, level) ||
        provenByCensus(cell, facts, level) ||
        (paired && ringIsFree(cell, ring, level)) ||
        provenByPack(packGaps, cell, level);
      const claimedSafe = useMarks && claimedByMarks(facts, level);
      // The two per-neighbour proofs: colour and line.
      const cellProof = (n: Cell): boolean =>
        (checkered && hiddenCap(shadeOf(n), facts.hidden, facts.darkCovered) <= level) ||
        (!!lineClear && lineClear.has(n));

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

/** What one open cell's ring shows: the sum already known, the marks claimed, and who is dark. */
interface RingFacts {
  /** The number's hidden remainder once open neighbours are subtracted. */
  hidden: number;
  /** Sum of the marks on covered neighbours. */
  claimed: number;
  hasClaims: boolean;
  openCreatures: number;
  /** Covered dark neighbours on a checkerboard, marked or not; zero elsewhere. */
  darkCovered: number;
}

function readRing(cell: Cell, ring: Cell[], checkered: boolean): RingFacts {
  // Open ground counts 0 and a defeated creature's tier is a fact: subtracting them is free
  // certainty. A 7 beside a dead tier-6 only hides a 1.
  let known = 0;
  let claimed = 0;
  let hasClaims = false;
  let openCreatures = 0;
  let darkCovered = 0;
  for (const n of ring) {
    if (n.open) {
      known += n.tier;
      if (n.tier > 0) openCreatures++;
    } else {
      // Counted whether or not the cell carries a mark: the parity proof is about what the cells
      // ARE, and counting only the unmarked would make a proof depend on annotation.
      if (checkered && shadeOf(n) === 'dark') darkCovered++;
      if (n.mark > 0) {
        claimed += n.mark;
        hasClaims = true;
      }
    }
  }
  return { hidden: cell.num - known, claimed, hasClaims, openCreatures, darkCovered };
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
 * Proven by packs. Packs never touch, so every covered neighbour of an open creature is a packmate
 * or empty ground, and a packmate is one of the tiers its pack has not shown. When the strongest
 * of those is within your level the ring is free; when nothing is missing it is free at any level.
 */
function provenByPack(packGaps: Map<Cell, number> | null, cell: Cell, level: number): boolean {
  if (!packGaps) return false;
  const gap = packGaps.get(cell);
  return gap !== undefined && gap <= level;
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
 * Sweep on a Sudoku board: harvest the cells whose tier is written down and within your level.
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
