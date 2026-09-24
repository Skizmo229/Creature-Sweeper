/**
 * Fixtures the test files share: the ladder data loaded once, the seeds the board-walking tests
 * use, and the settings override that takes the Sweep gate off.
 */

import { loadLadders } from '../src/data.js';
import { boardConfig, findType } from '../src/engine/config.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';

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
