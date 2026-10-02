/**
 * The game's wording that more than one screen needs. DOM-free, so the save and statistics codes,
 * which the test pass with no DOM library compiles, can use it too.
 */

/** A count and its noun, the noun in the plural unless the count is one: "1 board", "2 boards". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
