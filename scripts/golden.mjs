#!/usr/bin/env node
/**
 * Golden simulator output: the behaviour-preservation harness for refactors.
 *
 *   npm run sim:golden          # record test/golden/*.txt
 *   npm run sim:golden:check    # re-run every simulator and diff; non-zero on any difference
 *
 * Every board is a pure function of (config, seed) and every simulator uses fixed seeds, so the
 * text a simulator prints is a fingerprint of the engine's behaviour over hundreds of boards. A
 * refactor that changes no behaviour leaves every file byte-identical; one that changes anything
 * is caught here without a test having to be written for it first.
 *
 * The settings are small on purpose. The check runs before every hand-over and in CI, so the
 * whole set has to finish in a few minutes. It measures sameness, not quality; the simulators'
 * own defaults are for that.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'test', 'golden');
const TSX = createRequire(import.meta.url).resolve('tsx/cli');

/**
 * What to run: name -> simulator script and its arguments.
 *
 * Together these exercise every ladder (cli/boards.ts sweeps all 774 boards), every Full Run, the
 * honest player on a magic ladder, a crawl ladder and one of each placement rule, the complete
 * deducer, the lethal-guess policy, Sudoku generation and the topology experiment.
 */
const RUNS = {
  boards: ['src/sim/cli/boards.ts', '3'],
  runs: ['src/sim/cli/run.ts', '3'],
  'spells-arcane': ['src/sim/cli/spellvalue.ts', '4', 'arcane'],
  'spells-dungeon': ['src/sim/cli/spellvalue.ts', '4', 'dungeon'],
  'spells-checker': ['src/sim/cli/spellvalue.ts', '4', 'checker'],
  'spells-pairs': ['src/sim/cli/spellvalue.ts', '4', 'pairs'],
  'spells-dominoes': ['src/sim/cli/spellvalue.ts', '4', 'dominoes'],
  'spells-packs': ['src/sim/cli/spellvalue.ts', '4', 'packs'],
  'spells-congo': ['src/sim/cli/spellvalue.ts', '4', 'congo'],
  'spells-workout': ['src/sim/cli/spellvalue.ts', '4', 'workout'],
  'forced-arcane': ['src/sim/cli/forced.ts', '3', 'arcane', '8-10'],
  'lethal-extreme': ['src/sim/cli/lethal.ts', '3', 'extreme'],
  sudoku: ['src/sim/cli/sudoku.ts', '3'],
  topology: ['src/sim/cli/topology.ts', '8'],
};

function run(name) {
  const [script, ...args] = RUNS[name];
  // Always the real ladder data, never a candidate file a retune left in the environment.
  const env = { ...process.env };
  delete env.CS_LADDERS;
  const started = Date.now();
  const result = spawnSync(process.execPath, [TSX, script, ...args], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.error) throw result.error;
  const text =
    `$ ${script} ${args.join(' ')}\n` +
    (result.stdout + result.stderr).replace(/\r\n/g, '\n') +
    `\n[exit ${result.status}]\n`;
  return { text, seconds };
}

function fileFor(name) {
  return path.join(DIR, `${name}.txt`);
}

function record(names) {
  fs.mkdirSync(DIR, { recursive: true });
  for (const name of names) {
    const { text, seconds } = run(name);
    fs.writeFileSync(fileFor(name), text);
    console.log(`recorded ${name} (${seconds} s)`);
  }
}

function check(names) {
  let failed = 0;
  for (const name of names) {
    const expected = fileFor(name);
    if (!fs.existsSync(expected)) {
      console.log(`MISSING ${name}: run \`npm run sim:golden\` to record it`);
      failed++;
      continue;
    }
    const { text, seconds } = run(name);
    const wanted = fs.readFileSync(expected, 'utf8').replace(/\r\n/g, '\n');
    if (text === wanted) {
      console.log(`ok      ${name} (${seconds} s)`);
      continue;
    }
    failed++;
    console.log(`DIFFERS ${name} (${seconds} s)`);
    const actual = path.join(os.tmpdir(), `golden-${name}-${process.pid}.txt`);
    fs.writeFileSync(actual, text);
    const diff = spawnSync('git', ['diff', '--no-index', '--color=never', expected, actual], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const lines = (diff.stdout || '').split('\n');
    console.log(lines.slice(0, 80).join('\n'));
    if (lines.length > 80)
      console.log(`... (${lines.length - 80} more lines; full output at ${actual})`);
    else fs.unlinkSync(actual);
  }
  console.log(failed === 0 ? '\nall golden outputs match' : `\n${failed} golden output(s) differ`);
  process.exit(failed === 0 ? 0 : 1);
}

const argv = process.argv.slice(2);
const checking = argv.includes('--check');
const only = argv.filter((a) => !a.startsWith('--'));
for (const name of only) {
  if (!(name in RUNS)) {
    console.error(`unknown golden run "${name}"; known: ${Object.keys(RUNS).join(', ')}`);
    process.exit(2);
  }
}
const names = only.length ? only : Object.keys(RUNS);
if (checking) check(names);
else record(names);
