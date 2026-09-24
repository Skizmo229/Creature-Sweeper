/**
 * Canvas renderer and input for the board.
 *
 * Turn-based, so it redraws on change rather than every frame.
 *
 * Sizing quantises the CELL, not a zoom multiplier. Every whole pixel size is
 * available (17, 18, 19...) rather than just multiples of 16, which is what
 * left the big boards rendering far smaller than their stage allowed. An
 * integer cell size also keeps every edge on a pixel boundary, so the art
 * stays crisp without a zoom factor at all.
 */

import type { Cell } from '../engine/types.js';
import type { Game } from '../engine/game.js';
import {
  BOARD_OUTLINE,
  BOND_COLOR,
  BOX_RULE,
  CENSUS_COLOR,
  GIVEN_COLOR,
  MARK_COLOR,
  MARK_OUTLINE,
  NOTE_COLOR,
  OUT_OF_REACH_COLOR,
  PIP_SHAPES,
  type PipShape,
  type TypeTheme,
  drawCreature,
  tierColor,
} from './theme.js';
import { FONTS, type GameFont } from './typefaces.js';
import { hexAt, hexBoardSize, hexCentre, hexPoints, hexRadius, hexRowStep } from './hexgeom.js';
import { type PinchStart, pinchStart, pinchTo } from './pinch.js';
import { DEFAULT_MAX_ZOOM, type HighlightStyle, type HoverDefeated } from './settings.js';
import type { VictorySource, VictorySprite } from './victory.js';
import { hasNote } from '../engine/notes.js';
import { SUDOKU_BOX, SUDOKU_SIZE } from '../engine/sudoku.js';
import { shadeOf } from '../engine/checker.js';
import { isPaired } from '../engine/pairs.js';

/**
 * Floor used only by fit(), for boards too large to fit even when shrunk —
 * below this it pans instead. Manual zoom never reaches it: the fitted size is
 * the smallest the player can get to.
 */
const MIN_CELL = 8;
/**
 * Cells of wrapped board shown beyond each joined edge.
 *
 * One is enough: what the player needs is to see the cells immediately across
 * the seam, because those are the ones that are genuinely adjacent. More than
 * that just shrinks the real board.
 */
const GHOST_CELLS = 1;

/**
 * Which neighbour lies beyond each edge of a cell, for the board's outline.
 *
 * The order matches the order the corners come in, so edge `i` runs from
 * corner `i` to corner `i+1` and faces the neighbour at `dirs[i]`.
 *
 * Squares: top, right, bottom, left.
 */
const SQUARE_EDGE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Hexes: `hexPoints` starts at the top vertex and runs clockwise, so the edges
 * face up-right, right, down-right, down-left, left, up-left. Which grid cell
 * that is depends on the row's parity, exactly as `HEX_DIRS` does in board.ts —
 * odd rows sit half a hex to the right.
 */
const HEX_EDGE_DIRS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // even rows
  [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ],
  // odd rows
  [
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
];

/**
 * Narrow the hover setting to the branch that restyles the glyph.
 *
 * No caller while the hover setting is disabled — see `drawOpen`.
 */
function isPipShape(value: HoverDefeated): value is PipShape {
  return (PIP_SHAPES as readonly string[]).includes(value);
}

/**
 * How tall a digit stands, as a share of the font size, in the face every
 * number on the board was sized for — JetBrains Mono, as near as makes no
 * difference the old monospace stack.
 *
 * Faces differ by more than a third here: Baloo 2's digits are 62% of their
 * em and Anton's 87%. Drawn at one size, a board in Baloo reads a size smaller
 * than one in Anton, which on a 16px cell is the difference between reading a
 * number and squinting at it. So every face is drawn at whatever size puts its
 * digits at this height, within limits — see `digitMetrics`.
 */
const DIGIT_HEIGHT = 0.73;
/** How far a face may be resized to reach DIGIT_HEIGHT, either way. */
const DIGIT_SCALE_LIMITS = [0.8, 1.25] as const;

/** A face's digits, measured, as shares of its font size. */
interface DigitMetrics {
  /** Font size multiplier that stands the digits DIGIT_HEIGHT tall. */
  scale: number;
  /** Ink above the baseline. */
  ascent: number;
  /** Ink below it. */
  descent: number;
}

/**
 * Measured metrics per face. Only a face that has actually loaded is cached:
 * measured before it lands, a face is its fallback's metrics, and caching
 * those would size the board for the wrong face for the rest of the session.
 */
const DIGIT_METRICS = new Map<string, DigitMetrics>();

function digitMetrics(ctx: CanvasRenderingContext2D, face: GameFont): DigitMetrics {
  const key = `${face.weight} 100px ${face.stack}`;
  const known = DIGIT_METRICS.get(key);
  if (known) return known;
  ctx.save();
  ctx.font = key;
  // All ten together: the board sets a whole number on one baseline, so the
  // digits share one ink box rather than each being centred on its own.
  const m = ctx.measureText('0123456789');
  ctx.restore();
  const ascent = m.actualBoundingBoxAscent / 100;
  const descent = m.actualBoundingBoxDescent / 100;
  const height = ascent + descent;
  const [lo, hi] = DIGIT_SCALE_LIMITS;
  const scale = height > 0 ? Math.min(hi, Math.max(lo, DIGIT_HEIGHT / height)) : 1;
  const out = { scale, ascent, descent };
  if (document.fonts.check(key)) DIGIT_METRICS.set(key, out);
  return out;
}

/** A square cell's corners, clockwise from the top-left. */
function squareCorners(cx: number, cy: number, half: number): Array<[number, number]> {
  return [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
  ];
}

/**
 * The presentation settings the renderer actually reads.
 *
 * Passed in rather than reached for, so the view stays a pure function of
 * (game, theme, display) and a test can drive it without a settings store.
 */
export interface BoardDisplay {
  /** Ceiling for manual zoom, in CSS pixels per cell. */
  maxCell: number;
  /** The face for every number, mark and pencil note on the board. */
  font: GameFont;
  /** How the cursor lights the board, or null for not at all. */
  highlight: HighlightStyle | null;
  /** Whether a defeated creature keeps its struck-through corner. */
  strikeDefeated: boolean;
  /**
   * What the cursor does to a creature already beaten. Not read while the
   * setting is disabled: the cursor shows the number underneath instead.
   */
  hoverDefeated: HoverDefeated;
}

export const DEFAULT_DISPLAY: BoardDisplay = {
  maxCell: DEFAULT_MAX_ZOOM,
  font: FONTS['jetbrains-mono'],
  highlight: 'neighbours',
  strikeDefeated: true,
  hoverDefeated: 'tier',
};

/**
 * How this view is being used.
 *
 * The settings screen renders its examples with this same class rather than
 * with a simplified copy, because a preview that drifts from the board is
 * worse than no preview at all — it is a picture that quietly stops being
 * true. Two things have to give for that to work: a thumbnail must not eat
 * the page's scroll wheel, and it must render at a size it was told rather
 * than at whatever its container happens to allow.
 */
export interface BoardViewOptions {
  /** Attach pointer and wheel input. Previews pass false. */
  interactive?: boolean;
  /** Render at exactly this cell size, sizing the canvas to the board. */
  fixedCell?: number;
}

export interface BoardViewCallbacks {
  onOpen: (x: number, y: number) => void;
  /** Right-click / long-press: cycle the mark on a covered cell. */
  onCycleMark: (x: number, y: number) => void;
  onHover: (cell: Cell | null) => void;
  /**
   * Whether a click on this cell would land, in whatever mode the caller is in
   * — the cursor is coloured by it. Left out, the answer is the crawl rule's,
   * which is right for a view that only ever opens cells.
   */
  lands?: (cell: Cell) => boolean;
}

export class BoardView {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cb: BoardViewCallbacks;
  private game: Game | null = null;
  private theme: TypeTheme | null = null;
  private display: BoardDisplay = DEFAULT_DISPLAY;

  private cellPx = 32;
  /**
   * The size fit() chose. Zoom stops here on the way out: shrinking the board
   * below what the stage can already hold gains nothing, so the only way out
   * is back to the fit.
   */
  private fittedCell = 32;
  private originX = 0;
  private originY = 0;
  private hovered: Cell | null = null;

  /**
   * A cell held permanently highlighted, for the cursor-highlight examples.
   *
   * The highlight styles are only visible when something is hovered, and a
   * thumbnail has no cursor on it — on a touch screen it never will. Pinning
   * one cell makes the difference between the styles legible at rest.
   */
  private pinned: Cell | null = null;

  /**
   * True while a board-clear effect has taken the creature glyphs over.
   *
   * The effect draws them on its own layer, so the board must stop drawing
   * them or every creature appears to leave a ghost of itself behind at its
   * old cell. It is put back when the effect ends, including when the effect
   * is cut short — see `playVictory`'s stop function.
   */
  private creaturesHidden = false;

  private dragging = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0, ox: 0, oy: 0 };
  /**
   * Fingers on the board, for pinch-zoom. Touch only: a mouse has one pointer,
   * and a mouse button released outside the window can leave its pointer
   * behind, which here would turn the next touch into a phantom pinch.
   */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch: PinchStart | null = null;
  /**
   * This touch has been a pinch at some point, so no lift in it may open a
   * cell. A two-finger touch used to do exactly that: the second finger reset
   * the pan's starting point and whichever lifted first clicked the cell
   * under it, which on a phone is a way to end a run by zooming.
   */
  private gesture = false;
  /** Only true when the board is larger than the viewport, so panning exists. */
  private canPan = false;

  private readonly options: BoardViewOptions;

  /**
   * The face this view has asked the browser for and is waiting on, so a
   * repaint is requested once per face rather than once per frame drawn
   * before it arrives.
   */
  private awaitingFont: string | null = null;

  /**
   * Watches the stage, so the board refits when the space it has changes for
   * any reason, not only when the window does.
   *
   * The window listener in app.ts was the only trigger once, and it misses
   * everything that happens inside the page: the HUD's readouts are filled in
   * after the board is fitted and at twice their old size can wrap to a
   * second row; a ladder's face arriving a frame late reflows the HUD taller
   * or shorter; the text size moves every line. Each of those shrank the
   * stage under a board already sized for the old one, and the stage clips —
   * measured, up to 95px of board cut off, top or bottom.
   *
   * Created on the first fit, because the stage is the canvas's parent and
   * that is only known once it is attached. Disconnects itself when the canvas
   * leaves the page, so a screen rebuild does not leave it watching a stage
   * nobody sees.
   */
  private stageWatch: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, cb: BoardViewCallbacks, options: BoardViewOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.cb = cb;
    this.options = options;
    // A preview attaches nothing. The wheel handler calls preventDefault, so
    // forty thumbnails would be forty holes in the settings page's scrolling.
    if (options.interactive !== false) this.attach();
  }

  /**
   * Hold a cell highlighted regardless of the pointer. Preview use only.
   *
   * It survives the cursor leaving the canvas, because the point of it is to
   * be visible when nothing is hovering at all.
   */
  pinHover(x: number, y: number): void {
    const cell = this.game?.cellAt(x, y) ?? null;
    this.pinned = cell;
    this.hovered = cell;
    this.render();
  }

  setGame(game: Game, theme: TypeTheme, display: BoardDisplay = DEFAULT_DISPLAY): void {
    this.game = game;
    this.theme = theme;
    this.display = display;
    this.fit();
  }

  /**
   * Re-theme a board already on screen.
   *
   * The settings screen is reachable mid-board, so a palette or font change
   * has to land on the board the player came from. `fit` rather than `render`
   * because the zoom ceiling may have moved under the current cell size.
   */
  setDisplay(theme: TypeTheme, display: BoardDisplay): void {
    this.theme = theme;
    this.display = display;
    this.cellPx = Math.min(this.cellPx, Math.max(this.fittedCell, display.maxCell));
    this.clampOrigin();
    this.render();
  }

  /**
   * Largest whole-pixel cell the stage can hold, then centre the board.
   *
   * `keepZoom` is for a refit the player did not ask for — the stage changed
   * size under them. A zoom they chose is kept, clamped to the new stage,
   * rather than thrown away because the HUD re-wrapped.
   */
  fit(keepZoom = false): void {
    const game = this.game;
    if (!game) return;

    // A fixed-size view is the whole board at a known scale, so the canvas is
    // sized to the board instead of the board to the canvas. `cellPx` has to
    // be set first because `boardW` and `boardH` are derived from it.
    const fixed = this.options.fixedCell;
    if (fixed) {
      this.cellPx = fixed;
      this.fittedCell = fixed;
      this.resizeCanvas(this.boardW, this.boardH);
      this.clampOrigin();
      this.render();
      return;
    }

    const box = this.canvas.parentElement;
    if (box && !this.stageWatch && typeof ResizeObserver !== 'undefined') {
      this.stageWatch = new ResizeObserver(() => {
        if (!this.canvas.isConnected) {
          this.stageWatch?.disconnect();
          this.stageWatch = null;
          return;
        }
        this.fit(true);
      });
      this.stageWatch.observe(box);
    }
    const availW = Math.max(120, (box?.clientWidth ?? 960) - 8);
    const availH = Math.max(120, (box?.clientHeight ?? 520) - 8);

    // Solve for the cell WIDTH that fills the stage. Hex rows nest, so height
    // costs 0.75 of a hex per row plus one row's overhang, and odd rows push
    // the board half a cell wider.
    const hex = game.config.topology === 'hex';
    // A wrapped edge needs a band of board drawn beyond it, so reserve that
    // room here; otherwise the band lands outside the canvas and is invisible.
    const padX = game.config.wrap !== 'none' ? 2 * GHOST_CELLS : 0;
    const padY = game.config.wrap === 'both' ? 2 * GHOST_CELLS : 0;
    const byW = hex
      ? availW / (game.config.width + padX + 0.5)
      : availW / (game.config.width + padX);
    // Invert hexBoardSize for height: rows nest, so solve for the width that
    // makes the stacked rows plus one overhang fit.
    const byH = hex
      ? availH / (hexRowStep(1) * (game.config.height - 1) + 2 * hexRadius(1))
      : availH / (game.config.height + padY);
    const fitted = Math.floor(Math.min(byW, byH));
    // The ceiling caps magnification only. A small board is held at the
    // player's limit rather than blown up to fill the stage; a board too big
    // for the stage still shrinks past it, all the way down to MIN_CELL, so
    // the setting can never leave a board unreachable.
    const zoomed = keepZoom && this.cellPx > this.fittedCell;
    this.fittedCell = Math.max(MIN_CELL, Math.min(this.display.maxCell, fitted));
    this.cellPx = zoomed
      ? Math.max(
          this.fittedCell,
          Math.min(this.cellPx, Math.max(this.fittedCell, this.display.maxCell)),
        )
      : this.fittedCell;

    this.resizeCanvas(availW, availH);
    this.clampOrigin();
    this.render();
  }

  private get isHex(): boolean {
    return this.game?.config.topology === 'hex';
  }

  /** Candidate slots a cell can hold: tier 0 (empty ground) through the top. */
  private get noteSlots(): number {
    return (this.game?.config.tiers ?? 0) + 1;
  }

  /**
   * Alternate 3x3 boxes get a wash, so the boxes read at a glance.
   *
   * The board's own structure, drawn rather than left to be inferred.
   *
   * On a Sudoku board the box is a constraint as real as the row and the
   * column, but unlike them it has no edge to give it away — nine cells that
   * look exactly like their neighbours. Every Sudoku in print solves this the
   * same way, by shading alternate boxes, and it is the single cheapest thing
   * that makes the board readable.
   *
   * A translucent wash rather than a second set of colours, so it derives from
   * whichever theme is in play instead of pinning this type to one palette,
   * and so it lands identically on covered tiles and open floor.
   */
  private washesCell(cell: Cell): boolean {
    const placement = this.game?.config.placement;
    // A checkerboard has to LOOK like one, and for the same reason: the
    // colour is a constraint the player reasons with on every cell, so it
    // cannot be something they work out from the coordinates. The light
    // squares are the washed ones, which is also the half that holds the even
    // tiers -- the wash lightens, so the naming and the picture agree.
    if (placement === 'checker') return shadeOf(cell) === 'light';
    if (placement !== 'sudoku') return false;
    const bx = Math.floor(cell.x / SUDOKU_BOX);
    const by = Math.floor(cell.y / SUDOKU_BOX);
    return (bx + by) % 2 === 1;
  }

  /** The wash itself, over a path this caller has already traced. */
  private fillWash(alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
    ctx.restore();
  }

  private get boardW(): number {
    const cols = this.game?.config.width ?? 0;
    const rows = this.game?.config.height ?? 0;
    return this.isHex ? hexBoardSize(cols, rows, this.cellPx).w : this.cellPx * cols;
  }

  private get boardH(): number {
    const cols = this.game?.config.width ?? 0;
    const rows = this.game?.config.height ?? 0;
    return this.isHex ? hexBoardSize(cols, rows, this.cellPx).h : this.cellPx * rows;
  }

  /** Centre of a cell, in canvas pixels. */
  private centreOf(col: number, row: number): { cx: number; cy: number } {
    if (!this.isHex) {
      return {
        cx: this.originX + col * this.cellPx + this.cellPx / 2,
        cy: this.originY + row * this.cellPx + this.cellPx / 2,
      };
    }
    const { cx, cy } = hexCentre(col, row, this.cellPx);
    return { cx: this.originX + cx, cy: this.originY + cy };
  }

  /** Trace a cell's outline, inset slightly so neighbours read as separate. */
  private tracePath(cx: number, cy: number, inset = 1): void {
    const ctx = this.ctx;
    ctx.beginPath();
    if (!this.isHex) {
      const half = this.cellPx / 2 - inset;
      ctx.rect(cx - half, cy - half, half * 2, half * 2);
      return;
    }
    const pts = hexPoints(cx, cy, hexRadius(this.cellPx) - inset);
    pts.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }

  /**
   * The square a glyph or number is drawn into. On hex it has to shrink so the
   * corners stay inside the slanted sides.
   */
  private contentBox(cx: number, cy: number): { x: number; y: number; size: number } {
    const size = this.isHex ? this.cellPx * 0.78 : this.cellPx;
    return { x: cx - size / 2, y: cy - size / 2, size };
  }

  /**
   * Centre the board when it fits, and stop it being dragged off-screen when
   * it does not. Also decides whether panning is a thing at all.
   */
  private clampOrigin(): void {
    const availW = this.canvas.clientWidth;
    const availH = this.canvas.clientHeight;
    const w = this.boardW;
    const h = this.boardH;

    this.originX =
      w <= availW ? Math.round((availW - w) / 2) : Math.min(0, Math.max(availW - w, this.originX));
    this.originY =
      h <= availH ? Math.round((availH - h) / 2) : Math.min(0, Math.max(availH - h, this.originY));

    this.canPan = w > availW || h > availH;
    this.canvas.style.cursor = this.canPan ? 'grab' : 'pointer';
  }

  /** Scale about a point, so wheel-zoom keeps what is under the cursor put. */
  private zoomAt(nextCell: number, px: number, py: number): void {
    // Floored at the fitted size, not at MIN_CELL — zooming out past the fit
    // only shrinks the board inside a stage that already had room for it.
    const clamped = Math.max(this.fittedCell, Math.min(this.display.maxCell, nextCell));
    if (clamped === this.cellPx) return;
    const bx = (px - this.originX) / this.cellPx;
    const by = (py - this.originY) / this.cellPx;
    this.cellPx = clamped;
    this.originX = Math.round(px - bx * clamped);
    this.originY = Math.round(py - by * clamped);
    this.clampOrigin();
    this.render();
  }

  private resizeCanvas(cssW: number, cssH: number): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  private cellAtClient(clientX: number, clientY: number): Cell | null {
    const game = this.game;
    if (!game) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left - this.originX;
    const py = clientY - rect.top - this.originY;

    if (!this.isHex) {
      return this.resolve(game, Math.floor(px / this.cellPx), Math.floor(py / this.cellPx));
    }

    // Hexes do not tile a rectangle, so flooring cannot work. hexgeom does the
    // cube-rounding, and is unit-tested against every cell at several zooms.
    const { col, row } = hexAt(px, py, this.cellPx);
    return this.resolve(game, col, row);
  }

  /**
   * Map a grid coordinate to a cell, folding wrapped edges back in.
   *
   * On a wrapped board this is what makes the ghost band clickable: a click on
   * the repeat lands on the real cell it is showing, which is what anyone
   * would expect from something drawn as part of the board.
   */
  private resolve(game: Game, x: number, y: number): Cell | null {
    const w = game.config.width;
    const h = game.config.height;
    const wrap = game.config.wrap;
    const wx = wrap !== 'none' ? ((x % w) + w) % w : x;
    const wy = wrap === 'both' ? ((y % h) + h) % h : y;
    return game.cellAt(wx, wy);
  }

  // ------------------------------------------------------------------ render

  /**
   * Set the board's face for a number that would be `px` in the face the
   * board was sized for, and say where to put the baseline.
   *
   * `centre` is the offset from a point to the baseline that centres the
   * digits' ink on that point. It replaces a fixed nudge under a 'middle'
   * baseline, which was tuned for one face: 'middle' is the middle of the
   * em, and faces hang their digits in the em at very different heights.
   * `ascent` is the ink above the baseline, for text set from a top edge.
   */
  private numberFont(px: number): { centre: number; ascent: number } {
    const face = this.display.font;
    const m = digitMetrics(this.ctx, face);
    const size = Math.max(1, Math.round(px * m.scale));
    this.ctx.font = `${face.weight} ${size}px ${face.stack}`;
    this.ctx.textBaseline = 'alphabetic';
    return { centre: ((m.ascent - m.descent) / 2) * size, ascent: m.ascent * size };
  }

  /**
   * Repaint once the board's face has loaded, if it has not yet.
   *
   * The interface reflows when a face lands and the board cannot: a canvas
   * keeps whatever it last drew, which before the face arrives is the
   * fallback. Asking is also what starts the download — a face nothing on the
   * page has used yet is not fetched just because the canvas names it.
   */
  private awaitFont(): void {
    const face = this.display.font;
    const probe = `${face.weight} 16px ${face.stack}`;
    if (this.awaitingFont === probe || document.fonts.check(probe)) return;
    this.awaitingFont = probe;
    document.fonts.load(probe).then(
      () => {
        if (this.awaitingFont !== probe) return; // the face changed meanwhile
        this.awaitingFont = null;
        this.render();
      },
      () => {
        this.awaitingFont = null;
      },
    );
  }

  render(): void {
    const game = this.game;
    const theme = this.theme;
    if (!game || !theme) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.awaitFont();

    this.drawGhostBand(game, theme);

    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present) continue; // a hole is drawn as nothing at all
        const { cx, cy } = this.centreOf(cell.x, cell.y);
        if (cell.open) this.drawOpen(cell, cx, cy, theme, game);
        else this.drawCovered(cell, cx, cy, theme);
        if (cell.census !== null) this.drawCensus(cell, cx, cy);
      }
    }

    // After the cells, so the board's edge is a clean line rather than
    // something each rim cell paints half of its own bevel over.
    this.drawSilhouette(game);
    this.drawBoxRules(game);
    this.drawBonds(game);
    this.drawSeams(game);

    if (this.hovered && game.status === 'playing' && this.display.highlight) {
      this.drawHighlight(game, this.hovered, this.display.highlight);
    }
  }

  /**
   * Light the cell under the cursor, and depending on the style its
   * surroundings too.
   *
   * 'neighbours' is the truthful one and the default: it asks the engine what
   * is genuinely adjacent, so on a hex board it lights six cells and on a
   * wrapped board it jumps across the seam. That last behaviour teaches the
   * topology faster than any amount of explaining, which is why it is what
   * every game type defaults to.
   *
   * 'block' is the literal 3x3 of grid coordinates instead — a steady shape
   * rather than a true one. It deliberately does NOT fold wrapped edges back
   * in: a player who asked for a flat block wants a block, and a highlight
   * that teleports is the thing they turned off.
   */
  private drawHighlight(game: Game, hovered: Cell, style: HighlightStyle): void {
    const ctx = this.ctx;
    ctx.save();
    // The cursor says whether the click would land as well as where: past the
    // reach on a crawl board, or a pencil candidate the board has ruled out.
    // Colour rather than a second shape: the highlight is already carrying the
    // shape information, and a player scanning for somewhere to go needs to
    // read this at the speed they move the mouse.
    //
    // Each cell is asked for itself, so the surround is not all one colour —
    // hovering the edge of your reach lights the cells you can still take in
    // green and the ones past it in red, which shows the boundary rather than
    // just reporting which side of it the centre is on.
    const reachable = (cell: Cell): boolean =>
      this.cb.lands ? this.cb.lands(cell) : game.inReach(cell);
    ctx.lineWidth = 2;

    if (style !== 'cell') {
      ctx.globalAlpha = 0.4;
      const around: Cell[] = [];
      if (style === 'neighbours') {
        around.push(...game.neighboursOf(hovered));
      } else {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            // Clipped to cells that exist rather than drawn over holes and
            // off-board space, which would outline nothing.
            const cell = game.cellAt(hovered.x + dx, hovered.y + dy);
            if (cell) around.push(cell);
          }
        }
      }
      for (const n of around) {
        const p = this.centreOf(n.x, n.y);
        ctx.strokeStyle = reachable(n) ? MARK_COLOR : OUT_OF_REACH_COLOR;
        this.tracePath(p.cx, p.cy, 3);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    const { cx, cy } = this.centreOf(hovered.x, hovered.y);
    ctx.strokeStyle = reachable(hovered) ? MARK_COLOR : OUT_OF_REACH_COLOR;
    this.tracePath(cx, cy, 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The white line where the board meets the background.
   *
   * Only the edges with nothing on the other side: the outer rim, and the rim
   * of every hole inside it. On a rectangle that is a box round the board; on
   * a shaped one it IS the shape — the rooms and hallways of a dungeon, the
   * arms of a cross, the caverns of a cave.
   *
   * The obvious trick does not work here and it is worth saying why, because
   * it looks like it should. Stroking every cell under the fills, so that
   * interior strokes get painted over and only the outward halves survive,
   * relies on the cells tiling exactly — and they do not: `tracePath` insets
   * each one by a pixel, so there is a two-pixel gutter between neighbours
   * that no fill ever covers, and the whole grid comes out white. So the
   * edges are worked out rather than hidden.
   *
   * Adjacency here is deliberately NOT `neighboursOf`. That answers a question
   * about the rules — it wraps, so on a torus the leftmost column is adjacent
   * to the rightmost — and this is a question about the picture, where the
   * board plainly stops at the left edge whatever the rules say. The seam is
   * already drawn, dashed, by `drawSeams`.
   */
  private drawSilhouette(game: Game): void {
    const ctx = this.ctx;
    const solid = (x: number, y: number): boolean => game.grid[y]?.[x]?.present === true;

    ctx.save();
    ctx.strokeStyle = BOARD_OUTLINE;
    ctx.lineWidth = Math.max(1.5, this.cellPx / 12);
    ctx.lineCap = 'square';
    ctx.beginPath();

    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present) continue;
        const { cx, cy } = this.centreOf(cell.x, cell.y);
        // The cell's true bounds, not the inset path the fills use, so the
        // outline lands on the board's actual edge.
        const corners = this.isHex
          ? hexPoints(cx, cy, hexRadius(this.cellPx))
          : squareCorners(cx, cy, this.cellPx / 2);
        const dirs = this.isHex ? HEX_EDGE_DIRS[cell.y & 1]! : SQUARE_EDGE_DIRS;

        for (let i = 0; i < corners.length; i++) {
          const [dx, dy] = dirs[i]!;
          if (solid(cell.x + dx, cell.y + dy)) continue;
          const [ax, ay] = corners[i]!;
          const [bx, by] = corners[(i + 1) % corners.length]!;
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Repeat the board's far edge just beyond each joined edge, dimmed, so a
   * wrapped board reads as continuous instead of simply stopping.
   */
  private drawGhostBand(game: Game, theme: TypeTheme): void {
    const wrap = game.config.wrap;
    if (wrap === 'none') return;
    const wrapY = wrap === 'both';

    const offsets: Array<[number, number]> = [
      [-1, 0],
      [1, 0],
    ];
    if (wrapY) offsets.push([0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]);

    const ctx = this.ctx;
    const w = game.config.width;
    const h = game.config.height;
    ctx.save();
    ctx.globalAlpha = 0.3;

    for (const [ox, oy] of offsets) {
      const dx = ox * this.boardW;
      const dy = oy * this.boardH;
      for (const row of game.grid) {
        for (const cell of row) {
          // Only the strip that will actually land next to the seam.
          if (ox === -1 && cell.x < w - GHOST_CELLS) continue;
          if (ox === 1 && cell.x >= GHOST_CELLS) continue;
          if (oy === -1 && cell.y < h - GHOST_CELLS) continue;
          if (oy === 1 && cell.y >= GHOST_CELLS) continue;

          if (!cell.present) continue;
          const { cx, cy } = this.centreOf(cell.x, cell.y);
          if (cell.open) this.drawOpen(cell, cx + dx, cy + dy, theme, game);
          else this.drawCovered(cell, cx + dx, cy + dy, theme);
        }
      }
    }
    ctx.restore();
  }

  /** Dashed line where the board truly ends and the repeat begins. */
  /**
   * Heavier rules along the 3x3 box boundaries.
   *
   * Drawn after every cell rather than per-cell, because a cell drawn later
   * would paint over its neighbour's half of a shared edge and leave the rule
   * looking chewed. One pass over the whole board also means the line is a
   * single stroke of constant width, which is what makes it read as structure
   * rather than as nine cells that happen to have thick sides.
   */
  private drawBoxRules(game: Game): void {
    if (game.config.placement !== 'sudoku') return;
    const ctx = this.ctx;
    const size = this.cellPx;
    const origin = this.centreOf(0, 0);
    const left = origin.cx - size / 2;
    const top = origin.cy - size / 2;
    const span = SUDOKU_SIZE * size;

    ctx.save();
    ctx.strokeStyle = BOX_RULE;
    // Every cell already carries a ~size/10 edge, so a rule of similar weight
    // is invisible among them. It has to be decisively heavier to read as a
    // boundary rather than as one more cell border.
    ctx.lineWidth = Math.max(3, size / 4.5);
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let i = 0; i <= SUDOKU_SIZE; i += SUDOKU_BOX) {
      const at = i * size;
      ctx.moveTo(left + at, top);
      ctx.lineTo(left + at, top + span);
      ctx.moveTo(left, top + at);
      ctx.lineTo(left + span, top + at);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Tie the two halves of every uncovered pair together.
   *
   * Only where BOTH are open, because that is exactly when the player knows
   * which cell the partner is. One open creature tells you a partner exists
   * and what tier it is — its own number says so — but not where, and drawing
   * a line to it would hand over the one thing the mode asks you to work out.
   *
   * In its own pass after the cells, for the same reason the box rules are: a
   * cell drawn later would paint over its neighbour's half of the line. It
   * reads adjacency through `neighboursOf`, so a bond across a wrapped seam or
   * between two hexes needs no special case — and the `>` on the flat index is
   * what keeps each bond from being drawn twice, once from either end.
   *
   * A CONGO LINE is tied the same way, orthogonal contacts only. Two members
   * orthogonally beside each other are consecutive in the line — the no-2x2
   * rule makes that exact — so the ties draw the line as far as it is known and
   * say nothing the board had not already. A diagonal contact is where a line
   * turns a corner, and a tie there would be a link that does not exist.
   */
  private drawBonds(game: Game): void {
    const congo = game.config.placement === 'congo';
    if (!congo && !isPaired(game.config.placement)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = BOND_COLOR;
    ctx.lineWidth = Math.max(1, this.cellPx / 12);
    ctx.lineCap = 'round';
    ctx.beginPath();

    const w = game.config.width;
    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present || !cell.open || cell.tier === 0) continue;
        for (const n of game.neighboursOf(cell)) {
          if (!n.open || n.tier === 0) continue;
          if (n.y * w + n.x < cell.y * w + cell.x) continue;
          if (congo && n.x !== cell.x && n.y !== cell.y) continue;
          const a = this.centreOf(cell.x, cell.y);
          const b = this.centreOf(n.x, n.y);
          // A wrapped pair is adjacent in the rules and a board apart on
          // screen, so joining the two centres would draw a line straight
          // across the board. Only the near case is drawn; the seam itself
          // already says the edges are joined.
          if (Math.abs(a.cx - b.cx) > this.cellPx * 2 || Math.abs(a.cy - b.cy) > this.cellPx * 2)
            continue;
          // Inset off both centres rather than joining them, so the tie sits
          // in the gap between the two cells and neither glyph is painted
          // over. The number a creature here flips to is its partner's tier,
          // the most valuable thing on the board — a line through it would
          // be structure obscuring the fact the structure is about.
          const t = 0.3;
          ctx.moveTo(a.cx + (b.cx - a.cx) * t, a.cy + (b.cy - a.cy) * t);
          ctx.lineTo(b.cx - (b.cx - a.cx) * t, b.cy - (b.cy - a.cy) * t);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawSeams(game: Game): void {
    const wrap = game.config.wrap;
    if (wrap === 'none') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = MARK_COLOR;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();

    // Drawn per cell rather than as one line down the bounding box, because on
    // a shaped board most of a joined edge is hole: WRAPPED CROSS joins the
    // arm tips and nothing else, and a dash running the full height of the box
    // would claim a seam across background where there is no board to join.
    // On a rectangle every cell of the edge is there, so this is the same
    // line it always drew.
    const w = game.config.width;
    const h = game.config.height;
    const half = this.cellPx / 2;
    const seam = (cell: { x: number; y: number }, vertical: boolean, far: boolean): void => {
      const { cx, cy } = this.centreOf(cell.x, cell.y);
      const at = (vertical ? cx : cy) + (far ? half : -half);
      if (vertical) {
        ctx.moveTo(at, cy - half);
        ctx.lineTo(at, cy + half);
      } else {
        ctx.moveTo(cx - half, at);
        ctx.lineTo(cx + half, at);
      }
    };

    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present) continue;
        if (cell.x === 0) seam(cell, true, false);
        if (cell.x === w - 1) seam(cell, true, true);
        if (wrap === 'both') {
          if (cell.y === 0) seam(cell, false, false);
          if (cell.y === h - 1) seam(cell, false, true);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Census sits in the top-left corner rather than the middle, so it can never
   * be confused with the cell's own number or a mark, both of which are centred.
   */
  /**
   * The hovered creature's level, written over its cell.
   *
   * Sized and placed like the cell's own number rather than like the Census
   * badge, because this one REPLACES what the cell was showing instead of
   * annotating it — so it should read as the cell's content, at the size the
   * eye already expects a digit there.
   *
   * Two things keep it from being confused with the number it covers. It wears
   * `tierColor`, the same global encoding the pips underneath it wear, which no
   * `ink` or `hot` in the set comes near. And it carries a dark backing plate,
   * because a tier-3 is gold and several floors are light enough that a gold
   * digit on them alone would be thin.
   *
   * No caller while the hover setting is disabled — see `drawOpen`.
   */
  private drawTierBadge(cell: Cell, box: { x: number; y: number; size: number }): void {
    const ctx = this.ctx;
    const { x, y, size } = box;
    ctx.save();
    ctx.fillStyle = 'rgba(6, 6, 10, 0.72)';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tierColor(cell.tier);
    const { centre } = this.numberFont(size * 0.74);
    ctx.textAlign = 'center';
    ctx.fillText(String(cell.tier), x + size / 2, y + size / 2 + centre);
    ctx.restore();
  }

  private drawCensus(cell: Cell, cx: number, cy: number): void {
    const ctx = this.ctx;
    const box = this.contentBox(cx, cy);
    const size = box.size;
    // Top-left of the content box, so it can never be read as the centred
    // number or a mark. On hex that box is inset, which keeps it off the edge.
    const x = box.x;
    const y = box.y;
    const r = Math.max(5, size * 0.3);
    ctx.save();
    ctx.fillStyle = 'rgba(6, 12, 18, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r * 2, y);
    ctx.lineTo(x, y + r * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = CENSUS_COLOR;
    const { ascent } = this.numberFont(size * 0.32);
    ctx.textAlign = 'left';
    ctx.fillText(
      String(cell.census),
      x + Math.max(1, size * 0.04),
      y + Math.max(0, size * 0.02) + ascent,
    );
    ctx.restore();
  }

  private drawCovered(cell: Cell, cx: number, cy: number, theme: TypeTheme): void {
    const ctx = this.ctx;
    const size = this.cellPx;

    this.tracePath(cx, cy);
    ctx.fillStyle = theme.tile;
    ctx.fill();
    // Before the stroke, so the wash cannot wipe out the cell's own edge.
    if (this.washesCell(cell)) this.fillWash(0.18);
    // A stroke reads as the bevel did on squares, and works at any cell shape.
    ctx.strokeStyle = theme.tileEdge;
    ctx.lineWidth = Math.max(1, size / 10);
    ctx.stroke();

    if (cell.mark > 0) {
      const box = this.contentBox(cx, cy);
      // Outlined, because green alone vanishes on a light tile like EASY's olive.
      ctx.save();
      const { centre } = this.numberFont(box.size * 0.58);
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, box.size * 0.16);
      ctx.strokeStyle = MARK_OUTLINE;
      const my = cy + centre;
      ctx.strokeText(String(cell.mark), cx, my);
      // A clue the board dealt and a claim the player made are different
      // things, so they are different colours. Same outline, because both
      // still have to survive whatever tile they land on.
      ctx.fillStyle = cell.given ? GIVEN_COLOR : MARK_COLOR;
      ctx.fillText(String(cell.mark), cx, my);
      ctx.restore();
    } else if (cell.notes) {
      this.drawNotes(cell, cx, cy);
    }
  }

  /**
   * Pencil marks, laid out as a fixed 3-wide grid of slots.
   *
   * Fixed is the point: a candidate always sits in the same corner of the cell
   * whether or not its neighbours are still in the set, so the player reads the
   * pattern rather than the digits, and striking one out does not reshuffle the
   * rest. Slot 0 is empty ground and shows a dot, because "0" next to a column
   * of tiers reads as a tier.
   */
  private drawNotes(cell: Cell, cx: number, cy: number): void {
    const ctx = this.ctx;
    const box = this.contentBox(cx, cy);
    const slots = this.noteSlots;
    const cols = 3;
    const rows = Math.ceil(slots / cols);
    const pad = box.size * 0.12;
    const w = (box.size - pad * 2) / cols;
    const h = (box.size - pad * 2) / rows;
    const font = Math.round(Math.min(w, h) * 0.86);
    if (font < 5) return; // below this the pips are noise, not information

    ctx.save();
    const { centre } = this.numberFont(font);
    ctx.textAlign = 'center';
    // Outlined, for the reason a mark is: green alone vanishes on a light tile.
    // Composited straight onto its tile the dimmed green measured 1.22:1 on
    // EASY, 1.61 on BLIND and 1.70 on DOMINOES — and going opaque only reaches
    // 1.37 on EASY, because the hue itself is light. Against its own halo it
    // is 5.1-5.9:1 on every palette, so the fix lives on the note and no tile
    // had to move. All the halos go down before any fill, so a halo can never
    // bite into a neighbouring candidate.
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, font * 0.3);
    ctx.strokeStyle = MARK_OUTLINE;
    ctx.fillStyle = NOTE_COLOR;
    const at: { glyph: string; x: number; y: number }[] = [];
    for (let t = 0; t < slots; t++) {
      if (!hasNote(cell.notes, t)) continue;
      at.push({
        glyph: t === 0 ? '·' : String(t),
        x: box.x + pad + w * (t % cols) + w / 2,
        y: box.y + pad + h * Math.floor(t / cols) + h / 2 + centre,
      });
    }
    for (const { glyph, x, y } of at) ctx.strokeText(glyph, x, y);
    for (const { glyph, x, y } of at) ctx.fillText(glyph, x, y);
    ctx.restore();
  }

  private drawOpen(cell: Cell, cx: number, cy: number, theme: TypeTheme, game: Game): void {
    const ctx = this.ctx;
    const box = this.contentBox(cx, cy);

    this.tracePath(cx, cy);
    ctx.fillStyle = theme.floor;
    ctx.fill();
    // Lighter on the floor than on a tile: the floor is much darker, so the
    // same alpha reads as a bigger step there.
    if (this.washesCell(cell)) this.fillWash(0.17);

    // A defeated creature under the cursor shows the number underneath it, the
    // sum of its neighbours. It used to be a click toggle held on the cell;
    // hovering is the whole mechanism now, so it is a picture of where the
    // cursor is rather than state anything has to remember. Not while a clear
    // effect owns the glyphs: the cell is bare floor then, under a creature in
    // flight.
    //
    // Never on a pairing board, by request. The number there is the PARTNER'S
    // tier, and a lone digit over a creature reads as that creature's own
    // level — it confused more than it told.
    const hoverNumber =
      cell.tier > 0 &&
      !cell.alive &&
      cell === this.hovered &&
      !this.creaturesHidden &&
      !isPaired(game.config.placement);

    // DISABLED, with its settings row: "Hovering a creature you have beaten".
    // The cursor over a beaten creature now shows the number underneath, and
    // the two cannot share it. `display.hoverDefeated` is still plumbed and
    // saved, only not read, so bringing it back is uncommenting this, the
    // restyle below, and the gallery in settingsscreen.ts.
    //
    // // The cursor, over a creature that is already dealt with. It reveals
    // // nothing — the pips under the cursor already say the tier — so this is
    // // presentation and it takes the cell before either branch below, which is
    // // what makes it one rule rather than two: "while you hover a beaten
    // // creature, it shows its level", whether the cell was showing its glyph or
    // // the number it was toggled to.
    // //
    // // Drawn in the LEVEL'S OWN COLOUR, which is the part that keeps it safe to
    // // read. A cell's number and a creature's level are both single digits, and
    // // on PAIRS both are live at once — the number there is the partner's
    // // level — so a digit that simply replaced another digit in the same ink
    // // would be a misread waiting to happen. `tierColor` is already the global
    // // encoding of a tier, worn by the very pips this is covering.
    // if (cell.tier > 0 && this.display.hoverDefeated === 'tier' && cell === this.hovered
    //     && !this.creaturesHidden) {
    //   this.drawTierBadge(cell, box);
    //   return;
    // }

    // A defeated creature shows its sprite, or its own number while hovered.
    if (cell.tier > 0 && !hoverNumber) {
      // ...unless a clear effect currently owns the glyphs, in which case the
      // cell is drawn as bare floor and the effect draws the creature.
      if (this.creaturesHidden) return;
      ctx.save();
      // Dim the glyph itself rather than washing it out with a floor overlay,
      // which left defeated creatures almost invisible.
      if (!cell.alive) ctx.globalAlpha = 0.55;
      // DISABLED with the hover setting — see above. A hovered beaten
      // creature shows its number now, so its glyph is never drawn to restyle.
      //
      // // The hovered glyph may be restyled into another shape. `drawCreature`
      // // reads the shape off the theme, so this is a theme with one field
      // // changed rather than a second drawing path.
      // const glyphTheme = cell === this.hovered && isPipShape(this.display.hoverDefeated)
      //   ? { ...theme, pip: this.display.hoverDefeated }
      //   : theme;
      // drawCreature(ctx, box.x, box.y, box.size, cell.tier, glyphTheme);
      drawCreature(ctx, box.x, box.y, box.size, cell.tier, theme);
      ctx.restore();
      // A struck-through corner reads as "dealt with" at a glance. Optional,
      // because at small cell sizes the stroke crosses the pips and some
      // players read it as clutter — with it off, the dimmed glyph above is
      // doing that job on its own.
      if (!cell.alive && this.display.strikeDefeated) {
        ctx.save();
        ctx.strokeStyle = theme.ink;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = Math.max(1, box.size / 16);
        ctx.beginPath();
        ctx.moveTo(box.x + box.size * 0.18, box.y + box.size * 0.82);
        ctx.lineTo(box.x + box.size * 0.82, box.y + box.size * 0.18);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const showNumber = cell.tier > 0 ? hoverNumber : cell.num > 0;
    if (!showNumber) return;

    const text = String(cell.num);
    ctx.save();
    // Red on a creature's own cell, ink on open ground — as in the original.
    ctx.fillStyle = cell.tier > 0 ? theme.hot : theme.ink;
    const scale = text.length > 1 ? 0.5 : 0.62;
    const { centre } = this.numberFont(box.size * scale);
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy + centre);
    ctx.restore();
  }

  // ------------------------------------------------------------------- input

  private attach(): void {
    const c = this.canvas;

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // Auto-fit picks a sensible size, but big boards still reward leaning in.
    c.addEventListener(
      'wheel',
      (e) => {
        if (!this.game) return;
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const step = e.deltaY < 0 ? 2 : -2;
        this.zoomAt(this.cellPx + step, e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );

    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        const cell = this.cellAtClient(e.clientX, e.clientY);
        if (cell) this.cb.onCycleMark(cell.x, cell.y);
        return;
      }
      if (e.pointerType === 'touch') {
        if (!this.touches.size) this.gesture = false;
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size === 2) {
          this.beginPinch();
          return;
        }
        if (this.touches.size > 2) return;
      }
      this.dragMoved = false;
      // Only arm a drag when there is somewhere to drag to. On a board that
      // fits, a click is unambiguous and never has to survive drag tracking.
      if (this.canPan) {
        this.dragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY, ox: this.originX, oy: this.originY };
        try {
          c.setPointerCapture(e.pointerId);
        } catch {
          // Synthetic or already-released pointers cannot be captured; the
          // click path below still works without capture.
        }
      }
    });

    c.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pinch && this.touches.size >= 2) {
          this.movePinch();
          return;
        }
        if (this.gesture) return;
      }
      if (this.dragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          this.dragMoved = true;
          this.originX = this.dragStart.ox + dx;
          this.originY = this.dragStart.oy + dy;
          this.clampOrigin();
          this.render();
        }
        return;
      }
      const cell = this.cellAtClient(e.clientX, e.clientY);
      if (cell !== this.hovered) {
        this.hovered = cell;
        this.cb.onHover(cell);
        this.render();
      }
    });

    const endDrag = (e: PointerEvent) => {
      if (e.button === 2) return; // right-click was handled on pointerdown
      if (this.touches.delete(e.pointerId)) {
        if (this.touches.size < 2) this.pinch = null;
        // The lift that ends a pinch opens nothing, and nor does the last
        // finger of it coming up later.
        if (this.gesture) return;
      }
      if (this.dragging) {
        this.dragging = false;
        try {
          if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
        } catch {
          // Capture may already be gone; nothing to release.
        }
      }
      if (this.dragMoved) return; // a pan, not a click
      const cell = this.cellAtClient(e.clientX, e.clientY);
      if (cell) this.cb.onOpen(cell.x, cell.y);
    };
    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', (e) => {
      this.dragging = false;
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
    });

    c.addEventListener('pointerleave', () => {
      // Back to the pinned cell rather than to nothing, so a preview that is
      // demonstrating a highlight keeps demonstrating it.
      if (this.hovered !== this.pinned) {
        this.hovered = this.pinned;
        this.cb.onHover(null);
        this.render();
      }
    });
  }

  /**
   * Two fingers are down: from here the gesture is a pinch, whatever the first
   * finger was doing, and it stays one until every finger is up. Both are
   * captured so the pinch survives a finger straying off the canvas.
   */
  private beginPinch(): void {
    const [a, b] = [...this.touches.values()];
    const rect = this.canvas.getBoundingClientRect();
    this.pinch = pinchStart(a!.x - rect.left, a!.y - rect.top, b!.x - rect.left, b!.y - rect.top, {
      cell: this.cellPx,
      originX: this.originX,
      originY: this.originY,
    });
    this.gesture = true;
    this.dragging = false;
    this.dragMoved = true;
    for (const id of this.touches.keys()) {
      try {
        this.canvas.setPointerCapture(id);
      } catch {
        /* already released */
      }
    }
  }

  private movePinch(): void {
    if (!this.pinch) return;
    const [a, b] = [...this.touches.values()];
    const rect = this.canvas.getBoundingClientRect();
    const next = pinchTo(
      this.pinch,
      a!.x - rect.left,
      a!.y - rect.top,
      b!.x - rect.left,
      b!.y - rect.top,
      this.fittedCell,
      Math.max(this.fittedCell, this.display.maxCell),
    );
    this.cellPx = next.cell;
    this.originX = next.originX;
    this.originY = next.originY;
    this.clampOrigin();
    this.render();
  }

  /**
   * Stop, or resume, drawing the board's own creature glyphs.
   *
   * Only the board-clear effect should touch this, and only for as long as it
   * is running: a board left in this state is a board that has silently lost
   * half its information.
   */
  setCreaturesHidden(hidden: boolean): void {
    if (this.creaturesHidden === hidden) return;
    this.creaturesHidden = hidden;
    this.render();
  }

  /**
   * Where every creature glyph is right now, in CSS pixels relative to this
   * canvas.
   *
   * Covered creatures are included as well as beaten ones. On an ordinary win
   * every creature is already open so it makes no difference, but a search
   * board (BLIND) is won with its creatures still hidden — and a clear effect
   * that showed the player what they had been walking past is a better ending
   * than one that finds nothing to animate.
   */
  creatureSprites(): VictorySprite[] {
    const game = this.game;
    if (!game) return [];
    const out: VictorySprite[] = [];
    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present || cell.tier <= 0) continue;
        const { cx, cy } = this.centreOf(cell.x, cell.y);
        out.push({ x: cx, y: cy, size: this.contentBox(cx, cy).size, tier: cell.tier });
      }
    }
    return out;
  }

  /** Everything a board-clear effect needs in order to take the glyphs over. */
  victorySource(): VictorySource {
    return {
      canvas: this.canvas,
      sprites: this.creatureSprites(),
      setCreaturesHidden: (hidden) => this.setCreaturesHidden(hidden),
    };
  }

  /** The cell under the cursor, for keyboard marking. */
  get hoveredCell(): Cell | null {
    return this.hovered;
  }

  /** Current cell size in CSS pixels, for the zoom readout. */
  get cellSize(): number {
    return this.cellPx;
  }

  /** True when zooming out further would do nothing. */
  get atFit(): boolean {
    return this.cellPx <= this.fittedCell;
  }

  /** Step the zoom from a button or key, anchored on the stage centre. */
  nudgeZoom(delta: number): void {
    this.zoomAt(this.cellPx + delta, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }
}
