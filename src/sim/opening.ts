/**
 * Measure the auto-opening across every board of every ladder.
 *
 *   npx tsx src/sim/opening.ts [trials]   # writes design/data/opening.json
 *
 * This replaces the original `design/opening.py`, which reimplemented the
 * board rules in Python. The two agreed closely while boards were all plain
 * squares, but a second implementation only stays honest until the first one
 * grows — and it did: Python knows nothing about hex grids or wrapped edges,
 * so three ladders simply had no data. Driving the real engine means the
 * measurement cannot drift from the game again.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLadders } from '../data.js';
import { boardConfig } from '../engine/config.js';
import { Game } from '../engine/game.js';

const TRIALS = Number(process.argv[2] ?? 300);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', '..', 'design', 'data', 'opening.json');

interface Row {
  type: string;
  board: number;
  density: number;
  median: number;
  p05: number;
  worst: number;
  pct: number;
  nozero: number;
}

const ladders = loadLadders();
const rows: Row[] = [];

console.log(
  'type'.padEnd(16) + 'bd'.padStart(3) + 'dens'.padStart(7) + 'cells'.padStart(7) +
  'median'.padStart(8) + 'p05'.padStart(6) + 'worst'.padStart(7) +
  '%board'.padStart(8) + 'no-zero'.padStart(9),
);
console.log('-'.repeat(71));

for (const type of ladders) {
  for (const board of type.boards) {
    const cfg = boardConfig(ladders, type.id, board.n);
    const sizes: number[] = [];
    let nozero = 0;

    for (let t = 0; t < TRIALS; t++) {
      const game = Game.create(cfg, (0x5eed0000 + t * 2654435761) >>> 0);
      const opened = game.grid.flat().filter((c) => c.open).length;
      sizes.push(opened);
      if (opened === 0) nozero++;
    }

    sizes.sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)]!;
    const row: Row = {
      type: type.id,
      board: board.n,
      density: board.density,
      median,
      p05: sizes[Math.floor(sizes.length * 0.05)]!,
      worst: sizes[0]!,
      pct: Math.round((1000 * median) / board.cells) / 10,
      nozero: Math.round((10000 * nozero) / TRIALS) / 100,
    };
    rows.push(row);

    console.log(
      type.name.padEnd(16) + String(board.n).padStart(3) +
      `${board.density.toFixed(1)}%`.padStart(7) + String(board.cells).padStart(7) +
      String(row.median).padStart(8) + String(row.p05).padStart(6) +
      String(row.worst).padStart(7) + `${row.pct.toFixed(1)}%`.padStart(8) +
      `${row.nozero.toFixed(1)}%`.padStart(9),
    );
  }
}

writeFileSync(OUT, JSON.stringify(rows, null, 1));
const worst = Math.min(...rows.map((r) => r.worst));
const anyEmpty = Math.max(...rows.map((r) => r.nozero));
console.log(
  `\n${rows.length} boards x ${TRIALS} seeds. ` +
  `Smallest opening ever produced: ${worst} cells. ` +
  `Boards with no opening at all: ${anyEmpty.toFixed(2)}%.`,
);
console.log(`wrote ${OUT}`);
