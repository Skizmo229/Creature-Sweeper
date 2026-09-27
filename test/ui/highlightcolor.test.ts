// @vitest-environment happy-dom
/**
 * The cursor highlight's colour: saved like any presentation setting, drawn by the board wherever
 * a click would land while a click that would not stays red, chosen on the settings screen from
 * the game type's green, the presets or a custom colour mixed in its window, and the presets kept
 * clear of that red (decision 0050).
 */

import './setup.js';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { type BoardDisplay, BoardView } from '../../src/ui/board/view.js';
import { colorDifference } from '../../src/ui/colorspace.js';
import { themeFor } from '../../src/ui/looks.js';
import { HIGHLIGHT_PIN, highlightSampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { DEFAULT, HIGHLIGHT_COLORS, OFF, Settings, readHexColor } from '../../src/ui/settings.js';
import { NEAR_REFUSAL } from '../../src/ui/settingsscreen/customcolor.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import { FONTS } from '../../src/ui/typefaces.js';
import { MARK_COLOR, OUT_OF_REACH_COLOR } from '../../src/ui/theme.js';
import { DEFAULT_TIERS } from '../../src/ui/tiercolors.js';

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

/** A saved presentation, as a save file holds it. */
const saved = (presentation: Record<string, unknown>): void =>
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, presentation, gameplay: {} }));

describe('the highlight colour setting', () => {
  it('is saved, and resolves to the green of a mark until one is chosen', () => {
    expect(app.settings.presentation.highlightColor).toBe(DEFAULT);
    expect(app.settings.highlightColor('normal')).toBe(MARK_COLOR);
    app.settings.setPresentation({ highlightColor: '#2ee6ff' });
    expect(Settings.load().presentation.highlightColor).toBe('#2ee6ff');
    expect(Settings.load().highlightColor('normal')).toBe('#2ee6ff');
    app.settings.resetPresentation();
    expect(Settings.load().presentation.highlightColor).toBe(DEFAULT);
  });

  it('reads a save from before it, or one holding anything but a colour, as the default', () => {
    saved({});
    expect(Settings.load().presentation.highlightColor).toBe(DEFAULT);
    for (const junk of ['banana', 42, 'rgb(1, 2, 3)', '#12345', '#ggg000', null]) {
      saved({ highlightColor: junk });
      expect(Settings.load().presentation.highlightColor, String(junk)).toBe(DEFAULT);
    }
    saved({ highlightColor: '#ABCDEF' });
    expect(Settings.load().presentation.highlightColor).toBe('#abcdef');
  });

  it('reads hex as a person writes it', () => {
    expect(readHexColor('#1E90FF')).toBe('#1e90ff');
    expect(readHexColor('1e90ff')).toBe('#1e90ff');
    expect(readHexColor(' #1e90ff ')).toBe('#1e90ff');
    expect(readHexColor('#2ef')).toBe('#22eeff');
    expect(readHexColor('#1e90f')).toBeNull();
    expect(readHexColor('default')).toBeNull();
    expect(readHexColor(undefined)).toBeNull();
  });
});

/** Every `stroke()` drawn on a canvas made while this runs, as the stroke colour it used. */
function recordStrokes(): { strokes: string[]; stop: () => void } {
  const strokes: string[] = [];
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    let strokeStyle = '';
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'strokeStyle') return strokeStyle;
        if (prop === 'stroke') return () => strokes.push(strokeStyle);
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'strokeStyle') strokeStyle = String(value);
        return prop === 'strokeStyle' || Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { strokes, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

describe('the board', () => {
  let recording: ReturnType<typeof recordStrokes>;
  beforeEach(() => {
    recording = recordStrokes();
  });
  afterEach(() => recording.stop());

  const display = (highlightColor: string): BoardDisplay => ({
    maxCell: 48,
    font: FONTS['jetbrains-mono'],
    highlight: 'neighbours',
    highlightColor,
    strikeDefeated: true,
    tierColors: DEFAULT_TIERS,
  });
  // The example's lit cell is interior on the square grid: itself and its eight neighbours.
  const RING = 9;
  const strokedIn = (color: string): number => recording.strokes.filter((s) => s === color).length;

  it('lights the cell under the cursor and its ring in the colour chosen', () => {
    renderPreview(highlightSampleBoard('square'), themeFor('normal'), display(MARK_COLOR), {
      cell: 26,
      pin: HIGHLIGHT_PIN,
    });
    expect(strokedIn(MARK_COLOR)).toBe(RING);
    recording.strokes.length = 0;
    renderPreview(highlightSampleBoard('square'), themeFor('normal'), display('#2ee6ff'), {
      cell: 26,
      pin: HIGHLIGHT_PIN,
    });
    expect(strokedIn('#2ee6ff')).toBe(RING);
    expect(strokedIn(MARK_COLOR)).toBe(0);
  });

  it('keeps the red for a click that would not land, whatever the colour', () => {
    const view = new BoardView(
      document.createElement('canvas'),
      {
        onOpen: () => undefined,
        onCycleMark: () => undefined,
        onHover: () => undefined,
        lands: () => false,
      },
      { interactive: false, fixedCell: 26 },
    );
    view.setGame(highlightSampleBoard('square'), themeFor('normal'), display('#2ee6ff'));
    view.pinHover(HIGHLIGHT_PIN.x, HIGHLIGHT_PIN.y);
    expect(strokedIn(OUT_OF_REACH_COLOR)).toBe(RING);
    expect(strokedIn('#2ee6ff')).toBe(0);
  });

  it('is what a board in play is drawn with, and follows a change made during it', () => {
    app.play('normal', 1);
    expect(app.view!.display.highlightColor).toBe(MARK_COLOR);
    app.settings.setPresentation({ highlightColor: '#ff4dff' });
    expect(app.view!.display.highlightColor).toBe('#ff4dff');
  });
});

describe('the presets', () => {
  it('are colours, each its own and none the default', () => {
    const colors = HIGHLIGHT_COLORS.map((c) => c.color);
    for (const c of colors) expect(readHexColor(c), c).toBe(c);
    expect(new Set([...colors, MARK_COLOR]).size).toBe(colors.length + 1);
  });

  it('stay clear of the red of a click that would do nothing', () => {
    for (const { name, color } of HIGHLIGHT_COLORS) {
      expect(colorDifference(color, OUT_OF_REACH_COLOR), name).toBeGreaterThanOrEqual(NEAR_REFUSAL);
    }
    expect(colorDifference(MARK_COLOR, OUT_OF_REACH_COLOR)).toBeGreaterThanOrEqual(NEAR_REFUSAL);
  });

  it('are measured against a threshold that parts the reds from their neighbours', () => {
    expect(colorDifference('#000000', '#ffffff')).toBeCloseTo(100, 1);
    expect(colorDifference('#1e90ff', '#1e90ff')).toBe(0);
    // Pure red, a light red and a red-orange fall inside it; orange and hot pink do not.
    for (const red of ['#ff0000', '#ffa0a0', '#ff7f2a']) {
      expect(colorDifference(red, OUT_OF_REACH_COLOR), red).toBeLessThan(NEAR_REFUSAL);
    }
    for (const near of ['#ff9d3a', '#ff3399']) {
      expect(colorDifference(near, OUT_OF_REACH_COLOR), near).toBeGreaterThan(NEAR_REFUSAL);
    }
  });
});

/** The settings row for the highlight's colour, on a freshly built screen. */
function colorRow(): HTMLElement {
  app.showSettings(() => app.showTypes());
  return [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
    (r) => r.querySelector('.settings-name')?.textContent === 'Cursor highlight colour',
  )!;
}

const tiles = (row: HTMLElement): HTMLButtonElement[] => [
  ...row.querySelectorAll<HTMLButtonElement>('.preview-chip'),
];
const label = (tile: Element): string => tile.querySelector('.chip-label')!.textContent!;
const lit = (row: HTMLElement): string[] =>
  tiles(row)
    .filter((t) => t.classList.contains('active'))
    .map(label);

describe('the settings row', () => {
  it('offers the game type green, the presets and a custom colour, each drawn on a board', () => {
    const row = colorRow();
    expect(tiles(row).map(label)).toEqual([
      'Game type default — green',
      ...HIGHLIGHT_COLORS.map((c) => c.name),
      'Custom — any colour',
    ]);
    expect(lit(row)).toEqual(['Game type default — green']);
    // Every tile but the custom one, which has nothing to draw until a colour is mixed.
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(HIGHLIGHT_COLORS.length + 1);
  });

  it('saves a preset when it is picked', () => {
    const cyan = HIGHLIGHT_COLORS.find((c) => c.name === 'Cyan')!;
    tiles(colorRow())
      .find((t) => label(t) === 'Cyan')!
      .click();
    expect(Settings.load().presentation.highlightColor).toBe(cyan.color);
    expect(lit(colorRow())).toEqual(['Cyan']);
  });

  it('still shows the colours while the highlight is off, and says it is off', () => {
    app.settings.setPresentation({ highlight: OFF });
    const row = colorRow();
    expect(row.querySelector('.settings-hint')!.textContent).toContain('The highlight is off');
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(HIGHLIGHT_COLORS.length + 1);
  });
});

/** The custom colour's window, opened from its tile. */
function openWindow(): HTMLElement {
  const custom = tiles(colorRow()).at(-1)!;
  custom.click();
  return document.querySelector<HTMLElement>('.color-card')!;
}

const channel = (card: HTMLElement, name: string, kind: 'range' | 'number'): HTMLInputElement =>
  card.querySelector<HTMLInputElement>(`input.color-${kind}[aria-label^="${name}"]`)!;
const hexField = (card: HTMLElement): HTMLInputElement =>
  card.querySelector<HTMLInputElement>('input.color-hex')!;
const set = (input: HTMLInputElement, value: string, event = 'input'): void => {
  input.value = value;
  input.dispatchEvent(new Event(event, { bubbles: true }));
};
const warned = (card: HTMLElement): boolean =>
  !card.querySelector<HTMLElement>('.color-warn')!.hidden;

describe('the custom colour window', () => {
  it('opens on the colour in force, with the example board drawn in it', () => {
    app.settings.setPresentation({ highlightColor: '#2ee6ff' });
    const card = openWindow();
    expect(card).not.toBeNull();
    expect(hexField(card).value).toBe('#2ee6ff');
    expect(['Red', 'Green', 'Blue'].map((n) => channel(card, n, 'range').value)).toEqual([
      '46',
      '230',
      '255',
    ]);
    expect(card.querySelector('.color-example canvas')).not.toBeNull();
    expect(document.activeElement).toBe(channel(card, 'Red', 'range'));
  });

  it('keeps the sliders, the numbers and the hex saying the same colour', () => {
    const card = openWindow();
    expect(hexField(card).value).toBe(MARK_COLOR);

    set(channel(card, 'Red', 'range'), '30');
    expect(channel(card, 'Red', 'number').value).toBe('30');
    expect(hexField(card).value).toBe('#1ee06a');

    set(hexField(card), '#1e90ff');
    expect(['Red', 'Green', 'Blue'].map((n) => channel(card, n, 'range').value)).toEqual([
      '30',
      '144',
      '255',
    ]);
    expect(channel(card, 'Green', 'number').value).toBe('144');

    // A number past the channel's end is held to it, and written back so once the field is left.
    set(channel(card, 'Green', 'number'), '300');
    expect(hexField(card).value).toBe('#1effff');
    expect(channel(card, 'Green', 'number').value).toBe('300');
    set(channel(card, 'Green', 'number'), '300', 'change');
    expect(channel(card, 'Green', 'number').value).toBe('255');

    // Hex half typed changes nothing until it is a colour.
    set(hexField(card), '#ff00');
    expect(channel(card, 'Red', 'range').value).toBe('30');
  });

  it('says so when the colour comes close to the red of a click that would do nothing', () => {
    const card = openWindow();
    expect(warned(card)).toBe(false);
    set(hexField(card), '#ff0000');
    expect(warned(card)).toBe(true);
    set(hexField(card), '#ff4dff');
    expect(warned(card)).toBe(false);
  });

  it('saves the colour on "Use this colour", and the custom tile wears it', () => {
    const card = openWindow();
    set(hexField(card), '#1e90ff');
    card.querySelector<HTMLButtonElement>('button.color-use')!.click();
    expect(document.querySelector('.color-card')).toBeNull();
    expect(Settings.load().presentation.highlightColor).toBe('#1e90ff');
    const row = colorRow();
    expect(lit(row)).toEqual(['Custom — #1e90ff']);
    expect(tiles(row).at(-1)!.querySelector('canvas')).not.toBeNull();
  });

  it('saves a colour mixed to match a preset as that preset', () => {
    const card = openWindow();
    set(hexField(card), '#FFFFFF');
    card.querySelector<HTMLButtonElement>('button.color-use')!.click();
    expect(lit(colorRow())).toEqual(['White']);
  });

  it('sizes its fields by what they hold, with the padding and spin buttons left out of `ch`', () => {
    // The widest each field shows, in `ch` of its face: three digits, and a hex colour typed in
    // capitals, in Gluten, the widest of the bundled faces (measured in Chrome, 27 Sep 2026).
    // Counting the padding and the spin buttons in `ch` too clipped "255" in the narrow faces.
    const NUMBER_CH = 3.3;
    const HEX_CH = 10.4;
    const rules = [
      ...readFileSync('src/ui/styles.css', 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+){([^}]*)}/g),
    ];
    const body = (selector: string): string =>
      rules.find(([, s]) => s!.trim() === selector)?.[2] ?? '';
    const number = body('input.color-number');
    const hex = body('input.color-hex');
    for (const rule of [number, hex]) expect(rule).toMatch(/box-sizing:\s*content-box/);
    const numberCh = /width:\s*calc\(([\d.]+)ch \+ var\(--spin-buttons\)\)/.exec(number);
    expect(Number(numberCh?.[1])).toBeGreaterThanOrEqual(NUMBER_CH);
    expect(number).toMatch(/--spin-buttons:\s*\d+px/);
    expect(Number(/width:\s*([\d.]+)ch/.exec(hex)?.[1])).toBeGreaterThanOrEqual(HEX_CH);
  });

  it('closes on Escape without saving', () => {
    const card = openWindow();
    set(channel(card, 'Blue', 'range'), '0');
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.querySelector('.color-card')).toBeNull();
    expect(Settings.load().presentation.highlightColor).toBe(DEFAULT);
  });
});
