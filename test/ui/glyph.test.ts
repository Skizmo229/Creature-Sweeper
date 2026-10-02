// @vitest-environment happy-dom
/**
 * What a creature is drawn as, as a setting: its pips, its tier as a digit, or both; drawn on the
 * board and by the clear effects alike; shown on the standard example; and read from a save that
 * predates it as the pips.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { themeFor } from '../../src/ui/looks.js';
import type { CreatureGlyph } from '../../src/ui/presentation.js';
import { tierSampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import { buildAtlas } from '../../src/ui/victory/stage.js';
import { DEFAULT_TIERS, TIER_COUNT, tierColor } from '../../src/ui/tiercolors.js';
import { FONTS } from '../../src/ui/typefaces.js';
import { type AppDriver, mountApp, settingsRow, tileLabel, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

/** Every text filled and every path filled on a canvas made while this runs, with its colour. */
function recordPaint(): {
  texts: { text: string; color: string }[];
  fills: string[];
  stop: () => void;
} {
  const texts: { text: string; color: string }[] = [];
  const fills: string[] = [];
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
        if (prop === 'fill') return () => fills.push(fillStyle);
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'fillStyle') fillStyle = String(value);
        return prop === 'fillStyle' || Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { texts, fills, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

const tiers = Array.from({ length: TIER_COUNT }, (_, i) => i + 1);

describe('what the board draws', () => {
  let recording: ReturnType<typeof recordPaint>;
  beforeEach(() => {
    recording = recordPaint();
  });
  afterEach(() => recording.stop());

  /** The tier digits drawn in their tier's colour, and the pip fills, on the creature colours' example. */
  const drawn = (glyph: CreatureGlyph): { digits: string[]; pips: number } => {
    recording.texts.length = 0;
    recording.fills.length = 0;
    renderPreview(
      tierSampleBoard(),
      themeFor('normal'),
      { ...DEFAULT_DISPLAY, highlight: null, glyph },
      { cell: 26 },
    );
    const digits = tiers
      .filter((t) =>
        recording.texts.some(
          (x) => x.text === String(t) && x.color === tierColor(DEFAULT_TIERS, t),
        ),
      )
      .map(String);
    const pips = recording.fills.filter((f) => DEFAULT_TIERS.colors.includes(f)).length;
    return { digits, pips };
  };

  it('draws pips alone, the digit alone, or both', () => {
    // NORMAL's pips are filled squares: one fill per pip, 45 over the nine tiers.
    expect(drawn('pips')).toEqual({ digits: [], pips: 45 });
    expect(drawn('digit')).toEqual({ digits: tiers.map(String), pips: 0 });
    expect(drawn('both')).toEqual({ digits: tiers.map(String), pips: 45 });
  });

  it('is what the clear effects draw the creatures with too', () => {
    recording.texts.length = 0;
    buildAtlas(
      {
        theme: themeFor('normal'),
        tierColors: DEFAULT_TIERS,
        creature: { glyph: 'digit', font: FONTS.fredoka },
      },
      [{ x: 0, y: 0, size: 20, tier: 7 }],
    );
    expect(recording.texts.map((t) => t.text)).toContain('7');
  });
});

describe('the setting', () => {
  it('is what a board is drawn with, and follows a change made during it', () => {
    app.play('normal', 1, 7);
    expect(app.view!.display.glyph).toBe('pips');
    app.settings.setPresentation({ glyph: 'both' });
    expect(app.view!.display.glyph).toBe('both');
    expect(app.settings.victoryLook('normal').creature.glyph).toBe('both');
  });

  it('is a gallery of the three styles on the standard example, beside the icons', () => {
    app.showSettings(() => app.showTypes());
    const names = [...document.querySelectorAll('.settings-name')].map((n) => n.textContent);
    expect(names.indexOf('Creature tiers')).toBe(names.indexOf('Creature icons') + 1);
    const row = settingsRow('Creature tiers');
    const styles = tiles(row);
    expect(styles.map(tileLabel)).toEqual(['Pips', 'Digit', 'Pips with the digit']);
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(3);
    styles[1]!.click();
    expect(Settings.load().presentation.glyph).toBe('digit');
  });

  it('reads a save from before it, or one holding anything else, as the pips', () => {
    for (const presentation of [{}, { glyph: 'portrait' }]) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation, gameplay: {} }),
      );
      expect(Settings.load().presentation.glyph).toBe('pips');
    }
  });
});
