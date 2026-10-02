// @vitest-environment happy-dom
/**
 * The board's digit size: the numbers, marks and pencil notes drawn at a multiple of their own
 * size, saved like any presentation setting, with the standard example following the slider.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { themeFor } from '../../src/ui/looks.js';
import { MAX_DIGIT_SIZE } from '../../src/ui/presentation.js';
import { sampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import { type AppDriver, mountApp, settingsRow } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

/** The size a face's digits are measured at before they are sized, which is not a drawing. */
const PROBE_PX = 100;

/** Every font size set for drawing on a canvas made while this runs, in pixels. */
function recordFonts(): { sizes: number[]; stop: () => void } {
  const sizes: number[] = [];
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    return new Proxy(inner, {
      set(target, prop, value) {
        if (prop === 'font') {
          const px = /(\d+)px/.exec(String(value));
          if (px && Number(px[1]) !== PROBE_PX) sizes.push(Number(px[1]));
        }
        return Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { sizes, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

describe('the digit size', () => {
  let recording: ReturnType<typeof recordFonts>;
  beforeEach(() => {
    recording = recordFonts();
  });
  afterEach(() => recording.stop());

  /** The largest number drawn on the standard example at a scale, in pixels. */
  const largest = (digitScale: number): number => {
    recording.sizes.length = 0;
    renderPreview(
      sampleBoard(),
      themeFor('normal'),
      { ...DEFAULT_DISPLAY, highlight: null, digitScale },
      { cell: 26 },
    );
    return Math.max(...recording.sizes);
  };

  it('scales the numbers on the board', () => {
    const plain = largest(1);
    expect(plain).toBeGreaterThan(0);
    expect(largest(MAX_DIGIT_SIZE) / plain).toBeCloseTo(MAX_DIGIT_SIZE, 1);
    expect(largest(0.7) / plain).toBeCloseTo(0.7, 1);
  });

  it('is what a board is drawn with, and follows a change made during it', () => {
    app.play('normal', 1, 7);
    expect(app.view!.display.digitScale).toBe(1);
    app.settings.setPresentation({ digitSize: 1.3 });
    expect(app.view!.display.digitScale).toBe(1.3);
  });

  it('is a slider whose example follows the thumb, saved on release', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Digit size');
    const input = row.querySelector<HTMLInputElement>('input[type=range]')!;
    expect(row.querySelector('.digit-size-demo canvas')).not.toBeNull();
    recording.sizes.length = 0;
    input.value = '1.4';
    input.dispatchEvent(new Event('input'));
    expect(recording.sizes.length).toBeGreaterThan(0);
    expect(app.settings.presentation.digitSize).toBe(1);
    input.dispatchEvent(new Event('change'));
    expect(app.settings.presentation.digitSize).toBe(1.4);
  });

  it('is saved, held to its range, and read from a save without it as its own size', () => {
    app.settings.setPresentation({ digitSize: 1.2 });
    expect(Settings.load().presentation.digitSize).toBe(1.2);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { digitSize: 9 }, gameplay: {} }),
    );
    expect(Settings.load().presentation.digitSize).toBe(MAX_DIGIT_SIZE);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.digitSize).toBe(1);
  });
});
