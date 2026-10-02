// @vitest-environment happy-dom
/**
 * The mark's colour: saved like any presentation setting, drawn by the board on every mark and,
 * dimmed, every pencil note, followed by the cursor highlight until that has a colour of its own,
 * chosen on the settings screen from the game's green, the presets or a custom colour mixed in
 * its window, and the presets kept clear of every colour the board already means something by.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { type BoardDisplay, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { colorDifference } from '../../src/ui/colorspace.js';
import { themeFor } from '../../src/ui/looks.js';
import { DEFAULT, MARK_COLORS } from '../../src/ui/presentation.js';
import { sampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { NEAR_TAKEN } from '../../src/ui/settingsscreen/customcolor.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import {
  AUGUR_COLOR,
  CENSUS_COLOR,
  GIVEN_COLOR,
  MARK_COLOR,
  REFUSAL_COLOR,
  TUTOR_COLOR,
  noteColor,
} from '../../src/ui/theme.js';

interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  showSettings(back: () => void): void;
  showTypes(): void;
  readonly settings: Settings;
  readonly view: { readonly display: BoardDisplay } | null;
}

let app: Driver;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  app = new App(document.getElementById('app')!) as unknown as Driver;
});

const TAKEN = [REFUSAL_COLOR, GIVEN_COLOR, CENSUS_COLOR, AUGUR_COLOR, TUTOR_COLOR];

describe('the mark colour setting', () => {
  it('is saved, resolves to the green until one is chosen, and the highlight follows it', () => {
    expect(app.settings.presentation.markColor).toBe(DEFAULT);
    expect(app.settings.markColor('normal')).toBe(MARK_COLOR);
    expect(app.settings.highlightColor('normal')).toBe(MARK_COLOR);
    app.settings.setPresentation({ markColor: '#3d6dff' });
    expect(Settings.load().presentation.markColor).toBe('#3d6dff');
    expect(Settings.load().markColor('normal')).toBe('#3d6dff');
    expect(Settings.load().highlightColor('normal')).toBe('#3d6dff');
    // A highlight colour of its own stays its own.
    app.settings.setPresentation({ highlightColor: '#ffffff' });
    expect(app.settings.highlightColor('normal')).toBe('#ffffff');
  });

  it('reads a save from before it, or one holding anything but a colour, as the default', () => {
    for (const junk of [undefined, 'banana', 42, '#12345']) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation: { markColor: junk }, gameplay: {} }),
      );
      expect(Settings.load().presentation.markColor, String(junk)).toBe(DEFAULT);
    }
  });

  it('dims the same colour for a pencil note', () => {
    expect(noteColor('#35e06a')).toBe('rgba(53, 224, 106, 0.72)');
    expect(noteColor('#3d6dff')).toBe('rgba(61, 109, 255, 0.72)');
  });
});

describe('the presets', () => {
  it('stay clear of every colour the board already means something by, as the green does', () => {
    for (const { name, color } of [...MARK_COLORS, { name: 'green', color: MARK_COLOR }]) {
      for (const taken of TAKEN) {
        expect(colorDifference(color, taken), `${name} against ${taken}`).toBeGreaterThanOrEqual(
          NEAR_TAKEN,
        );
      }
    }
  });
});

/** Every text filled on a canvas made while this runs, with the colour it was filled in. */
function recordText(): { texts: { text: string; color: string }[]; stop: () => void } {
  const texts: { text: string; color: string }[] = [];
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    let fillStyle = '';
    const saved: string[] = [];
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'fillStyle') return fillStyle;
        if (prop === 'save') return () => saved.push(fillStyle);
        if (prop === 'restore') {
          return () => {
            fillStyle = saved.pop() ?? fillStyle;
          };
        }
        if (prop === 'fillText') return (text: string) => texts.push({ text, color: fillStyle });
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'fillStyle') fillStyle = String(value);
        return prop === 'fillStyle' || Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { texts, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

describe('the board', () => {
  let recording: ReturnType<typeof recordText>;
  beforeEach(() => {
    recording = recordText();
  });
  afterEach(() => recording.stop());

  it('writes the mark in the colour chosen', () => {
    // The standard example carries one mark, a 3.
    const mark = sampleBoard()
      .grid.flat()
      .find((c) => c.present && !c.open && c.mark > 0)!;
    for (const color of [MARK_COLOR, '#3d6dff']) {
      recording.texts.length = 0;
      renderPreview(
        sampleBoard(),
        themeFor('normal'),
        { ...DEFAULT_DISPLAY, highlight: null, markColor: color },
        { cell: 26 },
      );
      expect(recording.texts).toContainEqual({ text: String(mark.mark), color });
    }
  });

  it('is what a board in play is drawn with, and follows a change made during it', () => {
    app.play('normal', 1);
    expect(app.view!.display.markColor).toBe(MARK_COLOR);
    app.settings.setPresentation({ markColor: '#b6ff3a' });
    expect(app.view!.display.markColor).toBe('#b6ff3a');
    expect(app.view!.display.highlightColor).toBe('#b6ff3a');
  });
});

/** The settings row for the mark's colour, on a freshly built screen. */
function colorRow(): HTMLElement {
  app.showSettings(() => app.showTypes());
  return [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
    (r) => r.querySelector('.settings-name')?.textContent === 'Mark colour',
  )!;
}

const tiles = (row: HTMLElement): HTMLButtonElement[] => [
  ...row.querySelectorAll<HTMLButtonElement>('.preview-chip'),
];
const label = (tile: Element): string => tile.querySelector('.chip-label')!.textContent!;

describe('the settings row', () => {
  it('offers the green, the presets and a custom colour, each drawn on a board', () => {
    const row = colorRow();
    expect(tiles(row).map(label)).toEqual([
      'Game type default — green',
      ...MARK_COLORS.map((c) => c.name),
      'Custom — any colour',
    ]);
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(MARK_COLORS.length + 1);
  });

  it('saves a preset when it is picked, and the highlight row says it follows', () => {
    tiles(colorRow())
      .find((t) => label(t) === 'Lime')!
      .click();
    expect(Settings.load().presentation.markColor).toBe('#b6ff3a');
    const highlight = [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Cursor highlight colour',
    )!;
    expect(label(tiles(highlight)[0]!)).toBe('Game type default — the mark colour');
  });

  it('opens a window that warns near a taken colour, and saves on "Use this colour"', () => {
    tiles(colorRow()).at(-1)!.click();
    const card = document.querySelector<HTMLElement>('.color-card')!;
    expect(card.querySelector('h2')!.textContent).toBe('Custom mark colour');
    const hex = card.querySelector<HTMLInputElement>('input.color-hex')!;
    expect(hex.value).toBe(MARK_COLOR);
    const warn = card.querySelector<HTMLElement>('.color-warn')!;
    expect(warn.hidden).toBe(true);
    hex.value = GIVEN_COLOR;
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    expect(warn.hidden).toBe(false);
    expect(warn.textContent).toBe('Close to the gold of a given.');
    hex.value = '#3d6dff';
    hex.dispatchEvent(new Event('input', { bubbles: true }));
    expect(warn.hidden).toBe(true);
    card.querySelector<HTMLButtonElement>('button.color-use')!.click();
    expect(Settings.load().presentation.markColor).toBe('#3d6dff');
  });
});
