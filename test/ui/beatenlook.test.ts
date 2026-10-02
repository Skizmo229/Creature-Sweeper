// @vitest-environment happy-dom
/**
 * How a beaten creature is drawn, as a setting: dimmed and struck through, struck, crossed out
 * dimmed or not, dimmed, greyed, or plain; shown on the standard example; and read from a save
 * that held only whether the stroke was on as the look that left.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BEATEN_ALPHA, STRIKE_ALPHA, beatenParts } from '../../src/ui/board/paint.js';
import { type BoardDisplay, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { themeFor } from '../../src/ui/looks.js';
import type { BeatenLook } from '../../src/ui/presentation.js';
import { tierSampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import { TIER_COUNT } from '../../src/ui/tiercolors.js';
import { type AppDriver, mountApp, settingsRow, tileLabel, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

/**
 * Every alpha a glyph was drawn at, every strike (a stroke in the ink at the strike's alpha, which
 * tells it from a greyed creature's halo) and every fill in the ink, on a canvas made while this
 * runs. The alpha is followed through save and restore, as the painter sets and unsets it.
 */
function recordPaint(): {
  alphas: number[];
  strikes: () => number;
  inkFills: () => number;
  stop: () => void;
} {
  const alphas: number[] = [];
  let strikes = 0;
  let inkFills = 0;
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    const ink = themeFor('normal').ink;
    let strokeStyle = '';
    let fillStyle = '';
    let alpha = 1;
    const saved: number[] = [];
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'stroke') {
          return () => {
            if (strokeStyle === ink && alpha === STRIKE_ALPHA) strikes++;
          };
        }
        if (prop === 'fill') {
          return () => {
            if (fillStyle === ink) inkFills++;
          };
        }
        if (prop === 'save') return () => saved.push(alpha);
        if (prop === 'restore') return () => (alpha = saved.pop() ?? 1);
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'strokeStyle') strokeStyle = String(value);
        if (prop === 'fillStyle') fillStyle = String(value);
        if (prop === 'globalAlpha') {
          alpha = Number(value);
          if (alpha < 1) alphas.push(alpha);
        }
        return Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return {
    alphas,
    strikes: () => strikes,
    inkFills: () => inkFills,
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
    ...DEFAULT_DISPLAY,
    highlight: null,
    beatenLook,
  });

  // The creature colours' example: nine beaten creatures, one of every tier, and nothing else
  // drawn in the ink. A greyed creature fills every pip in the ink: a die face of its tier.
  const PIPS = (TIER_COUNT * (TIER_COUNT + 1)) / 2;

  it('dims, strikes and greys each look as it says', () => {
    const expected: Record<BeatenLook, [dims: number, strikes: number, inkFills: number]> = {
      dimStrike: [9, 9, 0],
      strike: [0, 9, 0],
      dimCross: [9, 18, 0],
      cross: [0, 18, 0],
      dim: [9, 0, 0],
      grey: [9, 0, PIPS],
      plain: [0, 0, 0],
    };
    for (const look of Object.keys(expected) as BeatenLook[]) {
      recording.alphas.length = 0;
      const strikesBefore = recording.strikes();
      const fillsBefore = recording.inkFills();
      renderPreview(tierSampleBoard(), themeFor('normal'), display(look), { cell: 26 });
      const [dims, strikes, inkFills] = expected[look];
      expect(
        recording.alphas.filter((a) => a === BEATEN_ALPHA),
        look,
      ).toHaveLength(dims);
      expect(recording.strikes() - strikesBefore, look).toBe(strikes);
      expect(recording.inkFills() - fillsBefore, look).toBe(inkFills);
      expect(beatenParts(look)).toEqual({
        dim: dims > 0,
        strike: strikes > 0,
        cross: strikes > 9,
        grey: inkFills > 0,
      });
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

  it('is a gallery of the seven looks on the standard example', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Beaten creatures');
    const looks = tiles(row);
    expect(looks.map(tileLabel)).toEqual([
      'Dimmed and struck through',
      'Struck through',
      'Dimmed and crossed out',
      'Crossed out',
      'Dimmed',
      'Greyed',
      'Plain',
    ]);
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(7);
    looks[5]!.click();
    expect(Settings.load().presentation.beatenLook).toBe('grey');
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
    expect(saved({ beatenLook: 'dimCross' })).toBe('dimCross');
    expect(saved({ beatenLook: 'glowing' })).toBe('dimStrike');
  });
});
