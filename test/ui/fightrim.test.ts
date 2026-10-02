// @vitest-environment happy-dom
/**
 * The glow after a fight's fourth option: damage only, the red rim alone, with the green of a
 * clean fight and the blue of a level-up left out.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/engine/types.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { type AppDriver, mountApp, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

const fought = (damage: number): GameEvent => ({
  type: 'battle',
  x: 0,
  y: 0,
  tier: 1,
  damage,
  defeated: true,
});
const rimOf = (host: Element): string[] =>
  [...host.classList].filter((c) => c.startsWith('fight-'));

describe('the glow for damage only', () => {
  it('lights the rim red for a hit and for nothing else', () => {
    app.settings.setPresentation({ fightRim: 'hits' });
    app.play('normal', 1, 7);
    const stage = document.querySelector('.stage')!;
    app.apply([fought(0)]);
    expect(rimOf(stage)).toEqual([]);
    app.apply([fought(0), { type: 'levelUp', level: 2 }]);
    expect(rimOf(stage)).toEqual([]);
    app.apply([fought(2), { type: 'levelUp', level: 3 }]);
    expect(rimOf(stage)).toEqual(['fight-hurt']);
  });

  it('is a tile on the glow row, and a save holding it is read', () => {
    app.showSettings(() => app.showTypes());
    const row = document.querySelector('.rim-demo')!.closest('.settings-row')!;
    const tile = tiles(row).find((b) => b.textContent === 'Damage only')!;
    tile.click();
    expect(Settings.load().presentation.fightRim).toBe('hits');
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { fightRim: 'hits' }, gameplay: {} }),
    );
    expect(Settings.load().presentation.fightRim).toBe('hits');
  });
});
