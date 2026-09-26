/**
 * The board on screen. Owns the game being shown, the presentation it is drawn with, the cell
 * size and origin, and the hovered cell; fits itself to its stage; and hands the drawing to the
 * painters in `paint.ts` and `overlays.ts` and the pointer to `input.ts`.
 *
 * Turn-based, so it redraws on change rather than every frame.
 */

import type { Game } from '../../engine/game.js';
import type { Cell } from '../../engine/types.js';
import { DEFAULT_MAX_ZOOM, type HighlightStyle } from '../settings.js';
import type { TypeTheme } from '../looks.js';
import { PIP_FAMILY, glyphChar, isGlyphPip } from '../pipsymbols.js';
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
  drawSeams,
  drawSilhouette,
} from './overlays.js';
import { type Paint, drawCensus, drawCovered, drawOpen } from './paint.js';

/**
 * The presentation settings the renderer actually reads. Passed in rather than reached for, so
 * the view stays a pure function of (game, theme, display) and a test can drive it without a
 * settings store.
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
}

const DEFAULT_DISPLAY: BoardDisplay = {
  maxCell: DEFAULT_MAX_ZOOM,
  font: FONTS['jetbrains-mono'],
  highlight: 'neighbours',
  strikeDefeated: true,
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

export class BoardView implements InputHost {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cb: BoardViewCallbacks;
  private game: Game | null = null;
  private theme: TypeTheme | null = null;
  private display: BoardDisplay = DEFAULT_DISPLAY;

  private cellPxValue = 32;
  /**
   * The size fit() chose. Zoom stops here on the way out: shrinking the board below what the
   * stage can already hold gains nothing, so the only way out is back to the fit.
   */
  private fittedCellValue = 32;
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
    this.fit();
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
   */
  fit(keepZoom = false): void {
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
    const availW = Math.max(120, (box?.clientWidth ?? 960) - 8);
    const availH = Math.max(120, (box?.clientHeight ?? 520) - 8);

    const fitted = fittedCellFor(game, availW, availH);
    // The ceiling caps magnification only. A small board is held at the player's limit rather
    // than blown up to fill the stage; a board too big for the stage still shrinks past it, all
    // the way down to MIN_CELL, so the setting can never leave a board unreachable.
    const zoomed = keepZoom && this.cellPx > this.fittedCell;
    this.fittedCellValue = Math.max(MIN_CELL, Math.min(this.display.maxCell, fitted));
    this.cellPxValue = zoomed
      ? Math.max(
          this.fittedCell,
          Math.min(this.cellPx, Math.max(this.fittedCell, this.display.maxCell)),
        )
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
    const dpr = Math.min(3, window.devicePixelRatio || 1);
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
      font: this.display.font,
      strikeDefeated: this.display.strikeDefeated,
      hovered: this.hoveredCellValue,
      creaturesHidden: this.creaturesHidden,
    };

    drawGhostBand(p);

    for (const row of game.grid) {
      for (const cell of row) {
        if (!cell.present) continue; // a hole is drawn as nothing at all
        const { cx, cy } = centreOf(p.layout, cell.x, cell.y);
        if (cell.open) drawOpen(p, cell, cx, cy);
        else drawCovered(p, cell, cx, cy);
        if (cell.census !== null) drawCensus(p, cell, cx, cy);
      }
    }

    // After the cells, so the board's edge is a clean line rather than something each rim cell
    // paints half of its own bevel over.
    drawSilhouette(p);
    drawBoxRules(p);
    drawBonds(p);
    drawSeams(p);

    const hovered = this.hoveredCellValue;
    if (hovered && game.status === 'playing' && this.display.highlight) {
      const lands = (cell: Cell): boolean =>
        this.cb.lands ? this.cb.lands(cell) : game.inReach(cell);
      drawHighlight(p, hovered, this.display.highlight, lands);
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
   * Where every creature glyph is right now, in CSS pixels relative to this canvas. Covered
   * creatures are included: a search board is won with its creatures still hidden, and a clear
   * effect that shows the player what they had been walking past is a better ending.
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
