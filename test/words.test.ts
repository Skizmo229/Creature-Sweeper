/**
 * The wording more than one screen shares (`src/ui/words.ts`): a count with its noun, and a list
 * of names as a sentence reads it.
 */

import { describe, expect, it } from 'vitest';
import { listed, plural } from '../src/ui/words.js';

describe('the shared wording', () => {
  it('puts a noun in the plural unless the count is one', () => {
    expect([0, 1, 2].map((n) => plural(n, 'board'))).toEqual(['0 boards', '1 board', '2 boards']);
  });

  it('lists names with commas and a last "and"', () => {
    expect(listed([])).toBe('');
    expect(listed(['DUNGEON'])).toBe('DUNGEON');
    expect(listed(['DUNGEON', 'PYRAMID'])).toBe('DUNGEON and PYRAMID');
    expect(listed(['DUNGEON', 'PETRI DISH', 'PYRAMID'])).toBe('DUNGEON, PETRI DISH and PYRAMID');
  });
});
