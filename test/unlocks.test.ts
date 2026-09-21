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
import { Progress, type SaveData } from '../src/ui/progress.js';

const ladders = loadLadders();

/**
 * A save with a given set of types fully cleared and their boards recorded,
 * and a Full Run completed on each type in `ranTypes`.
 */
function saveWith(
  clearedTypes: string[],
  extraBoards: Array<[string, number]> = [],
  ranTypes: string[] = [],
) {
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
  for (const id of ranTypes) {
    data.runs[id] = { cleared: true, bestBoard: 10, bestHp: 1, bestTime: 1, attempts: 1 };
  }
  return new Progress(data);
}

describe('the shape of the graph', () => {
  it('starts somewhere', () => {
    const open = ladders.filter(
      (t) => !t.requires.length && !t.requires_boards && !t.requires_runs);
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

  it('starts the counted gates at 15, after EASY and half of NORMAL', () => {
    const counted = ladders.filter((t) => t.requires_boards > 0);
    expect(Math.min(...counted.map((t) => t.requires_boards))).toBe(15);
  });

  it('gates BLIND on three Full Runs and nothing else', () => {
    const blind = ladders.find((t) => t.id === 'blind')!;
    expect(blind.requires_runs).toBe(3);
    expect(blind.requires_boards).toBe(0);
    expect(blind.requires).toEqual([]);
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
      ['wraparound', 'cross', 'hive', 'diamond', 'pairs', 'dominoes', 'workout', 'packs', 'donut',
        'checker', 'congo', 'cave', 'dungeon', 'sudoku'],
    );
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
   *
   * This replaced a stricter claim, that every gate fit inside the 70 boards
   * the type-gated ladders offer. The schedule now steps by five to 80, so the
   * top three gates need a variant played first, which is the intent.
   */
  function walkCountedGates(): { reached: Set<string>; budget: number } {
    const reached = new Set<string>();
    const tuned = () => [...reached]
      .reduce((sum, id) => sum + ladders.find((t) => t.id === id)!.boards.length, 0);
    for (;;) {
      const before = reached.size;
      for (const type of ladders) {
        if (reached.has(type.id) || type.requires_runs) continue;
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
      expect(reached.has(type.id), `${type.id} (${type.requires_boards}) cannot be reached`)
        .toBe(true);
    }
  });

  it('steps the board-count schedule by exactly five', () => {
    const gates = ladders.map((t) => t.requires_boards).filter((n) => n > 0)
      .sort((a, b) => a - b);
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]! - gates[i - 1]!, `gap after ${gates[i - 1]}`).toBe(5);
    }
  });

  it('keeps the Full Run gate inside what a player can reach without it', () => {
    // A Full Run opens on a type's board 10, so the runs available without any
    // run-gated type are one per type reachable on type-clears alone.
    const free = ladders.filter((t) => !t.requires_boards && !t.requires_runs);
    const reachable = new Set<string>();
    for (;;) {
      const before = reachable.size;
      for (const type of free) {
        if (type.requires.every((r) => reachable.has(r))) reachable.add(type.id);
      }
      if (reachable.size === before) break;
    }
    for (const type of ladders) {
      expect(type.requires_runs, `${type.id} cannot be unlocked by any player`)
        .toBeLessThanOrEqual(reachable.size);
    }
  });

  it('reaches every type from an empty save by clearing things in some order', () => {
    // The real test: walk the graph the way a player would, and check nothing
    // is left stranded. Clearing a type opens its Full Run, so the walk runs
    // every type it clears.
    const cleared: string[] = [];
    for (let pass = 0; pass < ladders.length + 1; pass++) {
      const progress = saveWith(cleared, [], cleared);
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

  it('holds BLIND shut on two Full Runs, and opens it on a third', () => {
    const two = saveWith(['easy', 'normal', 'huge'], [], ['easy', 'normal']);
    expect(two.fullRunsCompleted()).toBe(2);
    expect(two.isTypeUnlocked(ladders, 'blind')).toBe(false);
    const three = saveWith(['easy', 'normal', 'huge'], [], ['easy', 'normal', 'huge']);
    expect(three.fullRunsCompleted()).toBe(3);
    expect(three.isTypeUnlocked(ladders, 'blind')).toBe(true);
  });

  it('counts a type once however many times its run was completed', () => {
    // "Separate" runs means separate types: the save keeps one run record per
    // type, so running EASY three times is still one.
    const progress = saveWith(['easy'], [], ['easy']);
    progress.recordRun('easy', { completed: true, reachedBoard: 10, hp: 5, seconds: 60 });
    progress.recordRun('easy', { completed: true, reachedBoard: 10, hp: 5, seconds: 60 });
    expect(progress.fullRunsCompleted()).toBe(1);
    expect(progress.isTypeUnlocked(ladders, 'blind')).toBe(false);
  });

  it('does not count a run that fell short', () => {
    const progress = saveWith(['easy', 'normal', 'huge'], [], ['easy', 'normal']);
    progress.recordRun('huge', { completed: false, reachedBoard: 9, hp: 0, seconds: 60 });
    expect(progress.fullRunsCompleted()).toBe(2);
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
