/**
 * The hint line under the board: what a click does right now, said plainly. The palette is
 * modal, so a fixed caption could only ever describe one mode; this is rebuilt on every refresh.
 */

import type { Game } from '../../engine/game.js';
import { SPELLS } from '../../engine/spells.js';
import type { EntryMode } from './mode.js';

export function hintText(game: Game | null, mode: EntryMode): string {
  const tier = mode.markMode;
  const spell = 'a spell’s bracketed letter casts it · scroll or +/- to zoom, F to reset';

  if (mode.pendingSpell) {
    return `${SPELLS[mode.pendingSpell].name} is armed — click a cell to cast it, Esc to cancel`;
  }
  if (mode.notesMode) {
    const what = tier === 0 ? '“might be empty”' : tier > 0 ? `“might be ${tier}”` : 'a candidate';
    return (
      `PENCIL — click a cell to add or remove ${what} · ` +
      'pick a tier above, or Shift+digit over a cell · ' +
      `N returns to marking · ${spell}`
    );
  }
  if (tier > 0) {
    return (
      `MARK ${tier} — click a cell to claim it is a ${tier}, click again to clear · ` +
      `a mark above your level locks the cell · N pencils instead · ${spell}`
    );
  }
  const sweep =
    game && !game.hasSweep
      ? 'no Sweep on this ladder — every cell is opened by hand'
      : game && game.config.placement === 'sudoku'
        ? 'S opens the clues at or below your level · D also opens your own marks'
        : 'S sweeps what is proven safe · D also trusts your marks';
  // The crawl rule is the first thing a player meets on a DUNGEON board and nothing on screen
  // would explain a click doing nothing, so it is said here. Once the board has sealed the player
  // in the rule has lifted, and saying so is the difference between an escape hatch and a bug.
  if (game && game.config.reach > 0) {
    const crawl = game.sealedIn()
      ? `Walled in — reach lifted until you can move again, so anywhere is open`
      : `Click to open, within ${game.config.reach} of ground you have uncovered ` +
        `(red cursor means out of reach)`;
    return `${crawl} · right-click or a LV button to mark · ${sweep} · ${spell}`;
  }
  return (
    `Click to open · right-click or a LV button to mark · N pencils candidates · ` +
    `${sweep} · ${spell}`
  );
}
