/**
 * What a clear writes into the record book: a best time, or with hints and no best time yet, the
 * fewest hints (decisions 0048 and 0065). The same rule for a board and for a Full Run.
 */

import { describe, expect, it } from 'vitest';
import { boardFingerprint, ladderFingerprint } from '../src/engine/config.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';
import { Progress, type SaveData } from '../src/ui/progress.js';
import { ladders } from './helpers.js';

const TYPE = 'easy';
const BOARD = 1;

function clear(progress: Progress, seconds: number, hints: number) {
  progress.recordClear(ladders, TYPE, BOARD, {
    perfect: false,
    seconds,
    hints,
    dials: DEFAULT_GAMEPLAY,
  });
  return progress.boardRecord(ladders, TYPE, BOARD);
}

function completeRun(progress: Progress, seconds: number, hints: number) {
  progress.recordRun(ladders, TYPE, {
    completed: true,
    reachedBoard: 10,
    hp: 1,
    seconds,
    hints,
    dials: DEFAULT_GAMEPLAY,
  });
  return progress.runRecord(ladders, TYPE);
}

describe('a board clear', () => {
  it('without hints sets a best time', () => {
    const rec = clear(new Progress(), 90, 0);
    expect(rec.bestTime).toBe(90);
    expect(rec.fewestHints).toBeUndefined();
  });

  it('with hints and no best time keeps the fewest hints', () => {
    const progress = new Progress();
    expect(clear(progress, 90, 3)).toMatchObject({ cleared: true, bestTime: null, fewestHints: 3 });
    expect(clear(progress, 60, 5).fewestHints).toBe(3);
    expect(clear(progress, 60, 1).fewestHints).toBe(1);
  });

  it('without hints retires the hint count', () => {
    const progress = new Progress();
    clear(progress, 90, 2);
    const rec = clear(progress, 120, 0);
    expect(rec.bestTime).toBe(120);
    expect(rec.fewestHints).toBeUndefined();
  });

  it('with hints leaves a best time alone and records no hints beside it', () => {
    const progress = new Progress();
    clear(progress, 90, 0);
    const rec = clear(progress, 30, 1);
    expect(rec.bestTime).toBe(90);
    expect(rec.fewestHints).toBeUndefined();
  });
});

describe('a Full Run', () => {
  it('completed with hints and no best time keeps the fewest hints', () => {
    const progress = new Progress();
    expect(completeRun(progress, 900, 4)).toMatchObject({ bestTime: null, fewestHints: 4 });
    expect(completeRun(progress, 900, 2).fewestHints).toBe(2);
  });

  it('that ends early keeps what the record had', () => {
    const progress = new Progress();
    completeRun(progress, 900, 4);
    progress.recordRun(ladders, TYPE, {
      completed: false,
      reachedBoard: 3,
      hp: 0,
      seconds: 100,
      hints: 1,
      dials: DEFAULT_GAMEPLAY,
    });
    expect(progress.runRecord(ladders, TYPE)).toMatchObject({
      bestTime: null,
      fewestHints: 4,
      attempts: 2,
    });
  });

  it('completed without hints retires the hint count', () => {
    const progress = new Progress();
    completeRun(progress, 900, 4);
    const rec = completeRun(progress, 1200, 0);
    expect(rec.bestTime).toBe(1200);
    expect(rec.fewestHints).toBeUndefined();
  });
});

describe('a record set on another tuning of the board (decision 0079)', () => {
  const saved = (fingerprint: string): Progress => {
    const data: SaveData = {
      version: 1,
      types: {},
      boards: { 'easy#1': { cleared: true, perfect: true, bestTime: 50, fingerprint } },
      runs: {
        easy: { cleared: true, bestBoard: 10, bestHp: 3, bestTime: 900, attempts: 2, fingerprint },
      },
      scaling: {},
      unlockAll: false,
      seenHowTo: false,
      lessons: [],
      ladderCards: [],
    };
    return new Progress(data);
  };

  it('keeps the clear and offers no time and no perfect', () => {
    expect(saved('stale').boardRecord(ladders, TYPE, BOARD)).toEqual({
      cleared: true,
      perfect: false,
      bestTime: null,
    });
    expect(saved('stale').runRecord(ladders, TYPE)).toEqual({
      cleared: true,
      bestBoard: 10,
      bestHp: null,
      bestTime: null,
      attempts: 2,
    });
  });

  it('is written over by the next clear, the first on this tuning', () => {
    const progress = saved('stale');
    expect(clear(progress, 70, 0)).toEqual({
      cleared: true,
      perfect: false,
      bestTime: 70,
      fingerprint: boardFingerprint(ladders, TYPE, BOARD),
    });
    expect(completeRun(progress, 1000, 0)).toMatchObject({
      bestTime: 1000,
      bestHp: 1,
      attempts: 3,
      fingerprint: ladderFingerprint(ladders, TYPE),
    });
  });

  it('is this tuning’s when it is stamped so, or from before stamps, which the next clear adds', () => {
    const current = saved(boardFingerprint(ladders, TYPE, BOARD));
    expect(current.boardRecord(ladders, TYPE, BOARD).bestTime).toBe(50);
    const old = new Progress({
      version: 1,
      types: {},
      boards: { 'easy#1': { cleared: true, perfect: false, bestTime: 50 } },
      runs: {},
      scaling: {},
      unlockAll: false,
      seenHowTo: false,
      lessons: [],
      ladderCards: [],
    });
    expect(old.boardRecord(ladders, TYPE, BOARD).bestTime).toBe(50);
    expect(clear(old, 90, 0)).toMatchObject({
      bestTime: 50,
      fingerprint: boardFingerprint(ladders, TYPE, BOARD),
    });
  });

  it('tells two boards, and two tunings of one, apart', () => {
    expect(boardFingerprint(ladders, TYPE, 1)).toMatch(/^[0-9a-f]{8}$/);
    expect(boardFingerprint(ladders, TYPE, 1)).not.toBe(boardFingerprint(ladders, TYPE, 2));
    expect(boardFingerprint(ladders, TYPE, 1)).toBe(boardFingerprint(ladders, TYPE, 1));
  });
});

describe('dials easier than the tuned game', () => {
  it('write no clear and no run, an attempt included', () => {
    const progress = new Progress();
    const easier = { ...DEFAULT_GAMEPLAY, hpRatio: 2 };
    const clear = { perfect: true, seconds: 10, dials: easier };
    expect(progress.recordClear(ladders, TYPE, BOARD, clear)).toBeNull();
    expect(progress.boardRecord(ladders, TYPE, BOARD).cleared).toBe(false);
    const run = { completed: true, reachedBoard: 10, hp: 1, seconds: 10, dials: easier };
    progress.recordRun(ladders, TYPE, run);
    expect(progress.runRecord(ladders, TYPE).attempts).toBe(0);
  });
});
