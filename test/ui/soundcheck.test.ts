// @vitest-environment happy-dom
/**
 * The sound check keeps its keys and pitches in the settings: they survive a reload and a closed
 * window, and a save carrying anything malformed loses only the malformed entries. Retuned sounds
 * reach the game's own mixer only while the custom pitches setting is on.
 */

import './setup.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import type { Sfx } from '../../src/ui/sfx.js';

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

  it('plays retuned sounds in the game only while custom pitches are on', () => {
    const window_ = openSoundCheck();
    window_.querySelectorAll<HTMLButtonElement>('.soundcheck-sound')[0]!.click();
    [...window_.querySelectorAll<HTMLButtonElement>('.piano-key')]
      .find((k) => k.title === 'E5')!
      .click();

    // What the game's mixer is handed, and what one of its sounds is played at.
    const sfx = (app as unknown as { sfx: Sfx }).sfx;
    const heard: number[] = [];
    // happy-dom has no audio, so the sound check's own plays left the mixer marked dead.
    Object.assign(sfx, {
      dead: false,
      sound: (_pack: string, _event: string, ratio: number) => heard.push(ratio),
    });
    sfx.setPack('chime');
    const openCell = (): number => {
      // Past the mixer's throttle, so every call is heard.
      vi.advanceTimersByTime(1000);
      sfx.play('open');
      return heard.at(-1)!;
    };
    vi.useFakeTimers();
    try {
      expect(Settings.load().presentation.customPitches).toBe(false);
      expect(openCell()).toBe(1);

      const setting = [...document.querySelectorAll('.settings-row')].find((r) =>
        r.textContent?.startsWith('Custom pitches in play'),
      )!;
      const box = setting.querySelector<HTMLInputElement>('input[type=checkbox]')!;
      box.click();
      sfx.setPack('chime');
      expect(Settings.load().presentation.customPitches).toBe(true);
      // Chimes' open starts on A5 (880 Hz); E5 is a fourth below.
      expect(openCell()).toBeCloseTo(659.255 / 880, 4);

      box.click();
      sfx.setPack('chime');
      expect(openCell()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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
