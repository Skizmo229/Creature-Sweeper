// @vitest-environment happy-dom
/**
 * The HUD's clock as a setting: seconds, as it always counted; minutes and seconds; or hidden,
 * with the clock running underneath whatever is shown, so a best time and Time Attack's countdown
 * are what they were.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { autoplayTierOrder } from '../../src/sim/autoplay.js';
import { clockText } from '../../src/ui/game/hud.js';
import { ladders } from '../../src/ui/ladders.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { type AppDriver, mountApp, settingsRow, tileLabel, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

const readout = (): HTMLElement => document.querySelector<HTMLElement>('.hud-t')!;

describe('the clock setting', () => {
  it('writes seconds, or minutes and seconds', () => {
    expect(clockText(125, 'seconds')).toBe('125');
    expect(clockText(125, 'minutes')).toBe('2:05');
    expect(clockText(7, 'minutes')).toBe('0:07');
    expect(clockText(3600, 'minutes')).toBe('60:00');
  });

  it('reads in the HUD as chosen, and hides, while the clock runs on', () => {
    app.play('normal', 1, 7);
    // As though the board had been played for two minutes and five seconds.
    app.clock.resumeAt(125_000);
    app.updateClock();
    expect(readout().textContent).toBe('TIME 125');
    expect(readout().hidden).toBe(false);

    app.settings.setPresentation({ clock: 'minutes' });
    app.updateClock();
    expect(readout().textContent).toBe('TIME 2:05');

    app.settings.setPresentation({ clock: 'hidden' });
    app.updateClock();
    expect(readout().hidden).toBe(true);
    // The clock is only hidden: the clear is timed as ever.
    autoplayTierOrder(app.current!);
    app.finish();
    expect(app.progress.boardRecord(ladders, 'normal', 1).bestTime).toBeGreaterThanOrEqual(125);
  });

  it('shows Time Attack’s countdown in the style too', () => {
    app.progress.recordClear(ladders, 'normal', 1, { perfect: false, seconds: 200 });
    app.settings.setGameplay({ timeAttack: true });
    app.settings.setPresentation({ clock: 'minutes' });
    app.play('normal', 1, 7);
    app.clock.resumeAt(65_000);
    app.updateClock();
    expect(readout().textContent).toBe('TIME 2:15 LEFT');
  });

  it('leaves a school lesson untimed after a timed board', () => {
    app.settings.setGameplay({ timeLimit: 10 });
    app.play('normal', 1, 7);
    expect(app.clock.timeLimit).toBe(10);
    app.teaching.startLesson(0);
    expect(app.clock.timeLimit).toBeNull();
    // As though the lesson had been studied for longer than the limit the last board had.
    app.clock.resumeAt(11_000);
    app.updateClock();
    expect(readout().textContent).toBe('TIME 11');
    expect(app.current!.status).toBe('playing');
  });

  it('leaves a school lesson untimed after a board that ran out of time', () => {
    app.settings.setGameplay({ timeLimit: 10 });
    app.play('normal', 1, 7);
    app.clock.resumeAt(10_000);
    app.updateClock();
    expect(app.current!.status).toBe('lost');
    expect(app.clock.timeExpired).toBe(true);
    app.teaching.startLesson(0);
    expect(app.clock.timeLimit).toBeNull();
    expect(app.clock.timeExpired).toBe(false);
    app.updateClock();
    expect(readout().textContent).toBe('TIME 0');
  });

  it('is offered on the settings screen with a sample of each style', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Clock');
    const styles = tiles(row);
    expect(styles.map(tileLabel)).toEqual(['Seconds', 'Minutes and seconds', 'Hidden']);
    expect(styles[0]!.querySelector('.hud-t')!.textContent).toBe('TIME 125');
    expect(styles[1]!.querySelector('.hud-t')!.textContent).toBe('TIME 2:05');
    styles[1]!.click();
    expect(Settings.load().presentation.clock).toBe('minutes');
  });

  it('reads a save from before it, or one holding anything else, as seconds', () => {
    for (const presentation of [{}, { clock: 'sundial' }]) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation, gameplay: {} }),
      );
      expect(Settings.load().presentation.clock).toBe('seconds');
    }
  });
});
