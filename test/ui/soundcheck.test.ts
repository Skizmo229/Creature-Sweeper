// @vitest-environment happy-dom
/**
 * The sound check keeps its keys and pitches in the settings: they survive a reload and a closed
 * window, and a save carrying anything malformed loses only the malformed entries.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

interface Driver {
  showSettings(back: () => void): void;
  showTypes(): void;
}

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

const openSoundCheck = (): HTMLElement => {
  app.showSettings(() => app.showTypes());
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent === 'Sound check')!
    .click();
  return document.querySelector<HTMLElement>('.overlay.picker')!;
};

const press = (k: string): void => {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
};

const button = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;

describe('the sound check', () => {
  it('saves assigned keys and tuned pitches, and shows them again after a reload', () => {
    let window_ = openSoundCheck();
    const first = window_.querySelectorAll<HTMLButtonElement>('.soundcheck-sound')[0]!;
    button(window_, 'Assign key').click();
    first.click();
    press('q');
    first.click();
    [...window_.querySelectorAll<HTMLButtonElement>('.piano-key')]
      .find((k) => k.title === 'E5')!
      .click();

    const saved = Settings.load().presentation.soundCheck;
    expect(saved.keys).toEqual({ q: 'chime:open' });
    expect(saved.pitches).toEqual({ 'chime:open': 76 });

    // A fresh app reads the save, as a reload would.
    document.body.innerHTML = '<div id="app"></div>';
    app = new App(document.getElementById('app')!) as unknown as Driver;
    window_ = openSoundCheck();
    const badge = window_.querySelector('.soundcheck-sound .soundcheck-key')!;
    expect(badge.textContent).toBe('Q · E5');

    button(window_, 'Clear keys').click();
    button(window_, 'Clear custom pitches').click();
    expect(Settings.load().presentation.soundCheck).toEqual({ keys: {}, pitches: {} });
  });

  it('drops malformed entries from a save and keeps the rest', () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        presentation: {
          soundCheck: {
            keys: { q: 'blip:win', w: 7, e: 'nopack:open' },
            pitches: { 'blip:win': 72, 'chime:open': 60.5, 'thud:lose': 400, 'glass:mark': '60' },
          },
        },
      }),
    );
    const saved = Settings.load().presentation.soundCheck;
    // An unknown sound is kept, as a newer build's would be; the window passes over it.
    expect(saved.keys).toEqual({ q: 'blip:win', e: 'nopack:open' });
    expect(saved.pitches).toEqual({ 'blip:win': 72 });
  });
});
