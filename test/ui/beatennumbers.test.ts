// @vitest-environment happy-dom
/**
 * The Beaten toggle (decision 0067): every beaten creature's number drawn at once, as hover draws
 * one, from a button beside Entry and from U. Offered only where that number is the player's to
 * read, and kept in the presentation settings, as the mute is.
 */

import './setup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boardConfig } from '../../src/engine/config.js';
import { Game } from '../../src/engine/game.js';
import { App } from '../../src/ui/app.js';
import { offersBeatenNumbers } from '../../src/ui/board/paint.js';
import { type BoardDisplay, BoardView, DEFAULT_DISPLAY } from '../../src/ui/board/view.js';
import { ladders } from '../../src/ui/ladders.js';
import { themeFor } from '../../src/ui/looks.js';
import { SETTINGS_KEY } from '../../src/ui/savefile.js';
import { Settings } from '../../src/ui/settings.js';

/** The app's surface as the test drives it, private members included. */
interface Driver {
  play(typeId: string, board: number, seed?: number): void;
  readonly settings: Settings;
  readonly view: { readonly display: BoardDisplay } | null;
}

/** Every `fillText` on a canvas made while this runs, with the colour it was filled in. */
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

describe('what the board draws', () => {
  let recording: ReturnType<typeof recordText>;
  beforeEach(() => {
    recording = recordText();
  });
  afterEach(() => recording.stop());

  const display = (beatenNumbers: boolean): BoardDisplay => ({
    ...DEFAULT_DISPLAY,
    highlight: null,
    highlightColor: '#ffffff',
    beatenNumbers,
  });

  /**
   * The numbers drawn in the palette's `hot`, which only a beaten creature's number wears, on a
   * board with two beaten 1s: a 1 under the one on the left, which touches the covered 1 below it,
   * and a 2 under the one on the right, which touches the covered 2 beside it.
   */
  const hot = (beatenNumbers: boolean, hover?: { x: number; y: number }): string[] => {
    const game = Game.fromLayout(['1 . . 1 2 .', '1 . . . . .'], ['k1 2 1 k1 ? ?', '? 2 1 3 ? ?']);
    const view = new BoardView(
      document.createElement('canvas'),
      { onOpen: () => undefined, onCycleMark: () => undefined, onHover: () => undefined },
      { interactive: false, fixedCell: 32 },
    );
    view.setGame(game, themeFor('normal'), display(beatenNumbers));
    recording.texts.length = 0;
    if (hover) view.pinHover(hover.x, hover.y);
    else view.render();
    return recording.texts.filter((t) => t.color === themeFor('normal').hot).map((t) => t.text);
  };

  it('shows a beaten creature’s number only under the cursor while the toggle is off', () => {
    expect(hot(false)).toEqual([]);
    expect(hot(false, { x: 3, y: 0 })).toEqual(['2']);
  });

  it('shows every beaten creature’s number while it is on', () => {
    expect(hot(true)).toEqual(['1', '2']);
    expect(hot(true, { x: 3, y: 0 })).toEqual(['1', '2']);
  });
});

describe('the toggle', () => {
  let app: Driver;
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    app = new App(document.getElementById('app')!) as unknown as Driver;
  });

  const toggle = (): HTMLButtonElement | null =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.startsWith('Beaten: '),
    ) ?? null;
  const key = (k: string, held: KeyboardEventInit = {}): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...held }));
  };

  it('is offered where a beaten creature’s number is the player’s to read, and nowhere else', () => {
    const offered: Record<string, boolean> = {
      normal: true,
      hive: true,
      checker: true,
      sudoku: true,
      pairs: false,
      dominoes: false,
      blind: false,
      seer: false,
    };
    for (const [id, expected] of Object.entries(offered)) {
      expect(offersBeatenNumbers(Game.create(boardConfig(ladders, id, 1), 1)), id).toBe(expected);
      app.play(id, 1, 1);
      expect(toggle() !== null, id).toBe(expected);
    }
  });

  it('switches with its button and with U, says what beaten creatures show, and is kept', () => {
    app.play('normal', 1, 1);
    expect(toggle()!.textContent).toBe('Beaten: Creature');
    expect(toggle()!.getAttribute('aria-pressed')).toBe('false');

    toggle()!.click();
    expect(app.settings.presentation.beatenNumbers).toBe(true);
    expect(app.view!.display.beatenNumbers).toBe(true);
    expect(toggle()!.textContent).toBe('Beaten: Number');
    expect(toggle()!.getAttribute('aria-pressed')).toBe('true');

    key('u');
    expect(app.settings.presentation.beatenNumbers).toBe(false);
    expect(app.view!.display.beatenNumbers).toBe(false);
    key('U', { shiftKey: true });
    expect(app.settings.presentation.beatenNumbers).toBe(true);

    // Kept as the mute is: the next board opens with it on, and so does the next visit.
    app.play('normal', 2, 1);
    expect(app.view!.display.beatenNumbers).toBe(true);
    expect(toggle()!.textContent).toBe('Beaten: Number');
    expect(Settings.load().presentation.beatenNumbers).toBe(true);
  });

  it('leaves Ctrl+U, Cmd+U and Alt+U to the browser', () => {
    app.play('normal', 1, 1);
    key('u', { ctrlKey: true });
    key('u', { metaKey: true });
    key('u', { altKey: true });
    expect(app.settings.presentation.beatenNumbers).toBe(false);
  });

  it('does nothing on a board that hides the numbers', () => {
    app.play('pairs', 1, 1);
    key('u');
    expect(app.settings.presentation.beatenNumbers).toBe(false);
  });

  it('reads a save from before it, or one holding anything but true or false, as off', () => {
    for (const presentation of [{}, { beatenNumbers: 'yes' }]) {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ version: 1, presentation, gameplay: {} }),
      );
      expect(Settings.load().presentation.beatenNumbers).toBe(false);
    }
  });
});
