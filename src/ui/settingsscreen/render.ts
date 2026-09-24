/**
 * Drawing one example board for the settings screen.
 *
 * Lives here rather than beside the boards in `preview.ts` so that file stays free of the DOM
 * and can be imported by a headless test.
 */

import type { Game } from '../../engine/game.js';
import { BoardView, type BoardDisplay } from '../board/view.js';
import type { TypeTheme } from '../theme.js';

/** Cell size for a gallery thumbnail. Below about 24 the pip shapes stop being tellable apart. */
export const CHIP_CELL = 26;
/** Cell size for the cleared board the clear effect is demonstrated on; the creatures need room. */
export const DEMO_CELL = 22;

export interface PreviewOptions {
  /** Cell size in CSS pixels. */
  cell: number;
  /** A cell to hold highlighted, for the cursor-highlight examples. */
  pin?: { x: number; y: number };
}

/**
 * Render one example board into a fresh canvas and hand back both.
 *
 * The view is returned as well as the canvas because two callers keep driving it: the zoom
 * example re-renders as its slider moves, and the clear-effect demo re-seats a new board on it
 * and then lends it to the effect.
 */
export function renderPreview(
  game: Game,
  theme: TypeTheme,
  display: BoardDisplay,
  opts: PreviewOptions,
): { canvas: HTMLCanvasElement; view: BoardView } {
  const canvas = document.createElement('canvas');
  const view = new BoardView(
    canvas,
    {
      onOpen: () => {
        /* an example is not playable */
      },
      onCycleMark: () => {
        /* nor markable */
      },
      onHover: () => {
        /* nor hovered */
      },
    },
    { interactive: false, fixedCell: opts.cell },
  );
  view.setGame(game, theme, display);
  if (opts.pin) view.pinHover(opts.pin.x, opts.pin.y);
  return { canvas, view };
}
