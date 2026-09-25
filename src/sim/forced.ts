/**
 * How many of the honest player's forced guesses were really forced.
 *
 *   npx tsx src/sim/forced.ts [seeds]           every battle ladder, one row each
 *   npx tsx src/sim/forced.ts [seeds] oracle    one ladder, board by board
 *   npx tsx src/sim/forced.ts [seeds] oracle 7-10   only those boards
 *
 * Every forced-guess figure in CLAUDE.md comes from the honest player in
 * `honest.ts`, which deduces locally — Sweep's bound, exact tiers, pairs of
 * numbers subtracted, the placement rules read off neighbouring cells. So each
 * figure is an upper bound on what the board really forces. This runs two
 * players per seed on the same board, against the complete deducer in
 * `solver.ts`:
 *
 *   the honest player as it is, asking the solver at each stuck point and
 *   ignoring the answer — which says what share of ITS stuck points had a
 *   free move in them (`free`);
 *
 *   a player that takes the solver's free moves — whose stuck points are the
 *   ones the board forces on anyone (`forced`), whose clear rate is what a
 *   perfect deducer clears guessing the same way (`clear*`), and whose share
 *   of boards with no stuck point at all is what generate-and-test would keep
 *   (`no guess`) — so one minus it is the rejection rate.
 *
 * The solver leaves some structure out (see its header), so `forced` is a
 * floor on what a perfect player would still be forced into and `free` is a
 * floor on what the honest player misses. The last three columns are alarms:
 * `undecided` questions the search budget cut off, layouts the solver could not
 * fit (`bad`), and HP lost on a cell it called free (`hurt`). The last two must
 * be zero or nothing above them means anything.
 */

import { loadLadders } from '../data.js';
import { boardConfig, type LadderType } from '../engine/config.js';
import { Game } from '../engine/game.js';
import { placementRule } from '../engine/placement/registry.js';
import { play, type Run } from './honest.js';
import { solve } from './solver.js';

interface Row {
  honest: Run[];
  solver: Run[];
  undecided: number;
  bad: number;
}

const seedAt = (s: number): number => s * 2654435761 + 11;

function measure(typeId: string, board: number, seeds: number): Row {
  const ladders = loadLadders();
  const cfg = boardConfig(ladders, typeId, board);
  const row: Row = { honest: [], solver: [], undecided: 0, bad: 0 };
  const rescue = (g: Game) => {
    const r = solve(g);
    row.undecided += r.undecided;
    if (r.inconsistent) row.bad++;
    return r.safe;
  };
  for (let s = 0; s < seeds; s++) {
    row.honest.push(play(Game.create(cfg, seedAt(s)), 'none', null, { rescue, observe: true }));
    row.solver.push(play(Game.create(cfg, seedAt(s)), 'none', null, { rescue }));
  }
  return row;
}

const mean = (rs: Run[], pick: (r: Run) => number): number =>
  rs.reduce((a, r) => a + pick(r), 0) / Math.max(1, rs.length);
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;

/** Share of the honest player's stuck points that had a free move in them. */
const freeShare = (rs: Run[]): number => {
  const stuck = rs.reduce((a, r) => a + r.stuckPoints, 0);
  return stuck ? rs.reduce((a, r) => a + r.couldRescue, 0) / stuck : 0;
};

/**
 * The ladders with forced guesses to count: not the search ladders, and not a guess-free rule's
 * (SUDOKU), whose boards are generated so that no deducer is ever forced.
 */
function battleLadders(): LadderType[] {
  const ladders = loadLadders();
  return ladders.filter(
    (t) => !t.search && !placementRule(boardConfig(ladders, t.id, 1).placement).guessFree,
  );
}

function byBoard(seeds: number, typeId: string, only?: [number, number]): void {
  const type = battleLadders().find((t) => t.id === typeId);
  if (!type) throw new Error(`no battle ladder "${typeId}"`);
  console.log(`${type.name}, board by board, ${seeds} seeds each.\n`);
  console.log(
    'board  density |  honest: stuck  clear   free | complete: forced  clear*  no guess |' +
      '  undecided  bad  hurt',
  );
  for (const b of type.boards) {
    if (only && (b.n < only[0] || b.n > only[1])) continue;
    const r = measure(type.id, b.n, seeds);
    console.log(
      `${String(b.n).padStart(4)}  ${b.density.toFixed(1).padStart(6)}% |` +
        `${mean(r.honest, (x) => x.stuckPoints)
          .toFixed(1)
          .padStart(14)}` +
        `${pct(mean(r.honest, (x) => (x.cleared ? 1 : 0))).padStart(7)}` +
        `${pct(freeShare(r.honest)).padStart(7)} |` +
        `${mean(r.solver, (x) => x.stuckPoints)
          .toFixed(1)
          .padStart(16)}` +
        `${pct(mean(r.solver, (x) => (x.cleared ? 1 : 0))).padStart(8)}` +
        `${pct(mean(r.solver, (x) => (x.stuckPoints === 0 ? 1 : 0))).padStart(10)} |` +
        `${String(r.undecided).padStart(11)}${String(r.bad).padStart(5)}` +
        `${String(r.solver.reduce((a, x) => a + x.rescueDamage, 0)).padStart(6)}`,
    );
  }
}

function everyLadder(seeds: number): void {
  console.log(`Every battle ladder, its ten tuned boards, ${seeds} seeds each.\n`);
  console.log(
    'ladder         |  honest: stuck  clear   free | complete: forced  clear*  no guess' +
      '  #10 no guess |  undecided  bad  hurt',
  );
  for (const type of battleLadders()) {
    const rows = type.boards.map((b) => measure(type.id, b.n, seeds));
    const honest = rows.flatMap((r) => r.honest);
    const solver = rows.flatMap((r) => r.solver);
    const last = rows[rows.length - 1]!.solver;
    console.log(
      `${type.name.padEnd(14)} |` +
        `${mean(honest, (x) => x.stuckPoints)
          .toFixed(2)
          .padStart(14)}` +
        `${pct(mean(honest, (x) => (x.cleared ? 1 : 0))).padStart(7)}` +
        `${pct(freeShare(honest)).padStart(7)} |` +
        `${mean(solver, (x) => x.stuckPoints)
          .toFixed(2)
          .padStart(16)}` +
        `${pct(mean(solver, (x) => (x.cleared ? 1 : 0))).padStart(8)}` +
        `${pct(mean(solver, (x) => (x.stuckPoints === 0 ? 1 : 0))).padStart(10)}` +
        `${pct(mean(last, (x) => (x.stuckPoints === 0 ? 1 : 0))).padStart(14)} |` +
        `${String(rows.reduce((a, r) => a + r.undecided, 0)).padStart(11)}` +
        `${String(rows.reduce((a, r) => a + r.bad, 0)).padStart(5)}` +
        `${String(solver.reduce((a, x) => a + x.rescueDamage, 0)).padStart(6)}`,
    );
  }
}

const seeds = Number(process.argv[2] ?? 30);
// A board range, for the ladders slow enough that running all ten to look at
// two is most of the cost: `7-10`, or a single board.
const range = process.argv[4]?.split('-').map(Number);
const only: [number, number] | undefined = range ? [range[0]!, range[1] ?? range[0]!] : undefined;
if (process.argv[3]) byBoard(seeds, process.argv[3], only);
else everyLadder(seeds);
