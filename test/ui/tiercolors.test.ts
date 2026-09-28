// @vitest-environment happy-dom
/**
 * The creature colours: saved like any presentation setting, drawn wherever a tier is (the board,
 * the level number, the LV buttons), chosen on the settings screen from the game's own, the
 * presets or a palette of the player's own mixed in its window, and the presets held to what they
 * were chosen for (decision 0053).
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { BEATEN_ALPHA } from '../../src/ui/board/paint.js';
import type { BoardDisplay } from '../../src/ui/board/view.js';
import { type Rgb, colorDifference, hexOf, rgbOf } from '../../src/ui/colorspace.js';
import { LOOK_IDS, themeFor } from '../../src/ui/looks.js';
import { tierSampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { CUSTOM_TIERS, DEFAULT } from '../../src/ui/presentation.js';
import { Settings } from '../../src/ui/settings.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import {
  DEFAULT_TIERS,
  TIER_COUNT,
  TIER_PRESETS,
  type TierPalette,
  tierGilded,
} from '../../src/ui/tiercolors.js';
import { FONTS } from '../../src/ui/typefaces.js';

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

const preset = (id: string): TierPalette => TIER_PRESETS.find((t) => t.id === id)!.palette;

/** Nine colours no ladder paints, so a stroke or fill in one of them can only be a tier's. */
const MARKED: TierPalette = {
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

describe('the creature colours setting', () => {
  it('is saved, and resolves to the game’s own colours until one is chosen', () => {
    expect(app.settings.presentation.tierColors).toBe(DEFAULT);
    expect(app.settings.tierColors('normal')).toBe(DEFAULT_TIERS);
    app.settings.setPresentation({ tierColors: 'distinct' });
    expect(Settings.load().tierColors('normal')).toEqual(preset('distinct'));
    app.settings.setPresentation({ tierColors: CUSTOM_TIERS, customTierColors: MARKED });
    expect(Settings.load().tierColors('normal')).toEqual(MARKED);
    app.settings.resetPresentation();
    expect(Settings.load().presentation.tierColors).toBe(DEFAULT);
    expect(Settings.load().presentation.customTierColors).toBeNull();
  });

  it('is the same on every ladder', () => {
    app.settings.setPresentation({ tierColors: 'nine' });
    for (const id of LOOK_IDS) expect(app.settings.tierColors(id), id).toEqual(preset('nine'));
  });

  it('reads a save from before it, or one naming its own colours without them, as the default', () => {
    saved({});
    expect(Settings.load().presentation.tierColors).toBe(DEFAULT);
    expect(Settings.load().presentation.customTierColors).toBeNull();
    saved({ tierColors: CUSTOM_TIERS });
    expect(Settings.load().presentation.tierColors).toBe(DEFAULT);
    // A preset from a later build is kept, as an unknown icon is, and drawn as the default.
    saved({ tierColors: 'sunset' });
    expect(Settings.load().presentation.tierColors).toBe('sunset');
    expect(Settings.load().tierColors('normal')).toBe(DEFAULT_TIERS);
  });

  it('keeps a palette of the player’s own only when every tier and the halo is a colour', () => {
    const colors = [...MARKED.colors];
    for (const junk of [
      'banana',
      null,
      { colors: colors.slice(1), halo: MARKED.halo },
      { colors: [...colors.slice(1), 'banana'], halo: MARKED.halo },
      { colors, halo: 'gold' },
      { colors },
    ]) {
      saved({ tierColors: CUSTOM_TIERS, customTierColors: junk });
      expect(Settings.load().presentation.customTierColors, JSON.stringify(junk)).toBeNull();
      expect(Settings.load().presentation.tierColors).toBe(DEFAULT);
    }
    saved({
      tierColors: CUSTOM_TIERS,
      customTierColors: { colors: colors.map((c) => c.toUpperCase()), halo: '#FC3' },
    });
    expect(Settings.load().presentation.customTierColors).toEqual({ colors, halo: '#ffcc33' });
    expect(Settings.load().presentation.tierColors).toBe(CUSTOM_TIERS);
  });
});

/**
 * A colour as a person with a dichromacy sees it: Machado, Oliveira and Fernandes (2009) at full
 * severity, in linear RGB, the model the highlight colours were measured with (decision 0050).
 */
const VISIONS: Record<string, readonly (readonly number[])[] | null> = {
  normal: null,
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const encoded = (l: number): number => {
  const c = Math.min(1, Math.max(0, l));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};

function seenWith(vision: string, color: string): string {
  const m = VISIONS[vision];
  if (!m) return color;
  const lin = rgbOf(color).map(linear);
  return hexOf(
    m.map((row) => encoded(row[0]! * lin[0]! + row[1]! * lin[1]! + row[2]! * lin[2]!)) as Rgb,
  );
}

/** The closest two of these colours come, as a person with this vision sees them. */
function closest(vision: string, pairs: readonly (readonly [string, string])[]): number {
  return Math.min(
    ...pairs.map(([a, b]) => colorDifference(seenWith(vision, a), seenWith(vision, b))),
  );
}

/** Every pair of tiers the halo does not already tell apart: both under it, or neither. */
function unhaloedPairs(palette: TierPalette): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 1; i <= TIER_COUNT; i++) {
    for (let j = i + 1; j <= TIER_COUNT; j++) {
      if (tierGilded(i) === tierGilded(j))
        pairs.push([palette.colors[i - 1]!, palette.colors[j - 1]!]);
    }
  }
  return pairs;
}

/** Relative luminance, and the contrast ratio of two colours, as WCAG defines them. */
const luminance = (color: string): number => {
  const [r, g, b] = rgbOf(color).map(linear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** The least contrast any tier's beaten glyph has with any ladder's floor, dimmed as the board draws it. */
function faintest(palette: TierPalette): number {
  const dimmed = (color: string, floor: string): string => {
    const [c, f] = [rgbOf(color), rgbOf(floor)];
    return hexOf(c.map((v, i) => Math.round(BEATEN_ALPHA * v + (1 - BEATEN_ALPHA) * f[i]!)) as Rgb);
  };
  const floors = LOOK_IDS.map((id) => themeFor(id).floor);
  return Math.min(...palette.colors.flatMap((c) => floors.map((f) => contrast(dimmed(c, f), f))));
}

/**
 * How far apart the presets keep what they promise to, under every vision measured (27 Sep 2026:
 * Distinct's closest pair is 38, under deuteranopia and tritanopia; the game's own palette's is 12,
 * sky and green under tritanopia).
 */
const APART = 35;

describe('the presets', () => {
  it('are nine colours and a halo each, every one its own and none the game’s own', () => {
    const ids = TIER_PRESETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { id, palette } of TIER_PRESETS) {
      expect(palette.colors, id).toHaveLength(TIER_COUNT);
      for (const c of [...palette.colors, palette.halo]) expect(c, id).toMatch(/^#[0-9a-f]{6}$/);
      expect(palette, id).not.toEqual(DEFAULT_TIERS);
    }
  });

  it('are no harder to see on any ladder’s floor than the game’s own colours', () => {
    for (const { id, palette } of TIER_PRESETS) {
      expect(faintest(palette), id).toBeGreaterThanOrEqual(faintest(DEFAULT_TIERS));
    }
  });

  it('keep Distinct apart under every colour vision, and further apart than the game’s own', () => {
    const distinct = unhaloedPairs(preset('distinct'));
    const own = unhaloedPairs(DEFAULT_TIERS);
    for (const vision of Object.keys(VISIONS)) {
      expect(closest(vision, distinct), vision).toBeGreaterThanOrEqual(APART);
      expect(closest(vision, distinct), vision).toBeGreaterThan(closest(vision, own));
    }
  });

  it('give Nine colours no two tiers alike, nor any tier the halo’s colour', () => {
    const nine = preset('nine');
    const all: [string, string][] = [];
    for (let i = 0; i < TIER_COUNT; i++) {
      for (let j = i + 1; j < TIER_COUNT; j++) all.push([nine.colors[i]!, nine.colors[j]!]);
    }
    expect(closest('normal', all)).toBeGreaterThanOrEqual(APART);
    const haloed = nine.colors.slice(5).map((c): [string, string] => [c, nine.halo]);
    for (const vision of Object.keys(VISIONS)) {
      expect(closest(vision, unhaloedPairs(nine)), vision).toBeGreaterThanOrEqual(APART);
      expect(closest(vision, haloed), vision).toBeGreaterThanOrEqual(APART);
    }
  });

  it('leave Plain one colour, so the count alone tells a tier', () => {
    expect(new Set(preset('plain').colors).size).toBe(1);
  });
});

/** Every fill and stroke drawn on a canvas made while this runs, as the colour it used. */
function recordPaint(): { fills: string[]; strokes: string[]; stop: () => void } {
  const fills: string[] = [];
  const strokes: string[] = [];
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    const style = { fillStyle: '', strokeStyle: '' };
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'fillStyle' || prop === 'strokeStyle') return style[prop];
        if (prop === 'fill') return () => fills.push(style.fillStyle);
        if (prop === 'stroke') return () => strokes.push(style.strokeStyle);
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'fillStyle' || prop === 'strokeStyle') style[prop] = String(value);
        return prop === 'fillStyle' || prop === 'strokeStyle' || Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { fills, strokes, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

/** A colour as the DOM hands it back, which may be `rgb(…)`, as `#rrggbb`. */
function hexFrom(css: string): string {
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(css);
  return rgb ? hexOf([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]) : css;
}

describe('what is drawn in them', () => {
  let recording: ReturnType<typeof recordPaint>;
  beforeEach(() => {
    recording = recordPaint();
  });
  afterEach(() => recording.stop());

  it('draws each tier’s creatures in its colour, and the halo round tiers 6 to 9', () => {
    const display: BoardDisplay = {
      maxCell: 48,
      font: FONTS['jetbrains-mono'],
      highlight: null,
      highlightColor: '#ffffff',
      beatenLook: 'dim',
      beatenNumbers: false,
      tierColors: MARKED,
    };
    renderPreview(tierSampleBoard(), themeFor('normal'), display, { cell: 26 });
    // NORMAL's pips are filled squares, a tier's count of them.
    MARKED.colors.forEach((color, i) => {
      expect(
        recording.fills.filter((f) => f === color),
        `tier ${i + 1}`,
      ).toHaveLength([1, 2, 3, 4, 5, 6, 7, 8, 9][i]);
    });
    expect(recording.strokes.filter((s) => s === MARKED.halo)).toHaveLength(6 + 7 + 8 + 9);
  });

  it('is what a board in play, its level number and its LV buttons wear, following a change', () => {
    app.settings.setPresentation({ tierColors: CUSTOM_TIERS, customTierColors: MARKED });
    app.play('huge', 1);
    expect(app.view!.display.tierColors).toEqual(MARKED);
    const level = document.querySelector<HTMLElement>('.hud-level-num')!;
    expect(hexFrom(level.style.color)).toBe(MARKED.colors[0]);
    const buttons = [...document.querySelectorAll<HTMLElement>('.counter[data-tier]')];
    expect(buttons.map((b) => b.style.getPropertyValue('--tier'))).toEqual(MARKED.colors);
    for (const b of buttons.filter((b) => tierGilded(Number(b.dataset.tier)))) {
      expect(b.style.getPropertyValue('--halo')).toBe(MARKED.halo);
    }
    app.settings.setPresentation({ tierColors: 'plain' });
    expect(app.view!.display.tierColors).toEqual(preset('plain'));
  });
});

/** The settings row for the creature colours, on a freshly built screen. */
function colorsRow(): HTMLElement {
  app.showSettings(() => app.showTypes());
  return [...document.querySelectorAll<HTMLElement>('.settings-row')].find(
    (r) => r.querySelector('.settings-name')?.textContent === 'Creature colours',
  )!;
}

/** The Distinct preset's tile, by its label. */
const DISTINCT_TILE = 'Distinct — apart under any colour vision';

const tiles = (row: HTMLElement): HTMLButtonElement[] => [
  ...row.querySelectorAll<HTMLButtonElement>('.preview-chip'),
];
const label = (tile: Element): string => tile.querySelector('.chip-label')!.textContent!;
const lit = (row: HTMLElement): string[] =>
  tiles(row)
    .filter((t) => t.classList.contains('active'))
    .map(label);

describe('the settings row', () => {
  it('offers the game’s own colours, the presets and colours of your own, each drawn on a board', () => {
    const row = colorsRow();
    expect(tiles(row).map(label)).toEqual([
      'Default — five hues, then haloed',
      ...TIER_PRESETS.map((t) => `${t.name} — ${t.blurb}`),
      'Custom — any colours',
    ]);
    expect(lit(row)).toEqual(['Default — five hues, then haloed']);
    // Every tile but the custom one, which has nothing to draw until colours are mixed.
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(TIER_PRESETS.length + 1);
  });

  it('saves a preset when it is picked', () => {
    tiles(colorsRow())
      .find((t) => label(t) === DISTINCT_TILE)!
      .click();
    expect(Settings.load().presentation.tierColors).toBe('distinct');
    expect(lit(colorsRow())).toEqual([DISTINCT_TILE]);
  });
});

/** The custom colours' window, opened from its tile. */
function openWindow(): HTMLElement {
  tiles(colorsRow()).at(-1)!.click();
  return document.querySelector<HTMLElement>('.color-card')!;
}

const swatches = (card: HTMLElement): HTMLButtonElement[] => [
  ...card.querySelectorAll<HTMLButtonElement>('button.tier-swatch'),
];
/** Each swatch's colour, as its label names it: the nine tiers, then the halo. */
const shown = (card: HTMLElement): string[] =>
  swatches(card).map((s) => s.getAttribute('aria-label')!.split(', ')[1]!);
const hexField = (card: HTMLElement): HTMLInputElement =>
  card.querySelector<HTMLInputElement>('input.color-hex')!;
const set = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const start = (card: HTMLElement, name: string): void =>
  [...card.querySelectorAll<HTMLButtonElement>('.tier-starts button')]
    .find((b) => b.textContent === name)!
    .click();
const use = (card: HTMLElement): void =>
  card.querySelector<HTMLButtonElement>('button.color-use')!.click();

describe('the custom colours window', () => {
  it('opens on the colours in force, tier 1 chosen, with the example drawn in them', () => {
    app.settings.setPresentation({ tierColors: 'nine' });
    const card = openWindow();
    const nine = preset('nine');
    expect(shown(card)).toEqual([...nine.colors, nine.halo]);
    expect(swatches(card).map((s) => s.getAttribute('aria-pressed'))).toEqual([
      'true',
      ...Array<string>(TIER_COUNT).fill('false'),
    ]);
    expect(hexField(card).value).toBe(nine.colors[0]);
    expect(card.querySelector('.color-example canvas')).not.toBeNull();
  });

  it('mixes the chosen swatch and no other', () => {
    const card = openWindow();
    swatches(card)[2]!.click();
    expect(hexField(card).value).toBe(DEFAULT_TIERS.colors[2]);
    expect(card.querySelector('.tier-editing')!.textContent).toBe('Tier 3');
    set(hexField(card), '#1e90ff');
    const expected = [...DEFAULT_TIERS.colors, DEFAULT_TIERS.halo];
    expected[2] = '#1e90ff';
    expect(shown(card)).toEqual(expected);

    swatches(card).at(-1)!.click();
    expect(card.querySelector('.tier-editing')!.textContent).toBe('The halo of tiers 6 to 9');
    set(hexField(card), '#ffffff');
    expect(shown(card).at(-1)).toBe('#ffffff');
  });

  it('starts again from a preset, keeping the swatch it was on', () => {
    const card = openWindow();
    swatches(card)[4]!.click();
    start(card, 'Plain');
    const plain = preset('plain');
    expect(shown(card)).toEqual([...plain.colors, plain.halo]);
    expect(hexField(card).value).toBe(plain.colors[4]);
    expect(swatches(card)[4]!.getAttribute('aria-pressed')).toBe('true');
  });

  it('saves the colours on "Use these colours", and the custom tile wears them', () => {
    const card = openWindow();
    set(hexField(card), '#1e90ff');
    use(card);
    expect(document.querySelector('.color-card')).toBeNull();
    const mine = {
      colors: ['#1e90ff', ...DEFAULT_TIERS.colors.slice(1)],
      halo: DEFAULT_TIERS.halo,
    };
    expect(Settings.load().presentation.tierColors).toBe(CUSTOM_TIERS);
    expect(Settings.load().presentation.customTierColors).toEqual(mine);
    const row = colorsRow();
    expect(lit(row)).toEqual(['Custom — your own']);
    expect(tiles(row).at(-1)!.querySelector('canvas')).not.toBeNull();
  });

  it('keeps your own colours while a preset is chosen, to open on and start from again', () => {
    const card = openWindow();
    set(hexField(card), '#1e90ff');
    use(card);
    tiles(colorsRow())
      .find((t) => label(t) === DISTINCT_TILE)!
      .click();
    const row = colorsRow();
    expect(lit(row)).toEqual([DISTINCT_TILE]);
    expect(tiles(row).at(-1)!.querySelector('canvas')).not.toBeNull();

    const again = openWindow();
    expect(shown(again)[0]).toBe('#1e90ff');
    start(again, 'Distinct');
    start(again, 'Your own');
    expect(shown(again)[0]).toBe('#1e90ff');
  });

  it('closes on Escape without saving', () => {
    const card = openWindow();
    set(hexField(card), '#000000');
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.querySelector('.color-card')).toBeNull();
    expect(Settings.load().presentation.tierColors).toBe(DEFAULT);
    expect(Settings.load().presentation.customTierColors).toBeNull();
  });
});
