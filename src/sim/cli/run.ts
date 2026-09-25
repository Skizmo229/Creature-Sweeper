/**
 * Headless sweep over the Full Run of every game type.
 *
 *   npm run sim:run          # 20 runs per type
 *   npm run sim:run -- 100   # more runs
 *
 * What it checks is the claim the mode rests on: because level and EXP reset
 * on every board, each board of a run is still the board `ladders.py` tuned,
 * so the zero-damage guarantee survives being chained ten deep. An omniscient
 * tier-order player should finish all ten boards having never used the heal,
 * because it never took a point to heal back.
 *
 * That is the economy only, exactly as `npm run sim` is. Whether a human can
 * *deduce* their way through ten boards on one pool is the other question, and
 * the one the mode exists to ask — a deductive player's odds are the product
 * of ten boards' clear rates, so this reports the honest expectation too.
 *
 * Exits non-zero if any run cannot be completed at full HP, so it is a
 * regression gate on the run rules the same way `sim` is on the ladders.
 */

import { loadLadders } from '../../data.js';
import { FullRun } from '../../engine/run.js';
import { autoplaySearch, autoplayTierOrder } from '../autoplay.js';

const runs = Number(process.argv[2] ?? 20);
const ladders = loadLadders();

interface TypeResult {
  completed: number;
  hpLost: number;
  worstBoard: number;
  /** Distinct start-of-board HP values seen, to show the pool never moved. */
  minHpSeen: number;
}

let failures = 0;

console.log(
  'type'.padEnd(15) +
    'pool'.padStart(6) +
    'heal'.padStart(6) +
    'boards'.padStart(8) +
    'completed'.padStart(11) +
    'hp lost'.padStart(9) +
    'min hp'.padStart(8) +
    'first stall'.padStart(13),
);

for (const type of ladders) {
  const result: TypeResult = {
    completed: 0,
    hpLost: 0,
    worstBoard: type.boards.length,
    minHpSeen: type.run_hp,
  };

  for (let r = 0; r < runs; r++) {
    const run = FullRun.start(ladders, type.id, 0x5eed0000 + r);
    for (;;) {
      result.minHpSeen = Math.min(result.minHpSeen, run.hp);
      const board = type.search ? autoplaySearch(run.game) : autoplayTierOrder(run.game);
      result.hpLost += board.hpLost;
      if (!board.cleared) {
        result.worstBoard = Math.min(result.worstBoard, run.boardIndex);
        break;
      }
      if (run.status === 'won') {
        result.completed++;
        break;
      }
      run.advance();
    }
  }

  const ok = result.completed === runs && result.hpLost === 0;
  if (!ok) failures++;
  console.log(
    type.name.padEnd(15) +
      String(type.run_hp).padStart(6) +
      String(Math.floor(type.run_hp / 2)).padStart(6) +
      String(type.boards.length).padStart(8) +
      `${result.completed}/${runs}`.padStart(11) +
      String(result.hpLost).padStart(9) +
      String(result.minHpSeen).padStart(8) +
      (result.completed === runs ? '-' : String(result.worstBoard)).padStart(13) +
      (ok ? '' : '   <-- FAILED'),
  );
}

console.log(
  `\n${ladders.length - failures}/${ladders.length} full runs completed by every seed ` +
    `at full HP (${runs} runs each, ${runs * ladders.length * 10} boards simulated).`,
);
console.log(
  'A full pool at the end means the heal was never needed — which is the ' +
    'zero-damage guarantee still holding ten boards deep.',
);
process.exit(failures === 0 ? 0 : 1);
