// @vitest-environment happy-dom
/**
 * The sound effects volume is saved, reaches every sound the game plays, and leaves the sound
 * check's own volume alone. A save from before the setting reads as full volume.
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
    range.value = '0.35';
    range.dispatchEvent(new Event('input'));
    expect(heard).toEqual([]);
    range.dispatchEvent(new Event('change'));

    expect(Settings.load().presentation.sfxVolume).toBe(0.35);
    expect(setting.querySelector('.settings-value')!.textContent).toBe('35%');
    expect(heard).toEqual([['levelup', 0.35]]);
    expect(Settings.load().presentation.soundCheck.volume).toBe(1);
  });

  it('reads a save without it as full volume, and clamps one out of range', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.sfxVolume).toBe(1);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { sfxVolume: 7 } }),
    );
    expect(Settings.load().presentation.sfxVolume).toBe(1);
  });
});
