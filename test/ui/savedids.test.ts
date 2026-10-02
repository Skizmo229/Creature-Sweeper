// @vitest-environment happy-dom
/**
 * Names a saved settings file holds that this build has nothing by: a sound pack or a clear effect
 * from a newer build, or a hand-edited name such as `constructor`, which every plain object
 * inherits. Each is kept, so a newer build reading the save gets it back, and resolves here to the
 * ladder's own; none reaches a record by a key the record only inherits.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { autoplayTierOrder } from '../../src/sim/autoplay.js';
import type { Pip } from '../../src/ui/looktypes.js';
import { lookFor } from '../../src/ui/looks.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { pipName } from '../../src/ui/theme.js';
import { effectDuration } from '../../src/ui/victory/play.js';
import { type AppDriver, startApp } from './driver.js';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});

/** Write a save whose presentation holds `presentation`, then start the app on it. */
function startOn(presentation: Record<string, unknown>): AppDriver {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation }));
  return startApp();
}

describe('a saved name this build has nothing by', () => {
  it('plays the ladder’s own sound pack and clear effect, and keeps the name', () => {
    const app = startOn({ sfx: 'pack-from-a-newer-build', victory: 'effect-from-a-newer-build' });
    expect(app.settings.sfxPack('normal')).toBe(lookFor('normal').sfx);
    const effect = app.settings.victoryEffect('normal')!;
    expect(effect).toBe(lookFor('normal').victory);
    expect(Number.isFinite(effectDuration(effect, 1))).toBe(true);
    expect(Settings.load().presentation.sfx).toBe('pack-from-a-newer-build');
  });

  it('never finds a palette, face, icon, pack or effect a plain object only inherits', () => {
    const names = ['constructor', 'toString', '__proto__', '__defineGetter__'];
    for (const name of names) {
      localStorage.clear();
      document.body.innerHTML = '<div id="app"></div>';
      const app = startOn({
        palette: name,
        font: name,
        interfaceFont: name,
        icons: name,
        sfx: name,
        victory: name,
      });
      // The palette is NORMAL's, as any unknown one's is; the icon is kept, and draws as a disc.
      expect(app.settings.themeFor('normal').accent, name).toBe(lookFor('normal').palette.accent);
      expect(pipName(name as Pip), name).toBe(name);
      expect(app.settings.sfxPack('normal'), name).toBe(lookFor('normal').sfx);
      expect(app.settings.victoryEffect('normal'), name).toBe(lookFor('normal').victory);
      app.play('normal', 1, 7);
      autoplayTierOrder(app.current!);
      app.finish();
      expect(document.querySelector('.overlay'), name).not.toBeNull();
    }
  });

  it('drops a sound-check key assigned to a sound by such a name', () => {
    const app = startOn({ soundCheck: { keys: { r: 'constructor:toString' } } });
    app.showSettings(() => app.showTypes());
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Sound check')!
      .click();
    const clear = [...document.querySelectorAll<HTMLButtonElement>('.overlay.picker button')].find(
      (b) => b.textContent === 'Clear keys',
    )!;
    expect(clear.disabled).toBe(true);
  });
});
