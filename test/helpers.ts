/**
 * Fixtures the test files share: the ladder data loaded once, the seeds the board-walking tests
 * use, the settings override that takes the Sweep gate off, and hand-built boards.
 */

import { loadLadders } from '../src/data.js';
import { boardConfig, findType } from '../src/engine/config.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';
import type { Game } from '../src/engine/game.js';
import { computeNumbers } from '../src/engine/grid.js';
import type { BoardConfig } from '../src/engine/types.js';

/** The tuned ladder data, exactly as shipped. */
export const ladders = loadLadders();

/** Every ladder with a level economy, which is all of them but the search ladders. */
export const battleTypes = ladders.filter((t) => !t.search);

/** The seeds a board-walking test plays each board with. */
export const SEEDS = [0xc0ffee, 0x5eed, 0xbeef];

/** Two more for the placement-rule tests, whose structural checks want more boards. */
export const PLACEMENT_SEEDS = [...SEEDS, 0x1d10, 0xfeed];

/**
 * Settings with the Sweep gate taken off.
 *
 * The tuned default charges Sweep by ten hand-opened cells. A test about what a sweep FINDS says
 * so explicitly rather than opening ten unrelated cells first, which on a Sudoku board would also
 * change what there is to find.
 */
export const UNGATED_SWEEP = { settings: { ...DEFAULT_GAMEPLAY, sweep: 'on' as const } };

/** Every board config of one game type's tuned ladder. */
export function boardsOf(typeId: string) {
  return findType(ladders, typeId).boards.map((row) => boardConfig(ladders, typeId, row.n));
}

/**
 * A hand-built board config: 8x8, uniform, no opening, three tiers, no spells. Tests that draw
 * their own layout with `paint` start here and override what they are about.
 */
export function testConfig(over: Partial<BoardConfig> = {}): BoardConfig {
  return {
    typeId: 'test',
    board: 1,
    width: 8,
    height: 8,
    tiers: 3,
    quantity: [4, 3, 2],
    hp: 10,
    startLevel: 1,
    exp: [4, 20],
    search: false,
    placement: 'uniform',
    givens: 0,
    opening: 'none',
    topology: 'square',
    wrap: 'none',
    shape: 'rect',
    shapeParam: 0,
    spells: [],
    startMana: 0,
    reach: 0,
    ...over,
  };
}

/**
 * Replace a generated layout with an exact one, then recompute the numbers and the per-tier
 * counts. One string per row: a digit is a creature of that tier, `.` is empty ground.
 */
export function paint(game: Game, rows: readonly string[]): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const cell = game.grid[y]![x]!;
      cell.tier = ch === '.' ? 0 : Number(ch);
      cell.alive = cell.tier > 0;
    });
  });
  computeNumbers(game.grid, game.config.topology, game.config.wrap);
  game.remaining.fill(0);
  for (const r of game.grid) {
    for (const c of r) if (c.tier > 0) game.remaining[c.tier - 1]!++;
  }
}

/** Eight rows of empty ground, for `paint` on an 8x8 board. */
export const EMPTY8: readonly string[] = Array.from({ length: 8 }, () => '........');
