/**
 * What each board demands of a person: the graded player over the ladders.
 *
 *   npm run sim:human -- [seeds]                   every ladder, one row each, grades 2 and 4
 *   npm run sim:human -- [seeds] normal            one ladder, board by board, grades 1 to 4
 *   npm run sim:human -- [seeds] normal 7-10       only those boards
 *   npm run sim:human -- [seeds] normal --profile  how often each trick fired, per board
 *   npm run sim:human -- [seeds] pairs --peek      read numbers the game hides (PAIRS, DOMINOES)
 *   npm run sim:human -- [seeds] oracle --solver   with the complete deducer attached: `forced`
 *   npm run sim:human -- [seeds] oracle --spells   spending mana: Reveal, Augur, Census, Beacon,
 *                                                  Exercise
 *   npm run sim:human -- [seeds] huge --attention=4   look within 4 cells of the last action first
 *
 * The graded player (`graded.ts`) plays with the tricks of `docs/strategies.md` up to a grade,
 * one pass at a time, and records the hardest grade a board demanded, how often each grade was
 * needed, how many moves were on offer when it had to look, and what it had to guess. The
 * columns:
 *
 *   stuck    passes on which nothing at that grade yielded, a board; each ends in a guess, a
 *            cast (--spells) or a rescue (--solver)
 *   guess    guesses taken; lethal, those whose worst case could kill at the HP of the moment
 *   clear    share of boards finished; hp, HP lost a board
 *   need>=g  share of boards on which the grade-4 player needed a trick of grade g or above
 *   avail    moves on offer per pass above grade 0, for the grade-4 player: low means scanning
 *   effort   passes weighted by grade cost, plus the guesses (`PASS_COST`, `GUESS_COST`)
 *   unsound  times a trick was wrong about a cell; must be 0
 *   forced   with --solver: stuck points the complete deducer could not rescue either
 *
 * Spell-less unless --spells, and the search ladders are played at level 0. SUDOKU is left out:
 * it is generated guess-free and its tricks are Sudoku's own.
 */

import { loadLadders } from '../../data.js';
import { boardConfig, type LadderType } from '../../engine/config.js';
import { Game } from '../../engine/game.js';
import { placementRule } from '../../engine/placement/registry.js';
import { type GradedOptions, type GradedRun, play } from '../graded.js';
import { solve } from '../solver.js';
import { type Grade, TRICK_IDS, TRICKS } from '../tricks.js';

const seedAt = (s: number): number => s * 2654435761 + 11;

interface Flags {
  peek: boolean;
  spells: boolean;
  attention: number;
  profile: boolean;
  solver: boolean;
}

function measure(type: LadderType, board: number, seeds: number, grade: Grade, f: Flags) {
  const cfg = boardConfig(loadLadders(), type.id, board);
  const runs: GradedRun[] = [];
  for (let s = 0; s < seeds; s++) {
    const options: GradedOptions = {
      grade,
      peek: f.peek,
      spells: f.spells,
      attention: f.attention,
    };
    if (f.solver) options.rescue = (g) => solve(g).safe;
    runs.push(play(Game.create(cfg, seedAt(s)), options));
  }
  return runs;
}

const mean = (rs: GradedRun[], pick: (r: GradedRun) => number): number =>
  rs.reduce((a, r) => a + pick(r), 0) / Math.max(1, rs.length);
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;
const share = (rs: GradedRun[], test: (r: GradedRun) => boolean): string =>
  pct(mean(rs, (r) => (test(r) ? 1 : 0)));
const avail = (rs: GradedRun[]): string => {
  const passes = rs.reduce((a, r) => a + r.availablePasses, 0);
  return passes ? (rs.reduce((a, r) => a + r.availableSum, 0) / passes).toFixed(1) : '-';
};
const unsound = (rs: GradedRun[]): number =>
  rs.reduce((a, r) => a + r.unsound + r.trickDamage + r.rescueDamage, 0);

/** The ladders measured: everything but a guess-free rule's. */
function measuredLadders(): LadderType[] {
  const ladders = loadLadders();
  return ladders.filter((t) => !placementRule(boardConfig(ladders, t.id, 1).placement).guessFree);
}

function findLadder(typeId: string): LadderType {
  const type = measuredLadders().find((t) => t.id === typeId);
  if (!type) throw new Error(`no measured ladder "${typeId}"`);
  return type;
}

function gradeCells(rs: GradedRun[]): string {
  return `${mean(rs, (r) => r.stuckPoints)
    .toFixed(1)
    .padStart(7)}${share(rs, (r) => r.cleared).padStart(6)}`;
}

function detailCells(rs: GradedRun[], f: Flags): string {
  return (
    `${mean(rs, (r) => r.stuckPoints)
      .toFixed(1)
      .padStart(7)}` +
    `${mean(rs, (r) => r.guesses)
      .toFixed(1)
      .padStart(6)}` +
    `${mean(rs, (r) => r.lethalGuesses)
      .toFixed(1)
      .padStart(7)}` +
    `${share(rs, (r) => r.cleared).padStart(6)}` +
    `${mean(rs, (r) => r.hpLost)
      .toFixed(1)
      .padStart(5)} |` +
    `${share(rs, (r) => r.hardestGrade >= 2).padStart(6)}` +
    `${share(rs, (r) => r.hardestGrade >= 3).padStart(5)}` +
    `${share(rs, (r) => r.hardestGrade >= 4).padStart(5)} |` +
    `${avail(rs).padStart(6)}` +
    `${mean(rs, (r) => r.effort)
      .toFixed(0)
      .padStart(7)} |` +
    `${String(unsound(rs)).padStart(8)}` +
    (f.solver
      ? `${mean(rs, (r) => r.stuckPoints - r.rescued)
          .toFixed(1)
          .padStart(8)}`
      : '')
  );
}

function byBoard(seeds: number, type: LadderType, only: [number, number] | undefined, f: Flags) {
  console.log(
    `${type.name}, board by board, ${seeds} seeds each, ${spent(f)}` +
      `${f.peek ? ', reading hidden numbers' : ''}${f.solver ? ', complete deducer attached' : ''}.\n`,
  );
  console.log(
    'board density | grade 1: stuck clear | grade 2: stuck clear | grade 3: stuck clear |' +
      ' grade 4: stuck guess lethal clear   hp | need>=2  >=3  >=4 | avail effort | unsound' +
      (f.solver ? '  forced' : ''),
  );
  for (const b of type.boards) {
    if (only && (b.n < only[0] || b.n > only[1])) continue;
    const at = (g: Grade) => measure(type, b.n, seeds, g, f);
    console.log(
      `${String(b.n).padStart(5)} ${b.density.toFixed(1).padStart(6)}% |` +
        `${gradeCells(at(1)).padStart(21)} |${gradeCells(at(2)).padStart(21)} |` +
        `${gradeCells(at(3)).padStart(21)} |${detailCells(at(4), f)}`,
    );
  }
}

/** Whether the runs spent mana, for a heading; the tables read differently if they did. */
const spent = (f: Flags): string => (f.spells ? 'spending mana' : 'spell-less');

function everyLadder(seeds: number, f: Flags): void {
  console.log(`Every ladder, its ten tuned boards, ${seeds} seeds each, ${spent(f)}.\n`);
  console.log(
    'ladder         | grade 2: stuck clear |' +
      ' grade 4: stuck guess lethal clear   hp | need>=2  >=3  >=4 | avail effort | unsound' +
      (f.solver ? '  forced' : '') +
      ' | #10 clear g2  g4',
  );
  for (const type of measuredLadders()) {
    const two = type.boards.map((b) => measure(type, b.n, seeds, 2, f));
    const four = type.boards.map((b) => measure(type, b.n, seeds, 4, f));
    console.log(
      `${type.name.padEnd(14)} |${gradeCells(two.flat()).padStart(21)} |` +
        `${detailCells(four.flat(), f)} |` +
        `${share(two[two.length - 1]!, (r) => r.cleared).padStart(13)}` +
        `${share(four[four.length - 1]!, (r) => r.cleared).padStart(5)}`,
    );
  }
}

function profile(seeds: number, type: LadderType, only: [number, number] | undefined, f: Flags) {
  console.log(
    `${type.name}: cells each trick concluded, a board, grade 4, ${seeds} seeds; ` +
      'and the candidate sets it narrowed, over the boards.\n',
  );
  const boards = type.boards.filter((b) => !only || (b.n >= only[0] && b.n <= only[1]));
  const rows = boards.map((b) => measure(type, b.n, seeds, 4, f));
  console.log(
    `${'trick'.padEnd(16)}grade${boards.map((b) => String(b.n).padStart(7)).join('')}  pencils`,
  );
  for (const id of TRICK_IDS) {
    const wrong = rows.reduce((a, rs) => a + rs.reduce((b, r) => b + r.unsoundBy[id], 0), 0);
    console.log(
      `${id.padEnd(16)}${String(TRICKS[id].grade).padStart(5)}` +
        rows
          .map((rs) =>
            mean(rs, (r) => r.fires[id])
              .toFixed(1)
              .padStart(7),
          )
          .join('') +
        mean(rows.flat(), (r) => r.pencils[id])
          .toFixed(1)
          .padStart(9) +
        (wrong ? `   UNSOUND ${wrong}` : ''),
    );
  }
  console.log(
    `${'scans'.padEnd(21)}` +
      rows
        .map((rs) =>
          mean(rs, (r) => r.scans)
            .toFixed(1)
            .padStart(7),
        )
        .join(''),
  );
  console.log(
    `${'passes >= 1'.padEnd(21)}` +
      rows
        .map((rs) =>
          mean(rs, (r) => r.passesByGrade.slice(1).reduce((a, b) => a + b, 0))
            .toFixed(1)
            .padStart(7),
        )
        .join(''),
  );
}

const args = process.argv.slice(2);
const flags: Flags = {
  peek: args.includes('--peek'),
  spells: args.includes('--spells'),
  attention: Number(args.find((a) => a.startsWith('--attention='))?.slice(12) ?? 0),
  profile: args.includes('--profile'),
  solver: args.includes('--solver'),
};
const words = args.filter((a) => !a.startsWith('--'));
const seeds = Number(words[0] ?? 30);
const range = words[2]?.split('-').map(Number);
const only: [number, number] | undefined = range ? [range[0]!, range[1] ?? range[0]!] : undefined;
if (words[1] && flags.profile) profile(seeds, findLadder(words[1]), only, flags);
else if (words[1]) byBoard(seeds, findLadder(words[1]), only, flags);
else everyLadder(seeds, flags);
