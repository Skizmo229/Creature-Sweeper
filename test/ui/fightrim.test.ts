// @vitest-environment happy-dom
/**
 * The glow after a fight's fourth option: damage only, the red rim alone, with the green of a
 * clean fight and the blue of a level-up left out.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/engine/types.js';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  apply(events: GameEvent[]): void;
  showSettings(back: () => void): void;
  showTypes(): void;
  readonly settings: Settings;
}

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
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
    const tile = [...row.querySelectorAll<HTMLButtonElement>('.preview-chip')].find(
      (b) => b.textContent === 'Damage only',
    )!;
    tile.click();
    expect(Settings.load().presentation.fightRim).toBe('hits');
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { fightRim: 'hits' }, gameplay: {} }),
    );
    expect(Settings.load().presentation.fightRim).toBe('hits');
  });
});
