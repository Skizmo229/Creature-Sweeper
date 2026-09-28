// @vitest-environment happy-dom
/**
 * The stage's own motion after a fight, the shake and the level-up glow, as a setting: both, the
 * glow alone, or neither, apart from the rim's own setting; played on the settings screen's
 * example by the glow row's buttons; and read from a save as both, which the stage always did.
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

const hit: GameEvent = { type: 'battle', x: 0, y: 0, tier: 1, damage: 2, defeated: true };
const levelUp: GameEvent = { type: 'levelUp', level: 2 };

/** The stage's animation classes: which of the shake, the glow and the rim last played. */
const played = (host: Element): string[] =>
  [...host.classList].filter((c) => c === 'shake' || c === 'levelup' || c.startsWith('fight-'));

describe('the motion setting', () => {
  it('plays the shake and the glow with the rim by default', () => {
    app.play('normal', 1, 7);
    const stage = document.querySelector('.stage')!;
    app.apply([hit, levelUp]);
    expect(played(stage).sort()).toEqual(['fight-hurt', 'levelup', 'shake']);
  });

  it('leaves the shake out, or both, and the rim plays on', () => {
    app.settings.setPresentation({ motion: 'noShake' });
    app.play('normal', 1, 7);
    const stage = document.querySelector('.stage')!;
    app.apply([hit, levelUp]);
    expect(played(stage).sort()).toEqual(['fight-hurt', 'levelup']);

    app.settings.setPresentation({ motion: 'none' });
    app.play('normal', 1, 7);
    const still = document.querySelector('.stage')!;
    app.apply([hit, levelUp]);
    expect(played(still)).toEqual(['fight-hurt']);
  });

  it('is played on the settings screen by the glow row’s buttons, under the option picked', () => {
    const here = app;
    here.showSettings(() => here.showTypes());
    const demo = document.querySelector('.rim-demo')!;
    const row = demo.closest('.settings-row')!;
    const button = (label: string): HTMLButtonElement =>
      [...row.querySelectorAll<HTMLButtonElement>('.rim-demo-acts button')].find((b) =>
        b.textContent?.startsWith(label),
      )!;
    button('Hit').click();
    expect(played(demo).sort()).toEqual(['fight-hurt', 'shake']);

    const motion = [...document.querySelectorAll('.settings-row')].find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Motion after a fight',
    )!;
    [...motion.querySelectorAll<HTMLButtonElement>('.preview-chip')]
      .find((b) => b.textContent === 'Neither')!
      .click();
    expect(here.settings.presentation.motion).toBe('none');
    // The classes of the last play are removed only by the next; the shake is not put back.
    demo.classList.remove('shake', 'fight-hurt');
    button('Level-up').click();
    expect(played(demo)).toEqual(['fight-levelup']);
  });

  it('reads a save from before it, or one holding anything else, as both', () => {
    for (const presentation of [{}, { motion: 'lots' }]) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation, gameplay: {} }),
      );
      expect(Settings.load().presentation.motion).toBe('full');
    }
  });
});
