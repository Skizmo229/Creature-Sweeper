/**
 * What a click on the board will do (`src/ui/game/mode.ts`): an armed tier and an armed spell
 * exclude each other, Escape backs out one thing at a time, and the pencil hands back what it armed
 * for itself. DOM-free, so it runs with the engine tests.
 */

import { describe, expect, it } from 'vitest';
import { mulberry32, randInt } from '../src/engine/rng.js';
import { EntryMode } from '../src/ui/game/mode.js';

describe('the entry mode', () => {
  it('never leaves a tier and a spell armed together, whatever the player does', () => {
    const actions: Array<[string, (m: EntryMode, n: number) => void]> = [
      ['pickTier', (m, n) => m.pickTier(n % 4)],
      ['armSpell', (m, n) => m.armSpell(n % 2 ? 'reveal' : 'census')],
      ['toggleNotes', (m) => m.toggleNotes()],
      ['escape', (m) => m.escape()],
      ['cancelSpell', (m) => m.cancelSpell()],
      ['reset', (m) => m.reset()],
    ];
    const rng = mulberry32(0x5eed);
    for (let run = 0; run < 200; run++) {
      const mode = new EntryMode();
      const done: string[] = [];
      for (let step = 0; step < 30; step++) {
        const [name, act] = actions[randInt(rng, actions.length)]!;
        act(mode, randInt(rng, 8));
        done.push(name);
        expect(
          mode.markMode >= 0 && mode.pendingSpell !== null,
          `tier ${mode.markMode} and ${mode.pendingSpell} after ${done.join(', ')}`,
        ).toBe(false);
      }
    }
  });

  it('backs out on Escape one thing at a time: the spell, then the tier, then nothing', () => {
    const mode = new EntryMode();
    mode.pickTier(2);
    mode.toggleNotes();
    mode.armSpell('reveal');
    expect(mode.escape()).toBe(true);
    expect(mode.pendingSpell).toBeNull();
    mode.pickTier(3);
    expect(mode.escape()).toBe(true);
    expect(mode.markMode).toBe(-1);
    expect(mode.escape()).toBe(false);
  });

  it('arms tier 1 for the pencil, and hands it back on leaving', () => {
    const mode = new EntryMode();
    mode.toggleNotes();
    expect([mode.notesMode, mode.markMode]).toEqual([true, 1]);
    mode.toggleNotes();
    expect([mode.notesMode, mode.markMode]).toEqual([false, -1]);
  });

  it('keeps a tier the player picked, but drops empty ground, when the pencil is put down', () => {
    const mode = new EntryMode();
    mode.pickTier(3);
    mode.toggleNotes();
    mode.toggleNotes();
    expect(mode.markMode).toBe(3);
    mode.toggleNotes();
    mode.pickTier(0);
    mode.toggleNotes();
    expect(mode.markMode).toBe(-1);
  });
});
