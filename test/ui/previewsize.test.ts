// @vitest-environment happy-dom
/**
 * The preview size: every example board on the settings screen is drawn at it, the zoom example
 * excepted, and it is saved like any presentation setting.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { MAX_PREVIEW_SIZE, Settings } from '../../src/ui/settings.js';
import { CHIP_CELL, DEMO_CELL } from '../../src/ui/settingsscreen/render.js';
import { sampleBoard } from '../../src/ui/preview.js';

interface Driver {
  showSettings(back: () => void): void;
  showTypes(): void;
  settings: Settings;
}

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

/** A canvas's drawn width in CSS pixels. */
const width = (canvas: Element | null | undefined): number =>
  parseFloat((canvas as HTMLElement).style.width);

const settingsAt = (previewSize: number): void => {
  app.settings.setPresentation({ previewSize });
  app.showSettings(() => app.showTypes());
};

describe('the preview size', () => {
  const columns = sampleBoard().config.width;

  it('draws every thumbnail at its multiple of the size it was designed at', () => {
    settingsAt(2);
    const thumbs = [...document.querySelectorAll<HTMLCanvasElement>('.preview-chip canvas')];
    expect(thumbs.length).toBeGreaterThan(0);
    // The standard example's tiles, of which the icon row's Default is the first.
    expect(width(thumbs[0])).toBe(columns * CHIP_CELL * 2);
    expect(width(document.querySelector('.rim-demo canvas'))).toBe(columns * CHIP_CELL * 2);
    const screen = document.querySelector<HTMLElement>('.settings-screen')!;
    expect(screen.style.getPropertyValue('--chip-w')).toBe(`${columns * CHIP_CELL * 2}px`);
  });

  it('draws the clear-effect demo at it too', () => {
    settingsAt(1);
    const before = width(document.querySelector('.clear-demo canvas'));
    settingsAt(0.5);
    const after = width(document.querySelector('.clear-demo canvas'));
    expect(after / before).toBeCloseTo(Math.round(DEMO_CELL * 0.5) / DEMO_CELL, 5);
  });

  it('leaves the zoom example at the size it sets', () => {
    settingsAt(1);
    const before = width(document.querySelector('.zoom-demo canvas'));
    settingsAt(3);
    expect(width(document.querySelector('.zoom-demo canvas'))).toBe(before);
  });

  it('is set by its slider on release, and the thumbnail beside it follows the drag', () => {
    app.showSettings(() => app.showTypes());
    const control = document.querySelector<HTMLElement>('[data-setting="previewSize"]')!;
    const input = control.querySelector<HTMLInputElement>('input[type="range"]')!;
    input.value = '1.5';
    input.dispatchEvent(new Event('input'));
    expect(width(control.querySelector('canvas'))).toBe(columns * Math.round(CHIP_CELL * 1.5));
    expect(app.settings.presentation.previewSize).toBe(1);

    input.dispatchEvent(new Event('change'));
    expect(app.settings.presentation.previewSize).toBe(1.5);
    expect(width(document.querySelector('.preview-chip canvas'))).toBe(
      columns * Math.round(CHIP_CELL * 1.5),
    );
  });

  it('is saved, and a save out of range is held to the range', () => {
    app.settings.setPresentation({ previewSize: 2 });
    expect(Settings.load().presentation.previewSize).toBe(2);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { previewSize: 40 }, gameplay: {} }),
    );
    expect(Settings.load().presentation.previewSize).toBe(MAX_PREVIEW_SIZE);
    // A save from before the setting reads as the size the examples were always drawn at.
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.previewSize).toBe(1);
  });
});
