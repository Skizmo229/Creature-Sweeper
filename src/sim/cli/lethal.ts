/**
 * Can every forced guess be survived? The weaker target for solvable boards.
 *
 *   npx tsx src/sim/cli/lethal.ts [seeds] [ladder,ladder,...]   board by board
 *
 * `sim:forced` showed that a guess-free board 10 does not exist on EXTREME,
 * HUGE x EXTREME or ORACLE — a perfect deducer is cornered on every one — so
 * generation cannot demand "no guesses" there. The weaker target, and the one
 * HP-as-a-guess-budget already implies, is that no forced guess can KILL:
 * whenever deduction runs out, some cell within reach is proven below the tier
 * that would end the board at the player's current HP.
 *
 * This plays the perfect deducer — the honest player taking every move the
 * solver proves free — and when it has to guess, guesses as carefully as a
 * perfect player could: the cell whose WORST case is lowest, found by asking
 * the solver which cells are proven at or below each tier in turn, with the
 * honest player's own judgement breaking the tie among them. At each forced
 * guess it records whether that lowest worst case could have killed.
 *
 * A board where no forced guess could kill is a board that cannot be lost by
 * a perfect player, since nothing on it can end it — so the share of such
 * boards is exactly what generate-and-test would keep under the weaker target,
 * set beside what it keeps under the strict one (`no guess`).
 */

import { loadLadders } from '../../data.js';
import { boardConfig, type LadderType } from '../../engine/config.js';
import { resolveBattle } from '../../engine/combat.js';
import { Game } from '../../engine/game.js';
import { biteFor } from '../../engine/settings.js';
import type { Cell } from '../../engine/types.js';
import { honestGuess, play, type Run } from '../honest.js';
import { solve } from '../solver.js';

interface Board {
  run: Run;
  /** Forced guesses whose safest option could still have killed. */
  risky: number;
  /** Guesses that turned out above the tier the solver proved them under. Must be 0. */
  unsound: number;
}

const seedAt = (s: number): number => s * 2654435761 + 11;

/** The lowest tier whose fight would end the board from here, or Infinity. */
function lethalTier(game: Game): number {
  for (let t = 1; t <= game.config.tiers; t++) {
    const bite = biteFor(t, game.settings);
    if (resolveBattle(game.level + game.exerciseCharge, game.hp, t, bite).hp <= 0) return t;
  }
  return Infinity;
}

/** Cells within reach proven at or below tier `k`. */
function provenBelow(game: Game, k: number): Cell[] {
  return solve(game, { threshold: k }).safe.filter((c) => !c.open && game.inReach(c));
}

function playBoard(cfg: ReturnType<typeof boardConfig>, seed: number): Board {
  const game = Game.create(cfg, seed);
  const board: Board = { run: undefined as unknown as Run, risky: 0, unsound: 0 };
  board.run = play(game, 'none', null, {
    rescue: (g) => solve(g).safe,
    guess: (g) => {
      // Stuck, so nothing is proven at the player's level: walk the threshold
      // up until something within reach is proven under it.
      let field: Cell[] = [];
      let k = g.level + 1;
      for (; k <= g.config.tiers; k++) {
        field = provenBelow(g, k);
        if (field.length) break;
      }
      if (!field.length) {
        field = g.grid.flat().filter((c) => c.present && !c.open && g.inReach(c));
        k = g.config.tiers;
      }
      if (!field.length) return null;
      if (k >= lethalTier(g)) board.risky++;
      const pick = honestGuess(g, new Set(field)) ?? field[0]!;
      if (pick.tier > k) board.unsound++;
      // The honest player marks what it has named, and a mark above your level
      // locks the cell. Choosing the lowest worst case can mean choosing a
      // creature it has already named — so, like a real player, rub it out
      // and take the fight.
      if (pick.mark > g.level) g.setMark(pick.x, pick.y, 0);
      return pick;
    },
  });
  return board;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

function byBoard(type: LadderType, seeds: number): void {
  const ladders = loadLadders();
  console.log(`\n${type.name}, ${seeds} seeds a board — perfect deduction, safest guessing\n`);
  console.log(
    'board  density  hp |  forced  could kill | no guess  no lethal guess  cleared  hp lost',
  );
  for (const b of type.boards) {
    const cfg = boardConfig(ladders, type.id, b.n);
    const boards = Array.from({ length: seeds }, (_, s) => playBoard(cfg, seedAt(s)));
    console.log(
      `${String(b.n).padStart(4)}  ${b.density.toFixed(1).padStart(6)}% ${String(b.hp).padStart(3)} |` +
        `${mean(boards.map((x) => x.run.stuckPoints))
          .toFixed(1)
          .padStart(8)}` +
        `${mean(boards.map((x) => x.risky))
          .toFixed(1)
          .padStart(12)} |` +
        `${pct(mean(boards.map((x) => (x.run.stuckPoints === 0 ? 1 : 0)))).padStart(9)}` +
        `${pct(mean(boards.map((x) => (x.risky === 0 ? 1 : 0)))).padStart(16)}` +
        `${pct(mean(boards.map((x) => (x.run.cleared ? 1 : 0)))).padStart(9)}` +
        `${mean(boards.map((x) => x.run.hpLost))
          .toFixed(2)
          .padStart(9)}` +
        (boards.some((x) => x.run.rescueDamage) ? '   SOLVER CALLED A HARMFUL CELL FREE' : '') +
        (boards.some((x) => x.unsound) ? '   A GUESS BROKE ITS PROVEN BOUND' : ''),
    );
  }
}

const seeds = Number(process.argv[2] ?? 30);
const wanted = (process.argv[3] ?? 'extreme,huge_extreme,oracle').split(',');
const ladders = loadLadders();
for (const id of wanted) {
  const type = ladders.find((t) => t.id === id);
  if (!type) throw new Error(`no ladder "${id}"`);
  byBoard(type, seeds);
}
