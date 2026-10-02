// @vitest-environment happy-dom
/**
 * Every slider on the settings screen carries a Reset: lit only while the slider stands off its
 * default, and moving it there as a drag and a release would, so a setting with no tile to name
 * its default still has a way back short of resetting its whole section.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAMEPLAY } from '../../src/engine/settings.js';
import { type AppDriver, mountApp, settingsRow } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
  app.showSettings(() => app.showTypes());
});

/** A settings row by its name, and the slider, readout and Reset in it. */
function sliderRow(name: string): {
  input: HTMLInputElement;
  readout: HTMLElement;
  reset: HTMLButtonElement;
  status: () => string;
} {
  const row = settingsRow(name);
  return {
    input: row.querySelector<HTMLInputElement>('input[type=range]')!,
    readout: row.querySelector<HTMLElement>('.settings-value')!,
    reset: row.querySelector<HTMLButtonElement>('.settings-reset')!,
    status: () => document.querySelector('.settings-status')?.textContent ?? '',
  };
}

const drag = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
};

describe('a slider’s Reset', () => {
  it('is on every slider, dark at the default and lit off it', () => {
    const sliders = [...document.querySelectorAll<HTMLElement>('.settings-slider')];
    expect(sliders.length).toBeGreaterThanOrEqual(9);
    for (const box of sliders) {
      const reset = box.querySelector<HTMLButtonElement>('.settings-reset');
      expect(reset, box.parentElement?.textContent ?? '').not.toBeNull();
      expect(reset!.disabled).toBe(true);
    }
    const { input, reset } = sliderRow('Sound effects volume');
    drag(input, '2');
    expect(reset.disabled).toBe(false);
  });

  it('moves a presentation slider back and saves it, as a drag and a release would', () => {
    const { input, readout, reset } = sliderRow('Sound effects volume');
    drag(input, '2');
    expect(app.settings.presentation.sfxVolume).toBe(2);
    reset.click();
    expect(input.value).toBe('1');
    expect(readout.textContent).toBe('100%');
    expect(app.settings.presentation.sfxVolume).toBe(1);
    expect(reset.disabled).toBe(true);
  });

  it('commits a slider that applies on release, and refreshes what a gameplay dial says', () => {
    const text = sliderRow('Text size');
    drag(text.input, '1.5');
    expect(app.settings.presentation.textSize).toBe(1.5);
    // The reset rebuilds the screen, so the row is found again.
    text.reset.click();
    expect(app.settings.presentation.textSize).toBe(1);
    expect(document.documentElement.style.fontSize).toBe('100%');

    const hp = sliderRow('Player HP');
    drag(hp.input, '2');
    expect(hp.status()).toMatch(/^Nothing will record/);
    hp.reset.click();
    expect(app.settings.gameplay.hpRatio).toBe(DEFAULT_GAMEPLAY.hpRatio);
    expect(hp.status()).toBe('Tuned game — everything records.');
  });

  it('follows a value set somewhere else, as the speaker sets the volume', () => {
    const { reset } = sliderRow('Sound effects volume');
    const corner = document.querySelector<HTMLInputElement>('.speaker .volume-pop input')!;
    corner.value = '0.5';
    corner.dispatchEvent(new Event('input'));
    expect(reset.disabled).toBe(false);
    corner.value = '1';
    corner.dispatchEvent(new Event('input'));
    expect(reset.disabled).toBe(true);
  });
});
