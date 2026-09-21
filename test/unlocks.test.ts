/**
 * The unlock graph, and whether a player can actually walk it.
 *
 * Two kinds of gate now. A type gate ("clear NORMAL") is a readiness claim and
 * fails loudly if it cycles. A board-count gate ("clear 25 boards, anywhere")
 * fails *quietly*: the threshold is just a number, and nothing stops it being
 * set above the number of boards a player can reach without the very type it
 * guards. That is a deadlock nobody would see until a real save got stuck, so
 * it is the thing these tests are mostly for.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { maxBoard } from '../src/engine/config.js';
import { Progress, type SaveData } from '../src/ui/progress.js';

const ladders = loadLadders();

/** A save with a given set of types fully cleared and their boards recorded. */
function saveWith(clearedTypes: string[], extraBoards: Array<[string, number]> = []) {
  const data: SaveData = {
    version: 1, types: {}, boards: {}, runs: {}, scaling: {}, unlockAll: false,
    seenHowTo: true,
  };
  for (const id of clearedTypes) {
    const type = ladders.find((t) => t.id === id)!;
    data.types[id] = { highestBoard: type.boards.length, cleared: true };
    for (const row of type.boards) {
      data.boards[`${id}#${row.n}`] = { cleared: true, perfect: false, bestTime: 1 };
    }
  }
  for (const [id, n] of extraBoards) {
    data.boards[`${id}#${n}`] = { cleared: true, perfect: false, bestTime: 1 };
  }
  return new Progress(data);
}

describe('the shape of the graph', () => {
  it('starts somewhere', () => {
    const open = ladders.filter((t) => !t.requires.length && !t.requires_boards);
    expect(open.map((t) => t.id)).toEqual(['easy']);
  });

  it('names only types that exist', () => {
    const ids = new Set(ladders.map((t) => t.id));
    for (const type of ladders) {
      for (const req of type.requires) {
        expect(ids.has(req), `${type.id} requires unknown type "${req}"`).toBe(true);
      }
    }
  });

  it('has no cycles', () => {
    const byId = new Map(ladders.map((t) => [t.id, t]));
    const state = new Map<string, 'open' | 'done'>();
    const walk = (id: string, trail: string[]): void => {
      if (state.get(id) === 'done') return;
      expect(state.get(id), `cycle: ${[...trail, id].join(' -> ')}`).not.toBe('open');
      state.set(id, 'open');
      for (const req of byId.get(id)!.requires) walk(req, [...trail, id]);
      state.set(id, 'done');
    };
    for (const type of ladders) walk(type.id, []);
  });

  it('gives the combined types both of their parents', () => {
    // A ladder that is two ladders at once should not be reachable without
    // having played the things it combines.
    expect(ladders.find((t) => t.id === 'huge_extreme')!.requires.sort())
      .toEqual(['extreme', 'huge']);
    expect(ladders.find((t) => t.id === 'huge_blind')!.requires.sort())
      .toEqual(['blind', 'huge']);
    expect(ladders.find((t) => t.id === 'wrapped_cross')!.requires.sort())
      .toEqual(['cross', 'wraparound']);
    // And it is gated on those two alone. A combined type taking a board
    // count as well would be spending the one budget in this file that can
    // deadlock a save, to say a thing its parents already say.
    expect(ladders.find((t) => t.id === 'wrapped_cross')!.requires_boards).toBe(0);
  });

  it('orders the menu by the gate that opens each type', () => {
    // The variant ladders are ordered by their board count, so the menu reads
    // in the order a player will actually meet it.
    const counted = ladders.filter((t) => t.requires_boards > 0);
    for (let i = 1; i < counted.length; i++) {
      expect(counted[i]!.requires_boards, `${counted[i]!.id} is out of order`)
        .toBeGreaterThan(counted[i - 1]!.requires_boards);
    }
    expect(counted.map((t) => t.id)).toEqual(
      ['checker', 'hive', 'wraparound', 'diamond', 'donut', 'cross', 'cave', 'dungeon',
        'sudoku', 'blind'],
    );
  });
});

describe('every gate can actually be met', () => {
  /**
   * Boards reachable without ever unlocking a board-count type.
   *
   * This is the budget every count gate has to fit inside, and the one number
   * that can silently deadlock the game: set BLIND's threshold above it and
   * the only way to reach BLIND would be to have already reached BLIND.
   */
  function budgetWithoutCountedTypes(): number {
    const free = ladders.filter((t) => !t.requires_boards);
    const reachable = new Set<string>();
    for (;;) {
      const before = reachable.size;
      for (const type of free) {
        if (type.requires.every((r) => reachable.has(r))) reachable.add(type.id);
      }
      if (reachable.size === before) break;
    }
    return [...reachable]
      .reduce((sum, id) => sum + maxBoard(ladders, id), 0);
  }

  it('keeps every board-count gate inside what a player can reach without it', () => {
    const budget = budgetWithoutCountedTypes();
    for (const type of ladders) {
      expect(type.requires_boards, `${type.id} cannot be unlocked by any player`)
        .toBeLessThanOrEqual(budget);
    }
  });

  it('keeps them inside the tuned ladders alone, with no scaling grind', () => {
    // Stricter, and the one that matters for how the game feels: a player who
    // never touches a scaling board should still reach every gate.
    const free = ladders.filter((t) => !t.requires_boards);
    const reachable = new Set<string>();
    for (;;) {
      const before = reachable.size;
      for (const type of free) {
        if (type.requires.every((r) => reachable.has(r))) reachable.add(type.id);
      }
      if (reachable.size === before) break;
    }
    const budget = [...reachable].reduce(
      (sum, id) => sum + ladders.find((t) => t.id === id)!.boards.length, 0);
    for (const type of ladders) {
      expect(type.requires_boards, `${type.id} needs scaling boards to reach`)
        .toBeLessThanOrEqual(budget);
    }
  });

  it('reaches every type from an empty save by clearing things in some order', () => {
    // The real test: walk the graph the way a player would, and check nothing
    // is left stranded.
    const cleared: string[] = [];
    for (let pass = 0; pass < ladders.length + 1; pass++) {
      const progress = saveWith(cleared);
      for (const type of ladders) {
        if (cleared.includes(type.id)) continue;
        if (progress.isTypeUnlocked(ladders, type.id)) cleared.push(type.id);
      }
    }
    const missed = ladders.filter((t) => !cleared.includes(t.id)).map((t) => t.id);
    expect(missed, 'unreachable from an empty save').toEqual([]);
  });
});

describe('the gates as the game applies them', () => {
  it('opens nothing but EASY on a fresh save', () => {
    const progress = new Progress();
    const open = ladders.filter((t) => progress.isTypeUnlocked(ladders, t.id));
    expect(open.map((t) => t.id)).toEqual(['easy']);
  });

  it('counts every cleared board once, scaling boards included', () => {
    const progress = saveWith(['easy'], [['easy', 11], ['easy', 12]]);
    expect(progress.boardsCleared()).toBe(12);
  });

  it('holds a counted type shut one board short, and opens it on the next', () => {
    const hive = ladders.find((t) => t.id === 'hive')!;
    expect(hive.requires_boards).toBe(25);

    // 24 boards: EASY's ten, NORMAL's ten, four of HUGE.
    const short = saveWith(['easy', 'normal'],
      [['huge', 1], ['huge', 2], ['huge', 3], ['huge', 4]]);
    expect(short.boardsCleared()).toBe(24);
    expect(short.isTypeUnlocked(ladders, 'hive')).toBe(false);

    const enough = saveWith(['easy', 'normal'],
      [['huge', 1], ['huge', 2], ['huge', 3], ['huge', 4], ['huge', 5]]);
    expect(enough.boardsCleared()).toBe(25);
    expect(enough.isTypeUnlocked(ladders, 'hive')).toBe(true);
  });

  it('does not open a counted type on type-clears alone', () => {
    // Clearing EASY and NORMAL is 20 boards — readiness, but not time served.
    const progress = saveWith(['easy', 'normal']);
    expect(progress.isTypeUnlocked(ladders, 'hive')).toBe(false);
  });

  it('needs both parents for a combined type, not just one', () => {
    const huge = saveWith(['easy', 'normal', 'huge']);
    expect(huge.isTypeUnlocked(ladders, 'huge_extreme')).toBe(false);
    const both = saveWith(['easy', 'normal', 'huge', 'extreme']);
    expect(both.isTypeUnlocked(ladders, 'huge_extreme')).toBe(true);
  });

  it('opens HUGE and EXTREME together off NORMAL', () => {
    const progress = saveWith(['easy', 'normal']);
    expect(progress.isTypeUnlocked(ladders, 'huge')).toBe(true);
    expect(progress.isTypeUnlocked(ladders, 'extreme')).toBe(true);
  });

  it('still lets the prototype escape hatch open everything', () => {
    const progress = new Progress();
    progress.setUnlockAll(true);
    for (const type of ladders) {
      expect(progress.isTypeUnlocked(ladders, type.id), type.id).toBe(true);
    }
  });
});
