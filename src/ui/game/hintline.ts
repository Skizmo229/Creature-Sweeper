/**
 * The hint line under the board: what a click does right now, said plainly. The palette is
 * modal, so a fixed caption could only ever describe one mode; this is rebuilt on every refresh.
 */

import type { Game } from '../../engine/game.js';
import { placementRule } from '../../engine/placement/registry.js';
import { SPELLS } from '../../engine/spells.js';
import type { EntryMode } from './mode.js';

/** The keys every line but an armed spell's ends with. */
const KEYS_TAIL = 'a spell’s bracketed letter casts it · scroll or +/- to zoom, F to reset';

/** What the hint line says a click does in `mode` on `game`, with the keys that apply there. */
export function hintLineText(game: Game | null, mode: EntryMode): string {
  const tier = mode.markMode;

  if (mode.pendingSpell) {
    return `${SPELLS[mode.pendingSpell].name} is armed — click a cell to cast it, Esc to cancel`;
  }
  if (mode.notesMode) {
    const what = tier === 0 ? '“might be empty”' : tier > 0 ? `“might be ${tier}”` : 'a candidate';
    return (
      `PENCIL — click a cell to add or remove ${what} · ` +
      'pick a tier above, or Shift+digit over a cell · ' +
      `N returns to marking · ${KEYS_TAIL}`
    );
  }
  // On PATROL a mark is a route, and the whole mode is that every action is a move.
  if (tier > 0 && game?.patrols) {
    return (
      `MARK ${tier} — click a cell to draw a tier-${tier} creature's route from it as the ` +
      'top-left corner, again to take it off · a route above your level locks its cells · ' +
      KEYS_TAIL
    );
  }
  if (tier > 0) {
    return (
      `MARK ${tier} — click a cell to claim it is a ${tier}, click again to clear · ` +
      `a mark above your level locks the cell · N pencils instead · ${KEYS_TAIL}`
    );
  }
  const sweep = sweepHint(game);
  if (game?.patrols) {
    return (
      `Every click or wait moves each creature a step (W waits: +1 second) · a ? is a creature on ` +
      `ground you uncovered · right-click or a LV button marks a creature's route from its ` +
      `top-left corner · ${sweep} · ${KEYS_TAIL}`
    );
  }
  // Where every creature is drawn, the drawing is the rule, so it is said once where it is used.
  const shown =
    game && placementRule(game.config.placement).display.showsCreatures
      ? ' · each sprinkle is two creatures, and anything else is empty'
      : '';
  if (game && game.config.reach > 0) {
    const crawl = crawlHint(game);
    return `${crawl}${shown} · right-click or a LV button to mark · ${sweep} · ${KEYS_TAIL}`;
  }
  return (
    `Click to open${shown} · right-click or a LV button to mark · N pencils candidates · ` +
    `${sweep} · ${KEYS_TAIL}`
  );
}

/** What the line says Sweep does on this board: nothing, the clues, or what is proven. */
function sweepHint(game: Game | null): string {
  if (game && !game.hasSweep) return 'no Sweep on this ladder';
  if (game && placementRule(game.config.placement).guessFree) {
    return 'S opens the clues at or below your level · D also opens your own marks';
  }
  if (game && !game.marksAreClaims) return 'S sweeps what is proven safe';
  return 'S sweeps what is proven safe · D also trusts your marks';
}

/**
 * What a click opens on a board with a crawl rule. The rule is the first thing a player meets on
 * a DUNGEON board and nothing on screen would explain a click doing nothing, so it is said here.
 * Once the board has sealed the player in the rule has lifted, and saying so is the difference
 * between an escape hatch and a bug.
 */
function crawlHint(game: Game): string {
  if (game.sealedIn()) {
    return 'Walled in — reach lifted until you can move again, so anywhere is open';
  }
  const ground = game.config.marksExtendReach
    ? 'ground you have uncovered, or a mark beside it'
    : 'ground you have uncovered';
  return (
    `Click to open, within ${game.config.reach} of ${ground} ` +
    '(the cursor crosses out what is out of reach)'
  );
}
