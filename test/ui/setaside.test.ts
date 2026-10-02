// @vitest-environment happy-dom
/**
 * A save this build cannot read is set aside, never written over (decision 0080): a newer
 * version's or a damaged one is kept under its own key, the ladder list says so, and Reset
 * progress clears it with the rest. The play statistics are kept the same way.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { PROGRESS_KEY, keptKey } from '../../src/ui/savefile.js';
import { TELEMETRY_KEY } from '../../src/ui/telemetry.js';
import { TelemetryStore } from '../../src/ui/telemetrystore.js';

interface Driver {
  readonly progress: {
    setUnlockAll(on: boolean): void;
    reset(): void;
    readonly unreadableKept: boolean;
  };
}

const start = (): Driver => new App(document.getElementById('app')!) as unknown as Driver;

const notice = (): string | undefined =>
  [...document.querySelectorAll('.settings-warn')]
    .map((p) => p.textContent ?? '')
    .find((t) => t.includes('set aside'));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});

describe('a save this build cannot read', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['damaged', '{not json'],
    ['from a newer version', '{"version":2,"types":{},"boards":{}}'],
  ];
  for (const [what, raw] of cases) {
    it(`${what} is set aside as the game loads, said so, and erased by Reset progress`, () => {
      localStorage.setItem(PROGRESS_KEY, raw);
      const app = start();
      // Copied as the save loads, before anything can write: the first visit writes at once.
      expect(localStorage.getItem(keptKey(PROGRESS_KEY))).toBe(raw);
      expect(app.progress.unreadableKept).toBe(true);
      expect(notice()).toContain('set aside');

      app.progress.setUnlockAll(true);
      expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)!)).toMatchObject({ version: 1 });
      expect(localStorage.getItem(keptKey(PROGRESS_KEY))).toBe(raw);

      app.progress.reset();
      expect(localStorage.getItem(keptKey(PROGRESS_KEY))).toBeNull();
      expect(app.progress.unreadableKept).toBe(false);
    });
  }

  it('is not what a readable save or an empty store is', () => {
    const app = start();
    expect(app.progress.unreadableKept).toBe(false);
    expect(notice()).toBeUndefined();
    app.progress.setUnlockAll(true);
    expect(start().progress.unreadableKept).toBe(false);
    expect(localStorage.getItem(keptKey(PROGRESS_KEY))).toBeNull();
  });
});

describe('play statistics this build cannot read', () => {
  it('are set aside the same way, and let go by a reset', () => {
    localStorage.setItem(TELEMETRY_KEY, '{"version":9}');
    TelemetryStore.load();
    expect(localStorage.getItem(keptKey(TELEMETRY_KEY))).toBe('{"version":9}');
    TelemetryStore.load().reset();
    expect(localStorage.getItem(keptKey(TELEMETRY_KEY))).toBeNull();
  });
});
