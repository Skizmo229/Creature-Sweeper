// @vitest-environment happy-dom
/**
 * The custom creature icon: the last tile of the icon picker opens a window of symbols, a symbol
 * picked there is saved as the icon and survives a reload, and Escape closes the window alone.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

interface Driver {
  showSettings(back: () => void): void;
  showTypes(): void;
  settings: Settings;
}

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

const iconsRow = (): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
    (r) => r.querySelector('.settings-name')?.textContent === 'Creature icons',
  )!;

/**
 * Settings, the icon picker behind the "User choice" tile, then its last tile, Custom, and one set's
 * tab: the window reopens on the set it last showed, which outlives a test.
 */
const openSymbols = (set = 'Dingbats'): HTMLElement => {
  app.showSettings(() => app.showTypes());
  iconsRow().querySelectorAll<HTMLButtonElement>('.preview-chip')[1]!.click();
  [...document.querySelectorAll<HTMLButtonElement>('.picker .preview-chip')].at(-1)!.click();
  const window_ = document.querySelector<HTMLElement>('.symbol-card')!;
  [...window_.querySelectorAll<HTMLButtonElement>('.symbol-tab')]
    .find((t) => t.textContent?.startsWith(`${set} (`))!
    .click();
  return window_;
};

const cell = (window_: HTMLElement, name: string): HTMLButtonElement =>
  [...window_.querySelectorAll<HTMLButtonElement>('.symbol-cell')].find(
    (b) => b.getAttribute('aria-label') === name,
  )!;

const press = (k: string): void => {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

describe('the custom creature icon', () => {
  it('opens from the icon picker, in place of it', () => {
    const window_ = openSymbols();
    expect(document.querySelectorAll('.overlay.picker')).toHaveLength(1);
    expect(window_.querySelectorAll('.symbol-tab')).toHaveLength(4);
    // Dingbats is a full block of sixteen by twelve.
    expect(window_.querySelectorAll('.symbol-cell')).toHaveLength(192);
  });

  it('lays each set out as its code chart', () => {
    const window_ = openSymbols('Wingdings');
    const chart = [...window_.querySelector('.symbol-chart')!.children];
    // Wingdings starts at 0x21, after the space it leaves blank.
    expect(chart[0]!.className).toBe('symbol-gap');
    expect(chart[1]!.getAttribute('aria-label')).toBe('Lower left pencil');
  });

  it('saves the symbol chosen, which the row then wears', () => {
    const window_ = openSymbols();
    const use = window_.querySelector<HTMLButtonElement>('.symbol-use')!;
    expect(use.disabled).toBe(true);
    cell(window_, 'Heavy black heart').click();
    expect(use.disabled).toBe(false);
    use.click();

    expect(app.settings.presentation.icons).toBe('U+2764');
    expect(app.settings.themeFor('normal').pip).toBe('U+2764');
    expect(document.querySelector('.symbol-card')).toBeNull();
    const labels = [...iconsRow().querySelectorAll('.chip-label')].map((l) => l.textContent);
    expect(labels[1]).toBe('User choice — Custom: Heavy black heart');
  });

  it('reopens on the symbol in use, lit in the picker', () => {
    app.settings.setPresentation({ icons: 'U+1F571' });
    app.showSettings(() => app.showTypes());
    iconsRow().querySelectorAll<HTMLButtonElement>('.preview-chip')[1]!.click();
    const custom = [...document.querySelectorAll<HTMLButtonElement>('.picker .preview-chip')].at(
      -1,
    )!;
    expect(custom.classList.contains('active')).toBe(true);
    custom.click();
    const window_ = document.querySelector<HTMLElement>('.symbol-card')!;
    expect(window_.querySelector('.symbol-tab.active')?.textContent).toBe('Wingdings (221)');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Black skull and crossbones');
  });

  it('moves through the chart with the arrow keys, over the gaps', () => {
    const window_ = openSymbols('Wingdings 2');
    // Wingdings 2 has nothing at 0x58, the symbol no open face draws: the arrow steps over it.
    cell(window_, 'Prohibited sign').focus();
    press('ArrowRight');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Heavy script ligature et ornament',
    );
    cell(openSymbols(), 'Heavy black heart').focus();
    press('ArrowRight');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Rotated heavy black heart bullet',
    );
    press('ArrowDown');
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Medium right curly bracket ornament',
    );
  });

  it('closes on Escape, leaving the settings screen up', () => {
    openSymbols();
    press('Escape');
    expect(document.querySelector('.overlay.picker')).toBeNull();
    expect(document.querySelector('.settings-group')).not.toBeNull();
    expect(app.settings.presentation.icons).toBe('default');
  });

  it('survives a reload', () => {
    app.settings.setPresentation({ icons: 'U+2B88' });
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).presentation.icons).toBe('U+2B88');
    expect(Settings.load().presentation.icons).toBe('U+2B88');
  });
});
