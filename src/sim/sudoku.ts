/**
 * What the SUDOKU ladder's givens schedule costs to build and buys to play.
 *
 * Two questions the schedule cannot be written without.
 *
 * **What does a givens count cost?** Every board is generate-and-test, so the
 * rejection rate IS the build cost. It climbs steeply as givens fall, and
 * where it stops being affordable is the real floor of the ladder — nothing to
 * do with how the board plays.
 *
 * **How hard is what comes out?** Guess-free generation means every board is
 * clearable, so difficulty is not the clear rate; that is 100% by construction
 * and measuring it proves only that the generator did its job. Difficulty is
 * the *shape* of the deduction: how many rounds of deduce-kill-deduce it takes,
 * and how little the tightest round hands you. A board that opens in four big
 * sweeps is a different game from one that opens in twenty single cells.
 *
 * The player here reads only what is on screen — open cells, their numbers, and
 * the givens' marks — and reasons with Sudoku plus the neighbour sums. It drives
 * the real engine, so what it clears is genuinely clear.
 *
 * Run: npm run sim:sudoku [boards-per-rung]
 */

import { loadLadders } from '../data.js';
import { boardConfig, findType } from '../engine/config.js';
import { Game } from '../engine/game.js';
import { mulberry32 } from '../engine/rng.js';
import {
  SUDOKU_SIZE,
  clearableWithoutGuessing,
  sudokuCeiling,
  sudokuDeduction,
  sudokuSolution,
} from '../engine/placement/sudoku.js';

const perRung = Number(process.argv[2] ?? 20);
const ladders = loadLadders();
const type = findType(ladders, 'sudoku');

/** Attempts per accepted board — measured, not assumed. */
function attemptsPerBoard(givens: number, thresholds: readonly number[], want: number): number {
  const rng = mulberry32(0xd0c0 + givens);
  let tried = 0;
  let passed = 0;
  while (passed < want && tried < 60000) {
    tried++;
    const grid = sudokuSolution(rng);
    const creatures: number[] = [];
    for (let y = 0; y < SUDOKU_SIZE; y++)
      for (let x = 0; x < SUDOKU_SIZE; x++) {
        if (grid[y]![x]! > 0) creatures.push(y * SUDOKU_SIZE + x);
      }
    for (let k = creatures.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [creatures[k], creatures[j]] = [creatures[j]!, creatures[k]!];
    }
    if (clearableWithoutGuessing(grid, creatures.slice(0, givens), thresholds)) passed++;
  }
  return passed ? tried / passed : Infinity;
}

interface Play {
  rounds: number;
  tightest: number;
  cleared: boolean;
  hpLost: number;
}

/**
 * Play one board by deduction alone, through the real engine.
 *
 * Each round: look at the board, work out every cell whose whole candidate set
 * is at or below the current level, and open all of them. Those are free kills
 * by Sweep's own bound, read off a candidate set instead of off a number. Stop
 * when a round proves nothing — that is a forced guess, and on this type it
 * should never happen.
 */
function play(game: Game): Play {
  let rounds = 0;
  let tightest = Infinity;

  for (;;) {
    const openTiers: Array<number | null> = [];
    const nums: number[] = [];
    const marks: number[] = [];
    for (let y = 0; y < SUDOKU_SIZE; y++) {
      for (let x = 0; x < SUDOKU_SIZE; x++) {
        const cell = game.grid[y]![x]!;
        openTiers.push(cell.open ? cell.tier : null);
        nums.push(cell.num);
        marks.push(cell.mark);
      }
    }

    const cand = sudokuDeduction(openTiers, nums, marks);
    if (!cand) break; // contradiction: the board lied

    const safe: Array<[number, number]> = [];
    for (let i = 0; i < 81; i++) {
      if (openTiers[i] !== null) continue;
      const ceiling = sudokuCeiling(cand[i]!);
      if (ceiling >= 0 && ceiling <= game.level) {
        safe.push([i % SUDOKU_SIZE, Math.floor(i / SUDOKU_SIZE)]);
      }
    }
    if (!safe.length) break;

    rounds++;
    tightest = Math.min(tightest, safe.length);
    for (const [x, y] of safe) game.open(x, y);
    if (game.status !== 'playing') break;
  }

  return {
    rounds,
    tightest: tightest === Infinity ? 0 : tightest,
    cleared: game.status === 'won',
    hpLost: game.maxHp - game.hp,
  };
}

/**
 * `--sweep` measures givens counts the ladder does not use, which is how you
 * find out whether the schedule has headroom underneath it or is already
 * sitting on the floor.
 */
if (process.argv.includes('--sweep')) {
  const thresholds = boardConfig(ladders, 'sudoku', 10).exp;
  console.log(`Givens sweep against board 10's gates. ${perRung} boards each.\n`);
  console.log('givens   attempts/board   rounds  tightest');
  console.log('-'.repeat(44));
  for (const givens of [20, 18, 16, 14, 12, 10, 8]) {
    const cost = attemptsPerBoard(givens, thresholds, Math.max(4, Math.ceil(perRung / 4)));
    if (!Number.isFinite(cost)) {
      console.log(`${String(givens).padStart(6)}${'none found'.padStart(17)}`);
      continue;
    }
    const cfg = { ...boardConfig(ladders, 'sudoku', 10), givens };
    let rounds = 0;
    let tightest = 0;
    let built = 0;
    for (let i = 0; i < perRung; i++) {
      // Below the floor the generator refuses rather than shipping a board it
      // cannot vouch for. That is the answer to the sweep, not an error.
      let game: Game;
      try {
        game = Game.create(cfg, i * 7919 + 11);
      } catch {
        break;
      }
      const r = play(game);
      rounds += r.rounds;
      tightest += r.tightest;
      built++;
    }
    if (!built) {
      console.log(`${String(givens).padStart(6)}${'below the floor'.padStart(17)}`);
      continue;
    }
    rounds = (rounds / built) * perRung;
    tightest = (tightest / built) * perRung;
    console.log(
      `${String(givens).padStart(6)}${cost.toFixed(1).padStart(17)}` +
        `${(rounds / perRung).toFixed(1).padStart(9)}${(tightest / perRung).toFixed(1).padStart(10)}`,
    );
  }
  process.exit(0);
}

console.log(`SUDOKU — ${perRung} boards a rung\n`);
console.log('board  givens  lock   attempts/board   rounds  tightest    cleared   HP lost');
console.log('-'.repeat(76));

let worst = 0;
let failed = false;

for (const row of type.boards) {
  const cfg = boardConfig(ladders, 'sudoku', row.n);
  const cost = attemptsPerBoard(cfg.givens, cfg.exp, Math.max(5, Math.ceil(perRung / 3)));
  worst = Math.max(worst, cost);

  let rounds = 0;
  let tightest = 0;
  let cleared = 0;
  let hpLost = 0;
  for (let s = 0; s < perRung; s++) {
    const result = play(Game.create(cfg, s * 7919 + 11));
    rounds += result.rounds;
    tightest += result.tightest;
    if (result.cleared) cleared++;
    hpLost += result.hpLost;
  }
  if (cleared !== perRung) failed = true;

  console.log(
    `${String(row.n).padStart(4)}${String(cfg.givens).padStart(8)}${String(row.lock).padStart(6)}` +
      `${cost.toFixed(1).padStart(15)}${(rounds / perRung).toFixed(1).padStart(9)}` +
      `${(tightest / perRung).toFixed(1).padStart(10)}` +
      `${`${cleared}/${perRung}`.padStart(11)}${(hpLost / perRung).toFixed(2).padStart(10)}`,
  );
}

console.log(`\nWorst generation cost: ${worst.toFixed(1)} attempts a board.`);
if (failed) {
  console.error('FAIL: a board resisted pure deduction — generation is not guess-free.');
  process.exit(1);
}
console.log('Every board cleared by deduction alone: no guesses, no damage.');
