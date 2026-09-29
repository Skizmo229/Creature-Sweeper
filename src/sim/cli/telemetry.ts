/**
 * Read a play statistics code (`src/ui/telemetry.ts`) a player has pasted from the backup
 * screen, and print what each board cost them, one row a board, the tuned dials first and any
 * play on modified dials after.
 *
 *   npm run telemetry -- CST1:...            the code itself
 *   npm run telemetry -- stats.txt           a file holding it
 *
 * Per attempt: cells opened by hand and how many were guesses (opened while not provable, marks
 * untrusted), sweeps, casts, hints, HP lost and seconds; `deaths` is what dealt each loss, the
 * tier or `time`. Beside `npm run sim:human`'s row for the same board, this is what says whether
 * a person plays like the graded player, and at what grade.
 */

import { existsSync, readFileSync } from 'node:fs';
import { type BoardStats, type StatsRow, decodeTelemetry, statsRows } from '../../ui/telemetry.js';

function table(title: string, bucket: Record<string, BoardStats>): void {
  const rows = statsRows(bucket);
  console.log(`\n${title}: ${rows.length} board${rows.length === 1 ? '' : 's'}\n`);
  if (!rows.length) return;
  console.log(
    'board             tries clear | opens guess sweep cast hint |   hp  secs | deaths'.replace(
      /\s+$/,
      '',
    ),
  );
  const f = (n: number, w: number, d = 1) => n.toFixed(d).padStart(w);
  for (const r of rows as StatsRow[]) {
    console.log(
      `${r.key.padEnd(17)} ${String(r.attempts).padStart(5)} ${(100 * r.clearRate).toFixed(0).padStart(4)}% |` +
        `${f(r.opens, 6)}${f(r.guesses, 6)}${f(r.sweeps, 6)}${f(r.casts, 5)}${f(r.hints, 5)} |` +
        `${f(r.hpLost, 5)}${f(r.seconds, 6, 0)} | ${r.deaths}`,
    );
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error('usage: npm run telemetry -- <code or file>');
  process.exit(2);
}
const text = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
const result = decodeTelemetry(text);
if (!result.ok) {
  console.error(`cannot read that: ${result.error}`);
  process.exit(1);
}
const stamp = [
  result.game && `version ${result.game}`,
  result.exported && `exported ${result.exported.slice(0, 10)}`,
].filter(Boolean);
if (stamp.length) console.log(`A code from ${stamp.join(', ')}.`);
console.log(`Play statistics${result.exported ? `, exported ${result.exported}` : ''}.`);
table('Tuned dials', result.data.tuned);
table('Modified dials', result.data.modified);
