// @vitest-environment happy-dom
/**
 * A version-1 save with a field of the wrong shape loads field by field rather than crashing
 * every launch; what this build does not know in it survives a round trip.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROGRESS_KEY } from '../../src/ui/savefile.js';
import { startApp } from './driver.js';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});

describe('a save with a field of the wrong shape', () => {
  it('loads the fields that read, and empty ones for the rest', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: 1,
        types: { easy: { highestBoard: 4, cleared: false } },
        boards: null,
        runs: 'none',
        scaling: [],
        unlockAll: 'yes',
        lessons: null,
        ladderCards: [1, 'easy', null],
      }),
    );
    const app = startApp();
    expect(document.querySelector('.type-groups')).not.toBeNull();
    expect(app.progress.typeRecord('easy').highestBoard).toBe(4);
    expect(app.progress.lessonDone('x')).toBe(false);
    expect(app.progress.ladderCardSeen('easy')).toBe(true);
    expect(app.progress.unlockAll).toBe(false);
  });

  it('keeps what this build does not know through a write', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: 1, types: {}, boards: {}, future: { from: 'a newer build' } }),
    );
    const app = startApp();
    app.progress.setUnlockAll(true);
    const written = JSON.parse(localStorage.getItem(PROGRESS_KEY)!) as Record<string, unknown>;
    expect(written).toMatchObject({
      version: 1,
      unlockAll: true,
      future: { from: 'a newer build' },
    });
    expect(written.lessons).toEqual([]);
  });
});
