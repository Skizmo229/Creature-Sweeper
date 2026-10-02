// @vitest-environment happy-dom
/**
 * Which sounds the game plays: a list of silenced events in the presentation settings, passed
 * over in play and not in the sound check; an action whose loudest sound is silenced making its
 * next loudest; the named sets on the settings screen and the boxes in the sound check; and a
 * save that predates it, or names sounds this build lacks, silencing nothing it knows.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/engine/types.js';
import { soundFor } from '../../src/ui/game/sound.js';
import { SFX_EVENTS } from '../../src/ui/looktypes.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { type AppDriver, mountApp, settingsRow, tileLabel, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

const kill: GameEvent = { type: 'battle', x: 0, y: 0, tier: 1, damage: 0, defeated: true };
const opened: GameEvent = { type: 'revealed', cells: [{ x: 0, y: 0 }] };

describe('the sound for an action', () => {
  it('is the loudest its events call for, and the next loudest when that is silenced', () => {
    expect(soundFor([opened, kill])).toBe('kill');
    expect(soundFor([opened, kill], (e) => e !== 'kill')).toBe('open');
    expect(soundFor([opened, kill], (e) => e !== 'kill' && e !== 'open')).toBeNull();
    expect(soundFor([{ type: 'won' }, kill])).toBeNull();
  });
});

describe('the mixer', () => {
  it('passes over a silenced event in play and auditions it still', () => {
    const heard: string[] = [];
    // happy-dom has no audio, so the real `sound` would mark the mixer dead.
    Object.assign(app.sfx, { sound: (_pack: string, event: string) => heard.push(event) });
    app.sfx.setPack('chime');
    app.settings.setPresentation({ silenced: ['open'] });
    expect(app.sfx.plays('open')).toBe(false);
    expect(app.sfx.plays('kill')).toBe(true);
    app.sfx.play('open');
    app.sfx.play('kill');
    app.sfx.audition('chime', 'open');
    expect(heard).toEqual(['kill', 'open']);
  });
});

describe('the settings', () => {
  const lit = (r: HTMLElement): string[] =>
    tiles(r)
      .filter((t) => t.classList.contains('active'))
      .map(tileLabel);

  it('offers named sets, and a Custom tile lit by any other', () => {
    app.showSettings(() => app.showTypes());
    const r = settingsRow('Which sounds play');
    expect(tiles(r)).toHaveLength(4);
    expect(lit(r)).toEqual(['Every sound']);
    tiles(r)[1]!.click();
    expect([...Settings.load().presentation.silenced].sort()).toEqual([
      'cascade',
      'mark',
      'note',
      'open',
    ]);
    tiles(r)[2]!.click();
    const silenced = Settings.load().presentation.silenced;
    expect(silenced).not.toContain('kill');
    expect(silenced).toContain('sweep');
    expect(silenced).toContain('open');

    app.settings.setPresentation({ silenced: ['sweep'] });
    app.showSettings(() => app.showTypes());
    expect(lit(settingsRow('Which sounds play'))).toEqual(['Custom — 1 silenced']);
  });

  it('silences single sounds from the sound check', () => {
    app.showSettings(() => app.showTypes());
    tiles(settingsRow('Which sounds play'))[3]!.click();
    const boxes = [...document.querySelectorAll<HTMLInputElement>('.soundcheck-played input')];
    expect(boxes).toHaveLength(SFX_EVENTS.length);
    expect(boxes.every((b) => b.checked)).toBe(true);
    boxes[0]!.click();
    expect(Settings.load().presentation.silenced).toEqual(['open']);
    boxes[0]!.click();
    expect(Settings.load().presentation.silenced).toEqual([]);
  });

  it('reads a save from before it, or naming sounds it lacks, as silencing what it knows', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation: {} }));
    expect(Settings.load().presentation.silenced).toEqual([]);
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, presentation: { silenced: ['open', 'gong', 7] } }),
    );
    expect(Settings.load().presentation.silenced).toEqual(['open']);
  });
});
