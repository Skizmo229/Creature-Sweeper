/**
 * What density does a hex board need to play like a square one?
 *
 *   npx tsx src/sim/topology.ts [trials]
 *
 * A blank cell is one whose neighbours are all empty. On a square board that
 * is eight coin flips; on a hex board only six. So at equal density a hex
 * board has far more blank cells, far larger openings, and plays looser. This
 * measures the gap and reports the density that closes it.
 */

import { Game } from '../engine/game.js';
import type { BoardConfig, Topology, Wrap } from '../engine/types.js';

const TRIALS = Number(process.argv[2] ?? 120);

/** A descending tier spread, the shape most ladders use. */
function quantityFor(cells: number, density: number, tiers = 5): number[] {
  const total = Math.round(cells * density);
  const weights = Array.from({ length: tiers }, (_, i) => tiers - i);
  const sum = weights.reduce((a, b) => a + b, 0);
  const q = weights.map((w) => Math.max(1, Math.floor((total * w) / sum)));
  let diff = total - q.reduce((a, b) => a + b, 0);
  for (let i = 0; diff > 0; i = (i + 1) % tiers, diff--) q[i]!++;
  return q;
}

function config(
  topology: Topology,
  wrap: Wrap,
  w: number,
  h: number,
  density: number,
): BoardConfig {
  const q = quantityFor(w * h, density);
  return {
    typeId: `probe-${topology}-${wrap}`,
    board: 1,
    width: w,
    height: h,
    tiers: q.length,
    quantity: q,
    hp: 10,
    startLevel: 1,
    // Thresholds are irrelevant here; nothing is played out.
    exp: [10, 50, 167, 271],
    search: false,
    placement: 'uniform',
    givens: 0,
    opening: 'auto',
    topology,
    wrap,
    shape: 'rect',
    shapeParam: 0,
    spells: [],
    startMana: 0,
    reach: 0,
  };
}

interface Probe {
  opening: number;
  blankPct: number;
  meanNum: number;
}

function probe(topology: Topology, wrap: Wrap, w: number, h: number, density: number): Probe {
  const openings: number[] = [];
  let blank = 0;
  let numSum = 0;
  let numCount = 0;

  for (let t = 0; t < TRIALS; t++) {
    const game = Game.create(config(topology, wrap, w, h, density), 0xa11ce + t * 7919);
    openings.push(game.grid.flat().filter((c) => c.open).length);
    for (const cell of game.grid.flat()) {
      if (cell.tier !== 0) continue;
      numCount++;
      numSum += cell.num;
      if (cell.num === 0) blank++;
    }
  }
  openings.sort((a, b) => a - b);
  return {
    opening: openings[Math.floor(openings.length / 2)]!,
    blankPct: (100 * blank) / numCount,
    meanNum: numSum / numCount,
  };
}

const W = 30;
const H = 16;

const VARIANTS: Array<[string, Topology, Wrap]> = [
  ['square', 'square', 'none'],
  ['cylinder', 'square', 'horizontal'],
  ['torus', 'square', 'both'],
  ['hex', 'hex', 'none'],
];

console.log(`${W}x${H}, ${TRIALS} boards per point`);
console.log('blank% = cells with no creature neighbours; open = median auto-opening');
console.log('');

const head =
  'density'.padStart(8) +
  VARIANTS.map(([n]) => `${n} blank`.padStart(14) + 'open'.padStart(6)).join('');
console.log(head);
console.log('-'.repeat(head.length));

for (let d = 0.18; d <= 0.341; d += 0.02) {
  let line = `${(d * 100).toFixed(0)}%`.padStart(8);
  for (const [, topo, wrap] of VARIANTS) {
    const r = probe(topo, wrap, W, H, d);
    line += `${r.blankPct.toFixed(1)}%`.padStart(14) + `${r.opening}`.padStart(6);
  }
  console.log(line);
}

// How much does removing the edges cost you, at a fixed density?
console.log('');
console.log('edges are information — same density, what wrapping takes away:');
for (const d of [0.206, 0.24, 0.27]) {
  const base = probe('square', 'none', W, H, d);
  const cyl = probe('square', 'horizontal', W, H, d);
  const tor = probe('square', 'both', W, H, d);
  const pct = (a: number, b: number) => `${(((a - b) / b) * 100).toFixed(0)}%`;
  console.log(
    `  ${(d * 100).toFixed(1)}%: blank ${base.blankPct.toFixed(1)}% -> ` +
      `cyl ${cyl.blankPct.toFixed(1)}% (${pct(cyl.blankPct, base.blankPct)}), ` +
      `torus ${tor.blankPct.toFixed(1)}% (${pct(tor.blankPct, base.blankPct)}) | ` +
      `opening ${base.opening} -> ${cyl.opening} -> ${tor.opening}`,
  );
}

// And the density that puts a torus back where the square board was.
console.log('');
console.log('matching torus density for the same blank rate:');
for (const dSq of [0.206, 0.24, 0.27]) {
  const target = probe('square', 'none', W, H, dSq).blankPct;
  let best = dSq;
  let bestGap = Infinity;
  for (let dt = Math.max(0.05, dSq - 0.06); dt <= dSq + 0.01; dt += 0.005) {
    const gap = Math.abs(probe('square', 'both', W, H, dt).blankPct - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = dt;
    }
  }
  console.log(
    `  square ${(dSq * 100).toFixed(1)}% -> torus ${(best * 100).toFixed(1)}%` +
      `   (${((best - dSq) * 100).toFixed(1)} points)`,
  );
}
