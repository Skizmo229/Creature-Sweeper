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
import { LADDER_CATEGORIES } from '../src/engine/config.js';
import { Progress, type SaveData } from '../src/ui/progress.js';
import { ladders } from './helpers.js';

/** A save with a given set of types fully cleared and their boards recorded. */
function saveWith(clearedTypes: string[], extraBoards: Array<[string, number]> = []) {
  const data: SaveData = {
    version: 1,
    types: {},
    boards: {},
    runs: {},
    scaling: {},
    unlockAll: false,
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

/** Boards 1..n of a type, cleared without clearing the type. */
const firstBoards = (id: string, n: number): Array<[string, number]> =>
  Array.from({ length: n }, (_, i) => [id, i + 1]);

const gate = (id: string) => ladders.find((t) => t.id === id)!.requires_boards;

describe('the menu categories', () => {
  it('files every ladder under one of the four', () => {
    for (const type of ladders) {
      expect(LADDER_CATEGORIES, type.id).toContain(type.category);
    }
  });

  it('keeps each category together, in the order the menu shows them', () => {
    // The menu reads the data's order within a category, so a ladder filed
    // out of its run would be listed in the right column but the wrong place.
    const runs = ladders.map((t) => t.category).filter((c, i, all) => c !== all[i - 1]);
    expect(runs).toEqual([...LADDER_CATEGORIES]);
  });

  it('puts the original game in Normal', () => {
    const normal = ladders.filter((t) => t.category === 'normal').map((t) => t.id);
    expect(normal).toEqual([
      'easy',
      'normal',
      'huge',
      'extreme',
      'huge_extreme',
      'blind',
      'huge_blind',
    ]);
  });
});

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

  it('gives the combined Normal ladders both of their parents, and nothing else', () => {
    // A ladder that is two ladders at once should not be reachable without
    // having played the things it combines. A board count as well would be
    // spending the one budget in this file that can deadlock a save, to say a
    // thing its parents already say.
    for (const [id, parents] of [
      ['huge_extreme', ['extreme', 'huge']],
      ['huge_blind', ['blind', 'huge']],
    ] as const) {
      const type = ladders.find((t) => t.id === id)!;
      expect(type.requires.sort()).toEqual(parents);
      expect(type.requires_boards).toBe(0);
    }
  });

  it('counts WRAPPED CROSS like any other shape, one step before CROSS', () => {
    const wrapped = ladders.find((t) => t.id === 'wrapped_cross')!;
    expect(wrapped.requires).toEqual([]);
    expect(gate('cross') - gate('wrapped_cross')).toBe(5);
  });

  it('starts the counted gates at 15, after EASY and half of NORMAL', () => {
    const counted = ladders.filter((t) => t.requires_boards > 0);
    expect(Math.min(...counted.map((t) => t.requires_boards))).toBe(15);
  });

  it('opens the next ladder of every category on each step of five', () => {
    // BLIND is held back past the end, so it is left out of its column here.
    for (const category of LADDER_CATEGORIES) {
      const gates = ladders
        .filter((t) => t.category === category && t.requires_boards > 0 && t.id !== 'blind')
        .map((t) => t.requires_boards);
      expect(gates, category).toEqual(gates.map((_, i) => 15 + 5 * i));
    }
  });

  it('gates BLIND on boards alone, one step after every other counted ladder', () => {
    const blind = ladders.find((t) => t.id === 'blind')!;
    expect(blind.requires).toEqual([]);
    const others = ladders.filter((t) => t.id !== 'blind').map((t) => t.requires_boards);
    expect(blind.requires_boards).toBe(Math.max(...others) + 5);
    expect(blind.requires_boards).toBe(65);
  });
});

describe('every gate can actually be met', () => {
  /**
   * Walk the board-count schedule in order, clearing only TUNED boards.
   *
   * The budget is every board-10 ladder a player can have reached so far: the
   * type-gated ladders, plus every counted ladder whose gate the budget has
   * already met, since each one opened is ten more boards to clear. A gate the
   * walk never meets would be a save that can go no further - the deadlock
   * these tests exist for. Scaling boards are left out on purpose, so a
   * player who never goes past board 10 must still reach everything.
   */
  function walkCountedGates(): { reached: Set<string>; budget: number } {
    const reached = new Set<string>();
    const tuned = () =>
      [...reached].reduce((sum, id) => sum + ladders.find((t) => t.id === id)!.boards.length, 0);
    for (;;) {
      const before = reached.size;
      for (const type of ladders) {
        if (reached.has(type.id)) continue;
        if (!type.requires.every((r) => reached.has(r))) continue;
        if (type.requires_boards > tuned()) continue;
        reached.add(type.id);
      }
      if (reached.size === before) break;
    }
    return { reached, budget: tuned() };
  }

  it('meets every board-count gate on tuned boards alone, taking them in order', () => {
    const { reached } = walkCountedGates();
    for (const type of ladders.filter((t) => t.requires_boards > 0)) {
      expect(reached.has(type.id), `${type.id} (${type.requires_boards}) cannot be reached`).toBe(
        true,
      );
    }
  });

  it('steps the board-count schedule by exactly five', () => {
    const gates = [...new Set(ladders.map((t) => t.requires_boards).filter((n) => n > 0))].sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]! - gates[i - 1]!, `gap after ${gates[i - 1]}`).toBe(5);
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
  const openIn = (progress: Progress) =>
    ladders.filter((t) => progress.isTypeUnlocked(ladders, t.id)).map((t) => t.id);

  it('opens nothing but EASY on a fresh save', () => {
    expect(openIn(new Progress())).toEqual(['easy']);
  });

  it('counts every cleared board once, scaling boards included', () => {
    const progress = saveWith(
      ['easy'],
      [
        ['easy', 11],
        ['easy', 12],
      ],
    );
    expect(progress.boardsCleared()).toBe(12);
  });

  it('holds a counted type shut one board short, and opens it on the next', () => {
    expect(gate('cross')).toBe(25);

    // 24 boards: EASY's ten, NORMAL's ten, four of HUGE.
    const short = saveWith(['easy', 'normal'], firstBoards('huge', 4));
    expect(short.boardsCleared()).toBe(24);
    expect(short.isTypeUnlocked(ladders, 'cross')).toBe(false);

    const enough = saveWith(['easy', 'normal'], firstBoards('huge', 5));
    expect(enough.boardsCleared()).toBe(25);
    expect(enough.isTypeUnlocked(ladders, 'cross')).toBe(true);
  });

  it('opens one ladder of each category at 15 boards', () => {
    const fourteen = saveWith(['easy'], firstBoards('normal', 4));
    expect(openIn(fourteen)).toEqual(['easy', 'normal']);
    const fifteen = saveWith(['easy'], firstBoards('normal', 5));
    expect(openIn(fifteen)).toEqual(['easy', 'normal', 'huge', 'wraparound', 'arcane', 'hive']);
  });

  it('opens HUGE and EXTREME on the count, not on clearing NORMAL', () => {
    const fifteen = saveWith(['easy'], firstBoards('normal', 5));
    expect(fifteen.isTypeUnlocked(ladders, 'huge')).toBe(true);
    expect(fifteen.isTypeUnlocked(ladders, 'extreme')).toBe(false);
    const twenty = saveWith(['easy'], firstBoards('normal', 9).concat([['huge', 1]]));
    expect(twenty.typeRecord('normal').cleared).toBe(false);
    expect(twenty.isTypeUnlocked(ladders, 'extreme')).toBe(true);
  });

  it('holds BLIND shut one board short of its gate, and opens it on the gate', () => {
    // Whole ladders from the Shape column, then boards of the next, to land on an exact count.
    const shapes = ladders.filter((t) => t.category === 'shape').map((t) => t.id);
    const saveOf = (boards: number) => {
      const whole = shapes.slice(0, Math.floor(boards / 10));
      return saveWith(whole, firstBoards(shapes[whole.length]!, boards % 10));
    };
    const short = saveOf(gate('blind') - 1);
    expect(short.boardsCleared()).toBe(gate('blind') - 1);
    expect(short.isTypeUnlocked(ladders, 'blind')).toBe(false);
    expect(saveOf(gate('blind')).isTypeUnlocked(ladders, 'blind')).toBe(true);
  });

  it('needs both parents for a combined type, not just one', () => {
    const huge = saveWith(['easy', 'normal', 'huge']);
    expect(huge.isTypeUnlocked(ladders, 'huge_extreme')).toBe(false);
    const both = saveWith(['easy', 'normal', 'huge', 'extreme']);
    expect(both.isTypeUnlocked(ladders, 'huge_extreme')).toBe(true);
  });

  it('still lets the prototype escape hatch open everything', () => {
    const progress = new Progress();
    progress.setUnlockAll(true);
    for (const type of ladders) {
      expect(progress.isTypeUnlocked(ladders, type.id), type.id).toBe(true);
    }
  });
});
