// @vitest-environment happy-dom
/**
 * How a beaten creature is drawn, as a setting: dimmed and struck through, struck, dimmed, or
 * plain; shown on the standard example; and read from a save that held only whether the stroke
 * was on as the look that left.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { BEATEN_ALPHA } from '../../src/ui/board/paint.js';
import type { BoardDisplay } from '../../src/ui/board/view.js';
import { themeFor } from '../../src/ui/looks.js';
import { type BeatenLook, beatenParts } from '../../src/ui/presentation.js';
import { tierSampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import { DEFAULT_TIERS } from '../../src/ui/tiercolors.js';
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

/** Every alpha a glyph was drawn at, and every stroke in the ink, on a canvas made while this runs. */
function recordPaint(): { alphas: number[]; inkStrokes: () => number; stop: () => void } {
  const alphas: number[] = [];
  let inkStrokes = 0;
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    let strokeStyle = '';
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'stroke') {
          return () => {
            if (strokeStyle === themeFor('normal').ink) inkStrokes++;
          };
        }
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'strokeStyle') strokeStyle = String(value);
        if (prop === 'globalAlpha' && Number(value) < 1) alphas.push(Number(value));
        return Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return {
    alphas,
    inkStrokes: () => inkStrokes,
    stop: () => (HTMLCanvasElement.prototype.getContext = noop),
  };
}

describe('what the board draws', () => {
  let recording: ReturnType<typeof recordPaint>;
  beforeEach(() => {
    recording = recordPaint();
  });
  afterEach(() => recording.stop());

  const display = (beatenLook: BeatenLook): BoardDisplay => ({
    maxCell: 48,
    font: FONTS['jetbrains-mono'],
    highlight: null,
    highlightColor: '#ffffff',
    beatenLook,
    beatenNumbers: false,
    tierColors: DEFAULT_TIERS,
  });

  // The creature colours' example: nine beaten creatures, and nothing else drawn in the ink.
  it('dims and strikes each look as it says', () => {
    const expected: Record<BeatenLook, [dims: number, strikes: number]> = {
      dimStrike: [9, 9],
      strike: [0, 9],
      dim: [9, 0],
      plain: [0, 0],
    };
    for (const look of Object.keys(expected) as BeatenLook[]) {
      recording.alphas.length = 0;
      const before = recording.inkStrokes();
      renderPreview(tierSampleBoard(), themeFor('normal'), display(look), { cell: 26 });
      const [dims, strikes] = expected[look];
      expect(
        recording.alphas.filter((a) => a === BEATEN_ALPHA),
        look,
      ).toHaveLength(dims);
      expect(recording.inkStrokes() - before, look).toBe(strikes);
      expect(beatenParts(look)).toEqual({ dim: dims > 0, strike: strikes > 0 });
    }
  });
});

describe('the setting', () => {
  it('is what a board is drawn with, and follows a change made during it', () => {
    app.play('normal', 1, 7);
    expect(app.view!.display.beatenLook).toBe('dimStrike');
    app.settings.setPresentation({ beatenLook: 'plain' });
    expect(app.view!.display.beatenLook).toBe('plain');
  });

  it('is a gallery of the four looks on the standard example', () => {
    app.showSettings(() => app.showTypes());
    const row = [...document.querySelectorAll('.settings-row')].find(
      (r) => r.querySelector('.settings-name')?.textContent === 'Beaten creatures',
    )!;
    const tiles = [...row.querySelectorAll<HTMLButtonElement>('.preview-chip')];
    expect(tiles.map((t) => t.querySelector('.chip-label')!.textContent)).toEqual([
      'Dimmed and struck through',
      'Struck through',
      'Dimmed',
      'Plain',
    ]);
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(4);
    tiles[2]!.click();
    expect(Settings.load().presentation.beatenLook).toBe('dim');
  });

  it('reads a save from before it by the stroke it kept, and anything else as the game’s own', () => {
    const saved = (presentation: object): BeatenLook => {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation, gameplay: {} }),
      );
      return Settings.load().presentation.beatenLook;
    };
    expect(saved({})).toBe('dimStrike');
    expect(saved({ strikeDefeated: true })).toBe('dimStrike');
    expect(saved({ strikeDefeated: false })).toBe('dim');
    expect(saved({ beatenLook: 'plain', strikeDefeated: false })).toBe('plain');
    expect(saved({ beatenLook: 'glowing' })).toBe('dimStrike');
  });
});
