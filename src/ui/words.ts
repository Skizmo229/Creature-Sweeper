/**
 * The game's wording that more than one screen needs. DOM-free, so the save and statistics codes,
 * which the test pass with no DOM library compiles, can use it too.
 */

import { type GameplaySettings, easierThanDefault } from '../engine/settings.js';

/** A count and its noun, the noun in the plural unless the count is one: "1 board", "2 boards". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Names as the player reads a list of them: "A", "A and B", "A, B and C". */
export function listed(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The dials set easier than the tuned game, as the sentence the player is shown. */
export function easierSentence(gameplay: GameplaySettings): string {
  const easier = easierThanDefault(gameplay);
  const verb = easier.length === 1 ? 'is' : 'are';
  return `${easier.join(', ')} ${verb} set easier than the tuned game.`;
}
