// @vitest-environment happy-dom
/**
 * The long pickers' orders (decision 0052): each shows every option exactly once, a sort moves
 * the tiles already drawn, a tile picked in any order picks its own option, and each window
 * reopens in the order it last showed.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { LOOK_IDS } from '../../src/ui/looks.js';
import type { Settings } from '../../src/ui/settings.js';
import { paletteSorts } from '../../src/ui/settingsscreen/sorts.js';
import type { PickerSort } from '../../src/ui/settingsscreen/widgets.js';

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

/** Settings, and the window behind a row's "User choice" tile. */
const openWindow = (row: string): HTMLElement => {
  app.showSettings(() => app.showTypes());
  const line = [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
    (r) => r.querySelector('.settings-name')?.textContent === row,
  )!;
  line.querySelectorAll<HTMLButtonElement>('.preview-chip')[1]!.click();
  return document.querySelector<HTMLElement>('.picker-card')!;
};

const sortBy = (window_: HTMLElement, label: string): void =>
  [...window_.querySelectorAll<HTMLButtonElement>('.picker-sort')]
    .find((b) => b.textContent === label)!
    .click();

const pressed = (window_: HTMLElement): string | null | undefined =>
  window_.querySelector('.picker-sort[aria-pressed="true"]')?.textContent;

const captions = (window_: HTMLElement): (string | null)[] =>
  [...window_.querySelectorAll('.chip-label')].map((c) => c.textContent);

const headings = (window_: HTMLElement): (string | null)[] =>
  [...window_.querySelectorAll('.picker-group-head')].map((h) => h.textContent);

const everyValue = (sort: PickerSort): string[] => sort.groups.flatMap((g) => g.values);

describe('the palette window', () => {
  // First in the file: a window reopens in the order it last showed, which outlives a test.
  it('opens by ladder, under the ladder list’s own column heads and in its order', () => {
    const window_ = openWindow('Board palette');
    expect(pressed(window_)).toBe('Ladder');
    expect(headings(window_)).toEqual(['Normal', 'Shape', 'Magic', 'Special']);
    expect(captions(window_).slice(0, 3)).toEqual(['EASY', 'NORMAL', 'HUGE']);
    expect(captions(window_).at(-1)).toBe('SPRINKLE DONUT');
  });

  it('offers orders that each show every palette exactly once', () => {
    const sorts = paletteSorts();
    expect(sorts.map((s) => s.label)).toEqual(['Ladder', 'Name', 'Colour']);
    for (const sort of sorts) {
      expect([...everyValue(sort)].sort(), sort.label).toEqual([...LOOK_IDS].sort());
    }
  });

  it('sorts by name', () => {
    const window_ = openWindow('Board palette');
    sortBy(window_, 'Name');
    const names = captions(window_);
    expect(names[0]).toBe('ARCANE');
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!)));
    expect(headings(window_)).toEqual([]);
  });

  it('sorts round the colour wheel by the covered tile, the greys last and lightest first', () => {
    const window_ = openWindow('Board palette');
    sortBy(window_, 'Colour');
    const names = captions(window_);
    expect(names[0]).toBe('VALENTINES');
    expect(names.indexOf('CARD')).toBeLessThan(names.indexOf('EASY'));
    expect(names.indexOf('EASY')).toBeLessThan(names.indexOf('HUGE'));
    expect(names.indexOf('HUGE')).toBeLessThan(names.indexOf('WRAPAROUND'));
    expect(names.indexOf('WRAPAROUND')).toBeLessThan(names.indexOf('DIAMOND'));
    expect(names.slice(-4)).toEqual(['SPRINKLE DONUT', 'BLIND', 'HUGE x BLIND', 'GEAR']);
  });

  it('moves the tiles it has drawn rather than drawing them again', () => {
    const window_ = openWindow('Board palette');
    sortBy(window_, 'Ladder');
    const before = new Set(window_.querySelectorAll('canvas'));
    expect(before.size).toBe(LOOK_IDS.length);
    sortBy(window_, 'Colour');
    const after = [...window_.querySelectorAll('canvas')];
    expect(after.every((c) => before.has(c))).toBe(true);
    expect(after).toHaveLength(before.size);
  });

  it('picks the palette a tile shows, in any order', () => {
    const window_ = openWindow('Board palette');
    sortBy(window_, 'Colour');
    [...window_.querySelectorAll<HTMLButtonElement>('.preview-chip')]
      .find((b) => b.textContent === 'CARD')!
      .click();
    expect(app.settings.presentation.palette).toBe('card');
    expect(document.querySelector('.picker-card')).toBeNull();
  });

  it('reopens in the order it last showed, lit on the palette in force', () => {
    sortBy(openWindow('Board palette'), 'Name');
    app.settings.setPresentation({ palette: 'star' });
    const window_ = openWindow('Board palette');
    expect(pressed(window_)).toBe('Name');
    expect(captions(window_)[0]).toBe('ARCANE');
    expect(window_.querySelector('.preview-chip.active')?.textContent).toBe('STAR');
    expect(document.activeElement?.textContent).toBe('STAR');
  });
});

describe('a picker with no orders', () => {
  it('shows its options as they come, with no row of sorts', () => {
    const window_ = openWindow('Creature icons');
    expect(window_.querySelector('.picker-sorts')).toBeNull();
    expect(headings(window_)).toEqual([]);
    expect(captions(window_).at(-1)).toBe('Custom — any symbol');
  });
});
