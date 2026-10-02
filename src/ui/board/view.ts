/**
 * The board on screen. Owns the game being shown, the presentation it is drawn with, the cell
 * size and origin, and the hovered cell; fits itself to its stage; and hands the drawing to the
 * painters in `paint.ts` and `overlays.ts` and the pointer to `input.ts`.
 *
 * Turn-based, so it redraws on change rather than every frame.
 */

import { augurNow } from '../../engine/augur.js';
import type { Game } from '../../engine/game.js';
import type { Cell } from '../../engine/types.js';
import type { Lesson } from '../../sim/tutor.js';
import {
  type BeatenLook,
  type CreatureGlyph,
  DEFAULT_DIGIT_SIZE,
  DEFAULT_HIGHLIGHT_WIDTH,
  DEFAULT_LONG_PRESS,
  DEFAULT_MAX_ZOOM,
  type HighlightStyle,
} from '../presentation.js';
import type { TypeTheme } from '../looktypes.js';
import { PIP_FAMILY, glyphChar, isGlyphPip } from '../pipsymbols.js';
import { MARK_COLOR } from '../theme.js';
import { DEFAULT_TIERS, type TierPalette } from '../tiercolors.js';
import { FONTS, type GameFont } from '../typefaces.js';
import type { VictorySource, VictorySprite } from '../victory/play.js';
import {
  type Layout,
  MIN_CELL,
  boardSize,
  centreOf,
  contentBox,
  coordsAt,
  fittedCellFor,
  resolveWrapped,
} from './geometry.js';
import { BoardInput, type InputHost } from './input.js';
import {
  drawBonds,
  drawBoxRules,
  drawGhostBand,
  drawHighlight,
  drawPointer,
  drawReach,
  drawSeams,
  drawSilhouette,
  drawSprinkles,
} from './overlays.js';
import {
  type Paint,
  drawAnnotation,
  drawAugur,
  drawCensus,
  drawOccupied,
  drawOpen,
  drawTile,
} from './paint.js';

/**
 * The presentation settings the renderer actually reads. Passed in rather than reached for, so
 * the view stays a pure function of (game, theme, display) and a test can drive it without a
 * settings store.
 */
export interface BoardDisplay {
  /** Ceiling for manual zoom, in CSS pixels per cell. */
  maxCell: number;
  /** Whether a board opens at the ceiling, panning when it does not fit, rather than fitted. */
  startAtCeiling: boolean;
  /** The face for every number, mark and pencil note on the board, and a creature's digit. */
  font: GameFont;
  /** What a creature is drawn as: its pips, its tier as a digit, or both. */
  glyph: CreatureGlyph;
  /** How the cursor lights the board, or null for not at all. */
  highlight: HighlightStyle | null;
  /** The colour it lights a cell in when a click there would land; where one would not, red. */
  highlightColor: string;
  /** How thick the highlight's line is, in CSS pixels. */
  highlightWidth: number;
  /** How a beaten creature is drawn: dimmed, struck through, both or neither. */
  beatenLook: BeatenLook;
  /** How large the numbers, marks and pencil notes are drawn, as a multiple of their own size. */
  digitScale: number;
  /** Whether the cells the crawl rule keeps out of reach are shaded. */
  reachShading: boolean;
  /** The colour of a mark, a pencil note (dimmed) and a wrapped board's seam. */
  markColor: string;
  /** How long a touch holds a cell before it does what a right-click does, in ms; 0 for never. */
  longPressMs: number;
  /** Whether every beaten creature shows the number under it, not only the hovered one. */
  beatenNumbers: boolean;
  /** The colour a creature of each tier is drawn in, and the halo of tiers 6 to 9. */
  tierColors: TierPalette;
}

/** The cell size, in CSS pixels, before the first fit. */
const INITIAL_CELL = 32;
/** The smallest stage, in CSS pixels each way, a fit sizes the canvas to. */
const MIN_STAGE_PX = 120;
/** The stage a fit assumes while the canvas has no parent to measure. */
const FALLBACK_STAGE = { w: 960, h: 520 } as const;
/** What a fit leaves between the canvas and its stage, in CSS pixels, across each axis. */
const STAGE_PADDING = 8;
/** The most device pixels per CSS pixel the canvas is drawn at, however dense the screen. */
const MAX_DPR = 3;

/** The renderer's own defaults, which the game's own settings resolve to; the tests start here. */
export const DEFAULT_DISPLAY: BoardDisplay = {
  maxCell: DEFAULT_MAX_ZOOM,
  startAtCeiling: false,
  font: FONTS['jetbrains-mono'],
  glyph: 'pips',
  highlight: 'neighbours',
  highlightColor: MARK_COLOR,
  highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
  beatenLook: 'dimStrike',
  digitScale: DEFAULT_DIGIT_SIZE,
  reachShading: false,
  markColor: MARK_COLOR,
  longPressMs: DEFAULT_LONG_PRESS,
  beatenNumbers: false,
  tierColors: DEFAULT_TIERS,
};

/**
 * How this view is being used. The settings screen renders its examples with this same class
 * rather than a simplified copy (decision 0025), which needs two things: a thumbnail must not
 * eat the page's scroll wheel, and it must render at a size it was told.
 */
export interface BoardViewOptions {
  /** Attach pointer and wheel input. Previews pass false. */
  interactive?: boolean;
  /** Render at exactly this cell size, sizing the canvas to the board. */
  fixedCell?: number;
}

/** What a click, a right-click and the cursor on the board report to the view's owner. */
export interface BoardViewCallbacks {
  onOpen: (x: number, y: number) => void;
  /** Right-click / long-press: cycle the mark on a covered cell. */
  onCycleMark: (x: number, y: number) => void;
  onHover: (cell: Cell | null) => void;
  /**
   * Whether a click on this cell would land, in whatever mode the caller is in; the cursor is
   * coloured by it. Left out, the answer is the crawl rule's.
   */
  lands?: (cell: Cell) => boolean;
}

/**
 * A board drawn on a canvas: the game, its theme and display, the cell size and origin, and the
 * hovered cell. `render` repaints it whole; the game screen, the guide's diagrams and the settings
 * screen's examples are all one of these.
 */
export class BoardView implements InputHost {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cb: BoardViewCallbacks;
  private game: Game | null = null;
  private theme: TypeTheme | null = null;
  private display: BoardDisplay = DEFAULT_DISPLAY;

  private cellPxValue = INITIAL_CELL;
  /**
   * The size fit() chose. Zoom stops here on the way out: shrinking the board below what the
   * stage can already hold gains nothing, so the only way out is back to the fit.
   */
  private fittedCellValue = INITIAL_CELL;
  private originXValue = 0;
  private originYValue = 0;
  private hoveredCellValue: Cell | null = null;

  /**
   * A cell held permanently highlighted, for the cursor-highlight examples: a thumbnail has no
   * cursor on it, and on a touch screen it never will.
   */
  private pinned: Cell | null = null;

  /**
   * True while a board-clear effect has taken the creature glyphs over. The effect draws them on
   * its own layer, so the board must stop drawing them or every creature appears to leave a ghost
   * of itself behind. Put back when the effect ends, including when it is cut short.
   */
  private creaturesHidden = false;

  private canPanValue = false;
  private readonly options: BoardViewOptions;

  /**
   * What the tutor, or a school lesson's step, is pointing at on the board: a proof's numbers,
   * cells and conclusions (docs/teaching-plan.md). Null while nothing is.
   */
  private pointer: Lesson | null = null;

  /**
   * The faces this view has asked the browser for and is waiting on, so a repaint is requested
   * once per face rather than once per frame drawn before it arrives: the board's font, and the
   * pip font's face for a symbol the creatures are drawn as.
   */
  private readonly awaitingFonts = new Set<string>();

  /**
   * Watches the stage, so the board refits when the space it has changes for any reason, not
   * only when the window does: the HUD's readouts wrapping, a face arriving a frame late, the
   * text size moving every line. Created on the first fit, because the stage is the canvas's
   * parent and that is only known once it is attached; disconnects itself when the canvas leaves
   * the page.
   */
  private stageWatch: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, cb: BoardViewCallbacks, options: BoardViewOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.cb = cb;
    this.options = options;
    // A preview attaches nothing. The wheel handler calls preventDefault, so forty thumbnails
    // would be forty holes in the settings page's scrolling.
    if (options.interactive !== false) new BoardInput(this).attach();
  }

  // --------------------------------------------------------------- the game

  setGame(game: Game, theme: TypeTheme, display: BoardDisplay = DEFAULT_DISPLAY): void {
    this.game = game;
    this.theme = theme;
    this.display = display;
    this.fit(false, true);
  }

  /**
   * Re-theme a board already on screen. The settings screen is reachable mid-board, so a palette
   * or font change has to land on the board the player came from. The zoom ceiling may have
   * moved under the current cell size.
   */
  setDisplay(theme: TypeTheme, display: BoardDisplay): void {
    this.theme = theme;
    this.display = display;
    this.cellPxValue = Math.min(this.cellPx, Math.max(this.fittedCell, display.maxCell));
    this.clampOrigin();
    this.render();
  }

  /** Point at a proof, or at nothing. The pointer is drawn over everything but the cursor. */
  setPointer(pointer: Lesson | null): void {
    if (this.pointer === pointer) return;
    this.pointer = pointer;
    this.render();
  }

  /**
   * Hold a cell highlighted regardless of the pointer. Preview use only; it survives the cursor
   * leaving the canvas, because the point of it is to be visible when nothing is hovering.
   */
  pinHover(x: number, y: number): void {
    const cell = this.game?.cellAt(x, y) ?? null;
    this.pinned = cell;
    this.hoveredCellValue = cell;
    this.render();
  }

  // ----------------------------------------------------------------- layout

  private get layout(): Layout {
    return {
      hex: this.game?.config.topology === 'hex',
      cellPx: this.cellPx,
      originX: this.originX,
      originY: this.originY,
      cols: this.game?.config.width ?? 0,
      rows: this.game?.config.height ?? 0,
    };
  }

  /**
   * Largest whole-pixel cell the stage can hold, then centre the board. `keepZoom` is for a
   * refit the player did not ask for, the stage having changed size under them: a zoom they
   * chose is kept, clamped to the new stage, rather than thrown away because the HUD re-wrapped.
   * `opening` is a board just set, which starts at the ceiling when the player has asked for
   * that; F and a resize fit it, as ever.
   */
  fit(keepZoom = false, opening = false): void {
    const game = this.game;
    if (!game) return;

    // A fixed-size view is the whole board at a known scale, so the canvas is sized to the board
    // instead of the board to the canvas.
    const fixed = this.options.fixedCell;
    if (fixed) {
      this.cellPxValue = fixed;
      this.fittedCellValue = fixed;
      const { w, h } = boardSize(this.layout);
      this.resizeCanvas(w, h);
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
    const availW = Math.max(MIN_STAGE_PX, (box?.clientWidth ?? FALLBACK_STAGE.w) - STAGE_PADDING);
    const availH = Math.max(MIN_STAGE_PX, (box?.clientHeight ?? FALLBACK_STAGE.h) - STAGE_PADDING);

    const fitted = fittedCellFor(game, availW, availH);
    // The ceiling caps magnification only. A small board is held at the player's limit rather
    // than blown up to fill the stage; a board too big for the stage still shrinks past it, all
    // the way down to MIN_CELL, so the setting can never leave a board unreachable.
    const zoomed = keepZoom && this.cellPx > this.fittedCell;
    this.fittedCellValue = Math.max(MIN_CELL, Math.min(this.display.maxCell, fitted));
    const ceiling = Math.max(this.fittedCell, this.display.maxCell);
    this.cellPxValue = zoomed
      ? Math.max(this.fittedCell, Math.min(this.cellPx, ceiling))
      : opening && this.display.startAtCeiling
        ? ceiling
        : this.fittedCell;

    this.resizeCanvas(availW, availH);
    this.clampOrigin();
    this.render();
  }

  /**
   * Centre the board when it fits, and stop it being dragged off-screen when it does not. Also
   * decides whether panning is a thing at all.
   */
  private clampOrigin(): void {
    const availW = this.canvas.clientWidth;
    const availH = this.canvas.clientHeight;
    const { w, h } = boardSize(this.layout);

    this.originXValue =
      w <= availW ? Math.round((availW - w) / 2) : Math.min(0, Math.max(availW - w, this.originX));
    this.originYValue =
      h <= availH ? Math.round((availH - h) / 2) : Math.min(0, Math.max(availH - h, this.originY));

    this.canPanValue = w > availW || h > availH;
    this.canvas.style.cursor = this.canPan ? 'grab' : 'pointer';
  }

  private resizeCanvas(cssW: number, cssH: number): void {
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  // ------------------------------------------------------------------ input

  get ready(): boolean {
    return this.game !== null;
  }
  get cellPx(): number {
    return this.cellPxValue;
  }
  get fittedCell(): number {
    return this.fittedCellValue;
  }
  get maxCell(): number {
    return this.display.maxCell;
  }
  get originX(): number {
    return this.originXValue;
  }
  get originY(): number {
    return this.originYValue;
  }
  get canPan(): boolean {
    return this.canPanValue;
  }
  get longPressMs(): number {
    return this.display.longPressMs;
  }
  get hovered(): Cell | null {
    return this.hoveredCellValue;
  }

  cellAtClient(clientX: number, clientY: number): Cell | null {
    const game = this.game;
    if (!game) return null;
    const rect = this.canvas.getBoundingClientRect();
    const { col, row } = coordsAt(this.layout, clientX - rect.left, clientY - rect.top);
    return resolveWrapped(game, col, row);
  }

  zoomAt(nextCell: number, px: number, py: number): void {
    // Floored at the fitted size, not at MIN_CELL: zooming out past the fit only shrinks the
    // board inside a stage that already had room for it.
    const clamped = Math.max(this.fittedCell, Math.min(this.display.maxCell, nextCell));
    if (clamped === this.cellPx) return;
    const bx = (px - this.originX) / this.cellPx;
    const by = (py - this.originY) / this.cellPx;
    this.cellPxValue = clamped;
    this.originXValue = Math.round(px - bx * clamped);
    this.originYValue = Math.round(py - by * clamped);
    this.clampOrigin();
    this.render();
  }

  panTo(originX: number, originY: number): void {
    this.originXValue = originX;
    this.originYValue = originY;
    this.clampOrigin();
    this.render();
  }

  pinchTo(cell: number, originX: number, originY: number): void {
    this.cellPxValue = cell;
    this.originXValue = originX;
    this.originYValue = originY;
    this.clampOrigin();
    this.render();
  }

  hover(cell: Cell | null): void {
    this.hoveredCellValue = cell;
    this.cb.onHover(cell);
    this.render();
  }

  leave(): void {
    // Back to the pinned cell rather than to nothing, so a preview that is demonstrating a
    // highlight keeps demonstrating it.
    if (this.hoveredCellValue !== this.pinned) {
      this.hoveredCellValue = this.pinned;
      this.cb.onHover(null);
      this.render();
    }
  }

  onOpen(x: number, y: number): void {
    this.cb.onOpen(x, y);
  }

  onCycleMark(x: number, y: number): void {
    this.cb.onCycleMark(x, y);
  }

  // ----------------------------------------------------------------- render

  /**
   * Repaint once the board's faces have loaded, if they have not yet. The interface reflows when a
   * face lands and the board cannot: a canvas keeps whatever it last drew. Asking is also what
   * starts the download.
   */
  private awaitFont(): void {
    const face = this.display.font;
    this.awaitFace(`${face.weight} 16px ${face.stack}`);
    const pip = this.theme?.pip;
    // The pip font is one family of several faces, each holding some of the symbols, so it is
    // the face for this symbol that is waited on.
    if (pip && isGlyphPip(pip)) this.awaitFace(`16px ${PIP_FAMILY}`, glyphChar(pip));
  }

  private awaitFace(probe: string, text?: string): void {
    const key = `${probe}|${text ?? ''}`;
    if (this.awaitingFonts.has(key) || document.fonts.check(probe, text)) return;
    this.awaitingFonts.add(key);
    document.fonts.load(probe, text).then(
      () => {
        this.awaitingFonts.delete(key);
        this.render();
      },
      () => {
        this.awaitingFonts.delete(key);
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

    const p: Paint = {
      ctx,
      layout: this.layout,
      game,
      theme,
      tierColors: this.display.tierColors,
      font: this.display.font,
      glyph: this.display.glyph,
      beatenLook: this.display.beatenLook,
      digitScale: this.display.digitScale,
      reachShading: this.display.reachShading,
      markColor: this.display.markColor,
      hovered: this.hoveredCellValue,
      beatenNumbers: this.display.beatenNumbers,
      creaturesHidden: this.creaturesHidden,
    };

    drawGhostBand(p);

    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present) continue; // a hole is drawn as nothing at all
        const { cx, cy } = centreOf(p.layout, cell.x, cell.y);
        if (cell.open) drawOpen(p, cell, cx, cy);
        else if (cell.occupied) drawOccupied(p, cx, cy);
        else drawTile(p, cell, cx, cy);
      }
    }
    // Over the tiles, since a sprinkle lies across two of them, and under what is written on them,
    // so a mark or a note stays readable on a sprinkle.
    drawSprinkles(p);
    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present) continue;
        const { cx, cy } = centreOf(p.layout, cell.x, cell.y);
        if (!cell.open && !cell.occupied) drawAnnotation(p, cell, cx, cy);
        if (cell.census !== null) drawCensus(p, cell, cx, cy);
        const augur = augurNow(cell, game.neighboursOf(cell));
        if (augur) drawAugur(p, augur, cx, cy);
      }
    }

    drawReach(p);
    // After the cells, so the board's edge is a clean line rather than something each rim cell
    // paints half of its own bevel over.
    drawSilhouette(p);
    drawBoxRules(p);
    drawBonds(p);
    drawSeams(p);

    if (this.pointer && game.status === 'playing') drawPointer(p, this.pointer);

    const hovered = this.hoveredCellValue;
    if (hovered && game.status === 'playing' && this.display.highlight) {
      const lands = (cell: Cell): boolean =>
        this.cb.lands ? this.cb.lands(cell) : game.inReach(cell);
      drawHighlight(p, hovered, {
        style: this.display.highlight,
        color: this.display.highlightColor,
        lands,
        width: this.display.highlightWidth,
      });
    }
  }

  // ----------------------------------------------------- board-clear effects

  /**
   * Stop, or resume, drawing the board's own creature glyphs. Only the board-clear effect should
   * touch this, and only for as long as it is running.
   */
  setCreaturesHidden(hidden: boolean): void {
    if (this.creaturesHidden === hidden) return;
    this.creaturesHidden = hidden;
    this.render();
  }

  /**
   * Where every creature glyph is right now, in CSS pixels relative to this canvas, fought or not:
   * a win uncovers the whole board, so a search board's creatures, never touched, are here too.
   */
  creatureSprites(): VictorySprite[] {
    const game = this.game;
    if (!game) return [];
    const out: VictorySprite[] = [];
    const layout = this.layout;
    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present || cell.tier <= 0) continue;
        const { cx, cy } = centreOf(layout, cell.x, cell.y);
        out.push({ x: cx, y: cy, size: contentBox(layout, cx, cy).size, tier: cell.tier });
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

  // --------------------------------------------------------------- readouts

  /** The cell under the cursor, for keyboard marking. */
  get hoveredCell(): Cell | null {
    return this.hoveredCellValue;
  }

  /** Current cell size in CSS pixels, for the dev handle and the tests. */
  get cellSize(): number {
    return this.cellPx;
  }

  /** Step the zoom from a button or key, anchored on the stage centre. */
  nudgeZoom(delta: number): void {
    this.zoomAt(this.cellPx + delta, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }
}
