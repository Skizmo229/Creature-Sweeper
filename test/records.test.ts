/**
 * What a clear writes into the record book: a best time, or with hints and no best time yet, the
 * fewest hints (decisions 0048 and 0065). The same rule for a board and for a Full Run.
 */

import { describe, expect, it } from 'vitest';
import { Progress } from '../src/ui/progress.js';
import { ladders } from './helpers.js';

const TYPE = 'easy';
const BOARD = 1;

function clear(progress: Progress, seconds: number, hints: number) {
  progress.recordClear(ladders, TYPE, BOARD, { perfect: false, seconds, hints });
  return progress.boardRecord(TYPE, BOARD);
}

function completeRun(progress: Progress, seconds: number, hints: number) {
  progress.recordRun(TYPE, { completed: true, reachedBoard: 10, hp: 1, seconds, hints });
  return progress.runRecord(TYPE);
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
    progress.recordRun(TYPE, { completed: false, reachedBoard: 3, hp: 0, seconds: 100, hints: 1 });
    expect(progress.runRecord(TYPE)).toMatchObject({ bestTime: null, fewestHints: 4, attempts: 2 });
  });

  it('completed without hints retires the hint count', () => {
    const progress = new Progress();
    completeRun(progress, 900, 4);
    const rec = completeRun(progress, 1200, 0);
    expect(rec.bestTime).toBe(1200);
    expect(rec.fewestHints).toBeUndefined();
  });
});
