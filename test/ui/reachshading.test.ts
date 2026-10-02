// @vitest-environment happy-dom
/**
 * Reach shading: the cells the crawl rule keeps out of reach darkened when the player has asked,
 * on the boards that have a crawl rule and nowhere else; shown on an example with both kinds of
 * cell; and read from a save that predates it as off.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boardConfig } from '../../src/engine/config.js';
import { Game } from '../../src/engine/game.js';
import { REACH_SHADE } from '../../src/ui/board/overlays.js';
import { DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { ladders } from '../../src/ui/ladders.js';
import { themeFor } from '../../src/ui/looks.js';
import { reachSampleBoard } from '../../src/ui/preview.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';
import { renderPreview } from '../../src/ui/settingsscreen/render.js';
import { type AppDriver, mountApp, settingsRow, tileLabel, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

/** Every path filled in the shade on a canvas made while this runs. */
function recordShade(): { shades: () => number; stop: () => void } {
  let shades = 0;
  const noop = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    const inner = noop.call(this, '2d') as CanvasRenderingContext2D;
    let fillStyle = '';
    return new Proxy(inner, {
      get(target, prop) {
        if (prop === 'fill') {
          return () => {
            if (fillStyle === REACH_SHADE) shades++;
          };
        }
        return Reflect.get(target, prop) as unknown;
      },
      set(target, prop, value) {
        if (prop === 'fillStyle') fillStyle = String(value);
        return prop === 'fillStyle' || Reflect.set(target, prop, value);
      },
    });
  } as unknown as typeof noop;
  return { shades: () => shades, stop: () => (HTMLCanvasElement.prototype.getContext = noop) };
}

describe('what the board draws', () => {
  let recording: ReturnType<typeof recordShade>;
  beforeEach(() => {
    recording = recordShade();
  });
  afterEach(() => recording.stop());

  const shadesOn = (game: Game, reachShading: boolean): number => {
    const before = recording.shades();
    renderPreview(
      game,
      themeFor('dungeon'),
      { ...DEFAULT_DISPLAY, highlight: null, reachShading },
      { cell: 26 },
    );
    return recording.shades() - before;
  };

  it('shades exactly the covered cells out of reach, and none when off', () => {
    const board = reachSampleBoard();
    const outOfReach = board.grid
      .flat()
      .filter((c) => c.present && !c.open && !board.inReach(c)).length;
    expect(outOfReach).toBeGreaterThan(0);
    expect(shadesOn(board, true)).toBe(outOfReach);
    expect(shadesOn(board, false)).toBe(0);
  });

  it('shades nothing on a board with no crawl rule', () => {
    const normal = Game.create(boardConfig(ladders, 'normal', 1), 7);
    expect(shadesOn(normal, true)).toBe(0);
  });
});

describe('the setting', () => {
  it('is what a board is drawn with, and follows a change made during it', () => {
    app.play('dungeon', 1, 7);
    expect(app.view!.display.reachShading).toBe(false);
    app.settings.setPresentation({ reachShading: true });
    expect(app.view!.display.reachShading).toBe(true);
  });

  it('is a pair of tiles on a board with a crawl rule', () => {
    app.showSettings(() => app.showTypes());
    const row = settingsRow('Reach shading');
    const shading = tiles(row);
    expect(shading.map(tileLabel)).toEqual(['Shaded', 'Not shaded']);
    expect(row.querySelectorAll('.preview-chip canvas')).toHaveLength(2);
    shading[0]!.click();
    expect(Settings.load().presentation.reachShading).toBe(true);
  });

  it('reads a save from before it, or one holding anything but true or false, as off', () => {
    for (const presentation of [{}, { reachShading: 'yes' }]) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation, gameplay: {} }),
      );
      expect(Settings.load().presentation.reachShading).toBe(false);
    }
  });
});
