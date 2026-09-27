// @vitest-environment happy-dom
/**
 * The sound effects volume is saved, reaches every sound the game plays, and leaves the sound
 * check's own volume alone. A save from before the setting reads as full volume. The speaker in
 * the corner carries the same slider, and the two never disagree.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
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

/** What the game's mixer is asked to play, as [event, volume] pairs. */
function listen(): [string, number][] {
  const sfx = (app as unknown as { sfx: Sfx }).sfx;
  const heard: [string, number][] = [];
  // happy-dom has no audio, so the real `sound` would mark the mixer dead.
  Object.assign(sfx, {
    sound: (_pack: string, event: string, _ratio: number, volume: number) =>
      heard.push([event, volume]),
  });
  return heard;
}

describe('the sound effects volume', () => {
  it('is saved, heard on release, and scales what the game plays', () => {
    expect(Settings.load().presentation.sfxVolume).toBe(1);
    app.showSettings(() => app.showTypes());
    const heard = listen();
    const setting = [...document.querySelectorAll('.settings-row')].find((r) =>
      r.textContent?.startsWith('Sound effects volume'),
    )!;
    const range = setting.querySelector<HTMLInputElement>('input[type=range]')!;
    range.value = '2.35';
    range.dispatchEvent(new Event('input'));
    expect(heard).toEqual([]);
    range.dispatchEvent(new Event('change'));

    expect(Settings.load().presentation.sfxVolume).toBe(2.35);
    expect(setting.querySelector('.settings-value')!.textContent).toBe('235%');
    expect(heard).toEqual([['levelup', 2.35]]);
    expect(Settings.load().presentation.soundCheck.volume).toBe(1);
  });

  it('is under the speaker too, where moving it turns a muted game back on', () => {
    const range = document.querySelector<HTMLInputElement>('.speaker .volume-pop input')!;
    const readout = document.querySelector('.speaker .volume-readout')!;
    expect(range.value).toBe('1');
    expect(readout.textContent).toBe('100%');

    document.querySelector<HTMLButtonElement>('.mute-toggle')!.click();
    expect(Settings.load().presentation.muted).toBe(true);
    const heard = listen();
    range.value = '0.4';
    range.dispatchEvent(new Event('input'));
    expect(heard).toEqual([]);
    range.dispatchEvent(new Event('change'));

    const saved = Settings.load().presentation;
    expect(saved.sfxVolume).toBe(0.4);
    expect(saved.muted).toBe(false);
    expect(readout.textContent).toBe('40%');
    expect(document.querySelector('.mute-toggle')!.classList.contains('is-muted')).toBe(false);
    expect(heard).toEqual([['levelup', 0.4]]);
  });

  it('keeps the speaker and the settings screen showing the same volume', () => {
    app.showSettings(() => app.showTypes());
    const setting = [...document.querySelectorAll('.settings-row')].find((r) =>
      r.textContent?.startsWith('Sound effects volume'),
    )!;
    const screen = setting.querySelector<HTMLInputElement>('input[type=range]')!;
    const corner = document.querySelector<HTMLInputElement>('.speaker .volume-pop input')!;

    corner.value = '1.5';
    corner.dispatchEvent(new Event('input'));
    expect(screen.value).toBe('1.5');
    expect(setting.querySelector('.settings-value')!.textContent).toBe('150%');

    screen.value = '0.75';
    screen.dispatchEvent(new Event('input'));
    expect(corner.value).toBe('0.75');
    expect(document.querySelector('.speaker .volume-readout')!.textContent).toBe('75%');
  });

  it('reads a save without it as full volume, and clamps one out of range', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.sfxVolume).toBe(1);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { sfxVolume: 7 } }),
    );
    expect(Settings.load().presentation.sfxVolume).toBe(3);
  });
});
