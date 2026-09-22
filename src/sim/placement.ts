/**
 * What placement rules and board topology do to a board, measured on the real
 * engine.
 *
 *   npx tsx src/sim/placement.ts [trials]
 *     writes design/data/placement.json and design/data/placement-rules.json
 *
 * Replaces `design/placement.py`, and for the reason `opening.ts` replaced
 * `opening.py`: that file reimplemented the board in numpy — its own neighbour
 * sums, its own flood fill for the opening — and a second implementation only
 * stays honest until the first one grows. It had already stopped: it knew
 * nothing about hex grids, the checkerboard or the pairing. Here every number
 * is the engine's own `computeNumbers`, every opening its own
 * `findBestOpening`, and every adjacency its own `neighbours()`.
 *
 * Two tables.
 *
 * `placement.json` is the original experiment, kept so the reference page's
 * table means what it always meant: the same creatures on three test beds,
 * only WHERE they go changing. Scatter and the two topologies are the engine's
 * own generator. The four clustering strategies — triads, triads with pairs,
 * lairs, bands — were design explorations that never shipped, so they exist
 * only here; they build a tier layout and hand it to the engine to measure,
 * which is the half that could drift.
 *
 * `placement-rules.json` is what the old script could not do: each placement
 * rule that DID ship, on its own ladder's board 5, against the very same
 * creatures scattered uniformly. That is the direct measurement of what a rule
 * costs or hands back in opening, which is what the PAIRS note ("the rule was
 * expected to give the board away and does the reverse") argues from.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLadders } from '../data.js';
import { type Grid, computeNumbers, findBestOpening, generateGrid, makeCell } from '../engine/board.js';
import { boardConfig } from '../engine/config.js';
import { mulberry32, type Rng } from '../engine/rng.js';
import type { BoardConfig } from '../engine/types.js';

const TRIALS = Number(process.argv[2] ?? 240);
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', '..', 'design', 'data');
const rng: Rng = mulberry32(31415);

// ---------- a tier layout, for the strategies the engine never had ----------

type Layout = number[][];

const int = (n: number): number => Math.floor(rng() * n);
const blank = (h: number, w: number): Layout => Array.from({ length: h }, () => new Array<number>(w).fill(0));

function free(g: Layout): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  g.forEach((row, y) => row.forEach((t, x) => { if (t === 0) out.push([y, x]); }));
  return out;
}

/** `k` distinct picks from `items`, uniformly. */
function sample<T>(items: T[], k: number): T[] {
  const a = items.slice();
  const n = Math.min(k, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + int(a.length - i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

function fillRemaining(g: Layout, tier: number, n: number): void {
  if (n <= 0) return;
  for (const [y, x] of sample(free(g), n)) g[y]![x] = tier;
}

/** Drop `size` creatures of `tier` inside a random box×box window. */
function placeGroup(g: Layout, tier: number, size: number, box: number, tries = 60): number {
  const h = g.length;
  const w = g[0]!.length;
  for (let t = 0; t < tries; t++) {
    const y0 = int(Math.max(1, h - box + 1));
    const x0 = int(Math.max(1, w - box + 1));
    const spots: Array<[number, number]> = [];
    for (let y = y0; y < Math.min(h, y0 + box); y++) {
      for (let x = x0; x < Math.min(w, x0 + box); x++) if (g[y]![x] === 0) spots.push([y, x]);
    }
    if (spots.length >= size) {
      for (const [y, x] of sample(spots, size)) g[y]![x] = tier;
      return size;
    }
  }
  return 0;
}

function triads(h: number, w: number, q: readonly number[]): Layout {
  const g = blank(h, w);
  let placed = 0;
  for (let i = 0; i < Math.floor(q[0]! / 3); i++) placed += placeGroup(g, 1, 3, 3);
  fillRemaining(g, 1, q[0]! - placed);
  q.slice(1).forEach((n, i) => fillRemaining(g, i + 2, n));
  return g;
}

function clustered(h: number, w: number, q: readonly number[]): Layout {
  const g = blank(h, w);
  let placed1 = 0;
  for (let i = 0; i < Math.floor(q[0]! / 3); i++) placed1 += placeGroup(g, 1, 3, 3);
  const pairs = q.length >= 4 ? Math.floor(Math.min(q[1]!, q[3]!) / 2) : 0;
  let made = 0;
  for (let p = 0; p < pairs; p++) {
    for (let t = 0; t < 60; t++) {
      const y0 = int(Math.max(1, h - 1));
      const x0 = int(Math.max(1, w - 1));
      const spots: Array<[number, number]> = [];
      for (let y = y0; y < Math.min(h, y0 + 2); y++) {
        for (let x = x0; x < Math.min(w, x0 + 2); x++) if (g[y]![x] === 0) spots.push([y, x]);
      }
      if (spots.length >= 2) {
        const [a, b] = sample(spots, 2);
        g[a![0]]![a![1]] = 2;
        g[b![0]]![b![1]] = 4;
        made++;
        break;
      }
    }
  }
  fillRemaining(g, 1, q[0]! - placed1);
  fillRemaining(g, 2, q[1]! - made);
  if (q.length >= 3) fillRemaining(g, 3, q[2]!);
  if (q.length >= 4) fillRemaining(g, 4, q[3]! - made);
  q.slice(4).forEach((n, i) => fillRemaining(g, i + 5, n));
  return g;
}

/** Every top-tier creature sits in a 5x5 with four tier-below escorts. */
function lairs(h: number, w: number, q: readonly number[]): Layout {
  let g = blank(h, w);
  const boss = q.length;
  const escort = boss - 1;
  let madeB = 0;
  let madeE = 0;
  for (let i = 0; i < q[boss - 1]!; i++) {
    const before = g.map((row) => row.slice());
    if (placeGroup(g, boss, 1, 5)) {
      madeB++;
      for (let e = 0; e < 4; e++) madeE += placeGroup(g, escort, 1, 5);
    } else {
      g = before;
    }
  }
  q.forEach((n, i) => {
    const tier = i + 1;
    fillRemaining(g, tier, n - (tier === boss ? madeB : tier === escort ? madeE : 0));
  });
  return g;
}

/** A spatial gradient: low tiers near the rim, high tiers inward. */
function banded(h: number, w: number, q: readonly number[]): Layout {
  const g = blank(h, w);
  const edge = (y: number, x: number): number => Math.min(y, x, h - 1 - y, w - 1 - x);
  let deepest = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) deepest = Math.max(deepest, edge(y, x));
  const T = q.length;
  q.forEach((n, i) => {
    const target = i / Math.max(1, T - 1);
    // Weighted picks without replacement, by the exponential falloff the
    // original used: exp(-|centrality - target| / 0.22).
    const spots = free(g).map(([y, x]) => ({
      y, x, wgt: Math.exp(-Math.abs(edge(y, x) / Math.max(1, deepest) - target) / 0.22),
    }));
    let placed = 0;
    for (let k = 0; k < n && spots.length; k++) {
      const total = spots.reduce((s, p) => s + p.wgt, 0);
      if (total <= 0) break;
      let r = rng() * total;
      let j = 0;
      while (j < spots.length - 1 && (r -= spots[j]!.wgt) > 0) j++;
      const [pick] = spots.splice(j, 1);
      g[pick!.y]![pick!.x] = i + 1;
      placed++;
    }
    fillRemaining(g, i + 1, n - placed);
  });
  return g;
}

// ---------- measurement: the engine's own numbers and opening ----------

interface Measure { opening: number; zeros: number; avgNum: number; maxNum: number }

function measure(grid: Grid, cfg: BoardConfig): Measure {
  const opening = findBestOpening(grid, false, cfg.topology, cfg.wrap);
  let zeros = 0;
  let sum = 0;
  let empty = 0;
  let max = 0;
  for (const cell of grid.flat()) {
    if (!cell.present || cell.tier !== 0) continue;
    empty++;
    sum += cell.num;
    max = Math.max(max, cell.num);
    if (cell.num === 0) zeros++;
  }
  return { opening: opening ? opening.cells.length : 0, zeros, avgNum: empty ? sum / empty : 0, maxNum: max };
}

/** Hand a layout to the engine: real cells, real numbers, real adjacency. */
function fromLayout(layout: Layout, cfg: BoardConfig): Grid {
  const grid: Grid = layout.map((row, y) => row.map((tier, x) => {
    const cell = makeCell(x, y);
    cell.tier = tier;
    return cell;
  }));
  computeNumbers(grid, cfg.topology, cfg.wrap);
  return grid;
}

interface Summary { opening: number; zeros: number; avg_num: number; max_num: number }

function summarise(runs: Measure[]): Summary {
  const median = (xs: number[]): number => {
    const s = xs.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  return {
    opening: median(runs.map((r) => r.opening)),
    zeros: median(runs.map((r) => r.zeros)),
    avg_num: Math.round(100 * runs.reduce((s, r) => s + r.avgNum, 0) / runs.length) / 100,
    max_num: median(runs.map((r) => r.maxNum)),
  };
}

/** Board 5 of a ladder with some of its config swapped out. */
function trial(cfg: BoardConfig, make: () => Grid): Summary | null {
  const runs: Measure[] = [];
  for (let t = 0; t < TRIALS; t++) {
    try { runs.push(measure(make(), cfg)); } catch { return null; }
  }
  return summarise(runs);
}

const ladders = loadLadders();
const engine = (cfg: BoardConfig) => () => generateGrid(cfg, rng);
const layout = (cfg: BoardConfig, fn: (h: number, w: number, q: readonly number[]) => Layout) =>
  () => fromLayout(fn(cfg.height, cfg.width, cfg.quantity), cfg);

// ---------- the original experiment, on three beds ----------

const beds: Array<[string, string]> = [['NORMAL board 5', 'normal'], ['EXTREME board 5', 'extreme'], ['HUGE board 5', 'huge']];
const rows: object[] = [];
for (const [name, id] of beds) {
  const cfg = boardConfig(ladders, id, 5);
  const creatures = cfg.quantity.reduce((a, b) => a + b, 0);
  console.log(`\n=== ${name} — ${cfg.width}×${cfg.height}, ${creatures} creatures, ${cfg.quantity.length} tiers ===`);
  console.log(`${'placement'.padEnd(30)}${'opening'.padStart(9)}${'vs base'.padStart(9)}${'zeros'.padStart(8)}` +
    `${'avg num'.padStart(9)}${'max num'.padStart(9)}`);
  const strategies: Array<[string, BoardConfig, () => Grid]> = [
    ['Scatter (current)', cfg, engine(cfg)],
    ['Tier-1 triads in 3×3', cfg, layout(cfg, triads)],
    ['Triads + 2/4 pairs', cfg, layout(cfg, clustered)],
    ['Apex lairs in 5×5', cfg, layout(cfg, lairs)],
    ['Banded (low rim→high core)', cfg, layout(cfg, banded)],
    ['Scatter + wrap-around', { ...cfg, wrap: 'both' }, engine({ ...cfg, wrap: 'both' })],
    ['Scatter on a hex grid', { ...cfg, topology: 'hex' }, engine({ ...cfg, topology: 'hex' })],
    ['Checkerboard colours', { ...cfg, placement: 'checker' }, engine({ ...cfg, placement: 'checker' })],
  ];
  let base = 0;
  for (const [label, c, make] of strategies) {
    const s = trial(c, make);
    if (!s) { console.log(`${label.padEnd(30)}   cannot be dealt on this bed`); continue; }
    if (!base) base = s.opening;
    const delta = base ? Math.round(100 * (s.opening - base) / base) : 0;
    console.log(`${label.padEnd(30)}${s.opening.toFixed(0).padStart(9)}${`${delta >= 0 ? '+' : ''}${delta}%`.padStart(9)}` +
      `${s.zeros.toFixed(0).padStart(8)}${s.avg_num.toFixed(2).padStart(9)}${s.max_num.toFixed(0).padStart(9)}`);
    rows.push({ bed: name, strategy: label, ...s, delta });
  }
}
writeFileSync(resolve(DATA, 'placement.json'), JSON.stringify(rows, null, 1));

// ---------- every shipped rule, against its own creatures scattered ----------

console.log('\n=== each shipped placement rule on its own board 5, against the same creatures scattered ===');
console.log(`${'ladder'.padEnd(14)}${'scatter'.padStart(9)}${'rule'.padStart(7)}${'change'.padStart(9)}` +
  `${'zeros'.padStart(14)}${'avg num'.padStart(16)}`);
const ruled: object[] = [];
for (const type of ladders) {
  const cfg = boardConfig(ladders, type.id, 5);
  if (cfg.placement === 'uniform' || cfg.placement === 'sudoku') continue;
  const scatterCfg: BoardConfig = { ...cfg, placement: 'uniform' };
  const scatter = trial(scatterCfg, engine(scatterCfg));
  const rule = trial(cfg, engine(cfg));
  if (!scatter || !rule) continue;
  const delta = Math.round(100 * (rule.opening - scatter.opening) / Math.max(1, scatter.opening));
  console.log(`${type.name.padEnd(14)}${scatter.opening.toFixed(0).padStart(9)}${rule.opening.toFixed(0).padStart(7)}` +
    `${`${delta >= 0 ? '+' : ''}${delta}%`.padStart(9)}${`${scatter.zeros} → ${rule.zeros}`.padStart(14)}` +
    `${`${scatter.avg_num.toFixed(2)} → ${rule.avg_num.toFixed(2)}`.padStart(16)}`);
  ruled.push({ ladder: type.name, id: type.id, rule: cfg.placement, cells: cfg.width * cfg.height,
    creatures: cfg.quantity.reduce((a, b) => a + b, 0), scatter, shipped: rule, delta });
}
writeFileSync(resolve(DATA, 'placement-rules.json'), JSON.stringify(ruled, null, 1));
