/**
 * The game's wording that more than one screen needs. DOM-free, so the save and statistics codes,
 * which the test pass with no DOM library compiles, can use it too.
 */

import { type GameplaySettings, easierThanDefault } from '../engine/settings.js';

/** A count and its noun, the noun in the plural unless the count is one: "1 board", "2 boards". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The dials set easier than the tuned game, as the sentence the player is shown. */
export function easierSentence(gameplay: GameplaySettings): string {
  const easier = easierThanDefault(gameplay);
  const verb = easier.length === 1 ? 'is' : 'are';
  return `${easier.join(', ')} ${verb} set easier than the tuned game.`;
}
