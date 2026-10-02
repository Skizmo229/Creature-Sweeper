// @vitest-environment happy-dom
/**
 * Keeping the play statistics as a setting: on, an attempt is written down as it ends; off,
 * nothing more is, and what was kept stays.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { autoplayTierOrder } from '../../src/sim/autoplay.js';
import { SETTINGS_KEY, boardKey } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { TelemetryStore } from '../../src/ui/telemetrystore.js';
import { type AppDriver, mountApp, settingsRow } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

/** How many boards the statistics on this device hold attempts on. */
const boardsKept = (): number => Object.keys(TelemetryStore.load().current.tuned).length;

describe('keeping play statistics', () => {
  it('writes an attempt down while on, and not while off', () => {
    app.play('normal', 1, 7);
    autoplayTierOrder(app.current!);
    app.finish();
    expect(boardsKept()).toBe(1);

    app.settings.setPresentation({ keepStats: false });
    app.play('normal', 2, 7);
    autoplayTierOrder(app.current!);
    app.finish();
    expect(boardsKept()).toBe(1);

    app.settings.setPresentation({ keepStats: true });
    app.play('normal', 3, 7);
    autoplayTierOrder(app.current!);
    app.finish();
    expect(boardsKept()).toBe(2);
  });

  it("times each board from its own deal, not from the last board's clock", () => {
    const secondsOn = (board: number): number =>
      TelemetryStore.load().current.tuned[boardKey('normal', board)]!.seconds;
    app.play('normal', 1, 7);
    app.clock.addSeconds(30);
    autoplayTierOrder(app.current!);
    app.finish();
    expect(secondsOn(1)).toBeGreaterThanOrEqual(30);

    // The clock still holds board 1's 30 seconds when board 2 is dealt.
    app.play('normal', 2, 7);
    app.clock.addSeconds(5);
    autoplayTierOrder(app.current!);
    app.finish();
    expect(secondsOn(2)).toBeGreaterThanOrEqual(5);
    expect(secondsOn(2)).toBeLessThan(30);
  });

  it('is a toggle on the settings screen, and reads a save without it as on', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Keep play statistics');
    const box = row.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.checked).toBe(true);
    box.click();
    expect(Settings.load().presentation.keepStats).toBe(false);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.keepStats).toBe(true);
  });
});
