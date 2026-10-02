// @vitest-environment happy-dom
/**
 * A ladder's own settings (decision 0070): the settings screen's scope switch, a pick in a
 * ladder's scope kept as that ladder's alone and read there and nowhere else, a setting no ladder
 * can own going to every ladder whatever the scope, the ladder's own given up, the save that
 * carries them, and the sections that wait for the scope that can set them.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { themeFor } from '../../src/ui/looks.js';
import { CUSTOM_TIERS, DEFAULT } from '../../src/ui/presentation.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { DEFAULT_TIERS, TIER_PRESETS } from '../../src/ui/tiercolors.js';
import { FONTS } from '../../src/ui/typefaces.js';
import { type AppDriver, mountApp, settingsRow, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
  app.progress.setUnlockAll(true);
});

/** The settings screen opened from a ladder's boards, in the scope asked for. */
function openSettings(typeId: string, ladderScope: boolean): void {
  app.showBoards(typeId);
  app.showSettings(() => app.showBoards(typeId));
  const wanted = ladderScope ? `${typeId.toUpperCase()} only` : 'Every ladder';
  const button = [...document.querySelectorAll<HTMLButtonElement>('.settings-scope button')].find(
    (b) => b.textContent === wanted,
  )!;
  if (button.getAttribute('aria-pressed') !== 'true') button.click();
}

describe('the store', () => {
  it('keeps a ladder’s own settings over the ones for every ladder, and reads them there alone', () => {
    app.settings.setPresentationFor('normal', { palette: 'star', font: 'bungee' });
    expect(app.settings.presentation.palette).toBe(DEFAULT);
    expect(app.settings.presentationFor('normal').palette).toBe('star');
    expect(app.settings.presentationFor('easy').palette).toBe(DEFAULT);
    expect(app.settings.themeFor('normal').tile).toBe(themeFor('star').tile);
    expect(app.settings.themeFor('easy').tile).toBe(themeFor('easy').tile);
    expect(app.settings.boardFont('normal')).toBe(FONTS.bungee);
    expect(app.settings.ownKeys('normal').sort()).toEqual(['font', 'palette']);
    // The settings for every ladder still show through where the ladder has nothing of its own.
    app.settings.setPresentation({ icons: 'star' });
    expect(app.settings.presentationFor('normal').icons).toBe('star');
  });

  it('gives a setting no ladder can own to every ladder, whatever the scope', () => {
    app.settings.setPresentationFor('normal', { textSize: 1.5, palette: 'gear' });
    expect(app.settings.presentation.textSize).toBe(1.5);
    expect(app.settings.ownKeys('normal')).toEqual(['palette']);
  });

  it('keeps a ladder’s own mixed creature colours to that ladder, and round-trips them', () => {
    const [a, b] = TIER_PRESETS.map((t) => t.palette);
    app.settings.setPresentation({ tierColors: CUSTOM_TIERS, customTierColors: a });
    app.settings.setPresentationFor('donut', { tierColors: CUSTOM_TIERS, customTierColors: b });
    // Every other ladder keeps palette A; giving DONUT up its own restores A there too.
    expect(app.settings.presentation.customTierColors).toEqual(a);
    expect(app.settings.presentationFor('cave').customTierColors).toEqual(a);
    expect(app.settings.tierColors('cave')).toEqual(a);
    expect(app.settings.tierColors('donut')).toEqual(b);
    expect(app.settings.ownKeys('donut').sort()).toEqual(['customTierColors', 'tierColors']);
    // The save carries the ladder's 'custom' choice with the palette that makes it readable.
    const loaded = Settings.load();
    expect(loaded.presentationFor('donut').tierColors).toBe(CUSTOM_TIERS);
    expect(loaded.tierColors('donut')).toEqual(b);
    expect(loaded.tierColors('cave')).toEqual(a);
    loaded.clearLadder('donut');
    expect(loaded.tierColors('donut')).toEqual(a);
  });

  it('gives a ladder’s own up, on request and on a reset', () => {
    app.settings.setPresentationFor('normal', { palette: 'star' });
    app.settings.clearLadder('normal');
    expect(app.settings.ownKeys('normal')).toEqual([]);
    app.settings.setPresentationFor('donut', { palette: 'star' });
    app.settings.resetPresentation();
    expect(app.settings.ownKeys('donut')).toEqual([]);
  });

  it('reads a ladder’s own custom choice saved without its palette against the shared one', () => {
    // A save from before the palette went with the choice holds the ladder's 'custom' alone; it
    // must still read as that choice, against the palette kept for every ladder, after a reload.
    const mine = {
      colors: [
        '#010203',
        '#040506',
        '#070809',
        '#0a0b0c',
        '#0d0e0f',
        '#101112',
        '#131415',
        '#161718',
        '#191a1b',
      ],
      halo: '#1c1d1e',
    };
    app.settings.setPresentation({ tierColors: CUSTOM_TIERS, customTierColors: mine });
    app.settings.setPresentationFor('donut', { tierColors: CUSTOM_TIERS });
    expect(app.settings.tierColors('donut')).toEqual(mine);
    const loaded = Settings.load();
    expect(loaded.ownKeys('donut')).toEqual(['tierColors']);
    expect(loaded.presentationFor('donut').tierColors).toBe(CUSTOM_TIERS);
    expect(loaded.tierColors('donut')).toEqual(mine);
    loaded.setPresentation({ tierColors: DEFAULT });
    expect(loaded.tierColors('easy')).toBe(DEFAULT_TIERS);
  });

  it('carries a ladder’s own through the save, keeping only what the save held', () => {
    app.settings.setPresentationFor('normal', { palette: 'star' });
    const loaded = Settings.load();
    expect(loaded.ownKeys('normal')).toEqual(['palette']);
    expect(loaded.presentationFor('normal').palette).toBe('star');
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        presentation: {},
        ladders: { hive: { font: 'anton', textSize: 2, glyph: 'x' }, easy: 'no', donut: {} },
      }),
    );
    const read = Settings.load();
    // A value the reader cannot read is the default, as it is for every ladder; a setting no
    // ladder can own is dropped.
    expect(read.ownKeys('hive').sort()).toEqual(['font', 'glyph']);
    expect(read.presentationFor('hive').glyph).toBe('pips');
    expect(read.ownKeys('easy')).toEqual([]);
    expect(read.ownKeys('donut')).toEqual([]);
  });
});

describe('the screen', () => {
  it('picks for the ladder alone in its scope, and for every ladder otherwise', () => {
    openSettings('normal', true);
    expect(document.querySelector('.settings-scope-note')!.textContent).toContain('NORMAL alone');
    tiles(settingsRow('Board palette'))[1]!.click();
    [...document.querySelectorAll<HTMLButtonElement>('.picker .preview-chip')]
      .find((b) => b.textContent === 'STAR')!
      .click();
    expect(app.settings.ownKeys('normal')).toEqual(['palette']);
    expect(app.settings.presentation.palette).toBe(DEFAULT);
    expect(document.querySelector('.settings-scope-note')!.textContent).toContain('palette');

    openSettings('normal', false);
    tiles(settingsRow('Board palette'))[1]!.click();
    [...document.querySelectorAll<HTMLButtonElement>('.picker .preview-chip')]
      .find((b) => b.textContent === 'GEAR')!
      .click();
    expect(app.settings.presentation.palette).toBe('gear');
    expect(app.settings.presentationFor('normal').palette).toBe('star');
    expect(app.settings.presentationFor('easy').palette).toBe('gear');
  });

  it('shows only what a ladder can own in its scope, and gives the ladder’s own up on request', () => {
    app.settings.setPresentationFor('normal', { palette: 'star' });
    openSettings('normal', true);
    const names = [...document.querySelectorAll('.settings-name')].map((n) => n.textContent);
    expect(names).toContain('Board palette');
    expect(names).not.toContain('Text size');
    expect(names).not.toContain('Player HP');
    expect(document.body.textContent).toContain('are for every ladder');
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Give NORMAL the settings for every ladder')!
      .click();
    expect(app.settings.ownKeys('normal')).toEqual([]);
    openSettings('normal', false);
    expect([...document.querySelectorAll('.settings-name')].map((n) => n.textContent)).toContain(
      'Text size',
    );
  });

  it('draws the board on the ladder in its own settings', () => {
    app.settings.setPresentationFor('normal', { palette: 'star', glyph: 'digit' });
    app.play('normal', 1, 7);
    expect(app.view!.display.glyph).toBe('digit');
    app.play('easy', 1, 7);
    expect(app.view!.display.glyph).toBe('pips');
  });
});
