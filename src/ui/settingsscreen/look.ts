/**
 * The Presentation section's drawn settings: creature icons (the window of symbols behind the
 * custom tile is in `symbols.ts`), board palette, the board's font and the interface's, text
 * size, the game types' palette strip, the cursor highlight and its colour (the custom colour's
 * window is in `customcolor.ts`), the strike-through and the zoom ceiling. Every example is a
 * real board, or for the interface a copy of the HUD (decision 0025).
 */

import type { BoardDisplay } from '../board/view.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import {
  HIGHLIGHT_PIN,
  highlightSampleBoard,
  highlightSampleLands,
  sampleBoard,
  samplePin,
  zoomSampleBoard,
} from '../preview.js';
import {
  DEFAULT,
  MAX_MAX_ZOOM,
  MAX_PREVIEW_SIZE,
  MAX_TEXT_SIZE,
  MIN_MAX_ZOOM,
  MIN_PREVIEW_SIZE,
  MIN_TEXT_SIZE,
  OFF,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_NAMES,
  type HighlightStyle,
  type IconChoice,
  type MenuStrip,
} from '../settings.js';
import { MARK_COLOR, PIP_NAMES, PIP_SHAPES, pipName } from '../theme.js';
import { DEFAULT_TIERS, tierColor } from '../tiercolors.js';
import { LOOK_IDS, lookFor, themeFor } from '../looks.js';
import { SYMBOL_COUNT, isGlyphPip } from '../pipsymbols.js';
import { FONTS, FONT_IDS, type FontId, type GameFont, LEGIBLE_FONT } from '../typefaces.js';
import { type PresentationPatch, type ScreenContext, previewCell, typeName } from './context.js';
import { openColorWindow } from './customcolor.js';
import { CHIP_CELL } from './render.js';
import { renderPreview } from './render.js';
import { fontSorts, paletteSorts } from './sorts.js';
import { openSymbolWindow } from './symbols.js';
import { type Choice, choiceRow, gallery, slider, wideRow } from './widgets.js';

export function iconsRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId, currentTheme, currentPip } = ctx;
  const own = themeFor(typeId).pip;
  const symbol = isGlyphPip(p.icons) ? p.icons : null;
  const pick = (v: string): void => ctx.pick({ icons: v as IconChoice });
  // Lit when a symbol is the icon in force; clicking it opens the window of symbols either way.
  const custom: Choice = {
    value: symbol ?? '',
    label: symbol ? `Custom: ${pipName(symbol)}` : 'Custom — any symbol',
    example: symbol
      ? ctx.chipBoard({ ...currentTheme, pip: symbol })
      : () =>
          el('div', 'picker-placeholder', `${SYMBOL_COUNT} symbols from Dingbats and Wingdings`),
    open: () => openSymbolWindow(ctx, currentPip, pick),
  };
  choiceRow(ctx.host, host, {
    label: 'Creature icons',
    hint:
      'The shape of a creature’s pips, or any symbol from Dingbats and Wingdings. Pip colour ' +
      'stays global — a tier 4 is the same colour everywhere — and a creature is only ever ' +
      'visible once you have beaten it, which is why the examples show defeated ones.',
    title: 'Choose creature icons',
    current: p.icons,
    fallback: {
      value: DEFAULT,
      label: `Default — ${pipName(own)}`,
      example: ctx.chipBoard({ ...currentTheme, pip: own }),
    },
    options: [
      ...PIP_SHAPES.map((shape): Choice => ({
        value: shape,
        label: PIP_NAMES[shape],
        example: ctx.chipBoard({ ...currentTheme, pip: shape }),
      })),
      custom,
    ],
    onPick: pick,
  });
}

export function paletteRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId, currentPip } = ctx;
  choiceRow(ctx.host, host, {
    label: 'Board palette',
    hint:
      'Borrow another ladder’s colours for the board. The menus keep this ladder’s own ' +
      'accent, so the game stays navigable however far the board is repainted.',
    title: 'Choose a board palette',
    current: p.palette,
    fallback: {
      value: DEFAULT,
      label: `Default — ${typeName(typeId)}`,
      example: ctx.chipBoard({ ...themeFor(typeId), pip: currentPip }),
    },
    options: LOOK_IDS.map((id): Choice => ({
      value: id,
      label: typeName(id),
      example: ctx.chipBoard({ ...themeFor(id), pip: currentPip }),
    })),
    sorts: paletteSorts(),
    onPick: (v) => ctx.pick({ palette: v }),
  });
}

/**
 * Each tile names every ladder that wears the face, in the order the ladder list reads (two may
 * share one, decision 0031); "Pirata One" alone says nothing about why.
 */
function fontOwner(id: FontId): string {
  if (id === LEGIBLE_FONT) return 'easiest to read';
  return ladders
    .filter((t) => lookFor(t.id).font === id)
    .map((t) => t.name)
    .join(', ');
}

export function boardFontRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, ident, currentTheme } = ctx;
  choiceRow(ctx.host, host, {
    label: 'Board font',
    hint:
      'The numbers and marks on the board; the interface font, below, sets the HUD and the ' +
      'menus. Every ladder has a face of its own; ' +
      `${FONTS[LEGIBLE_FONT].name} belongs to none of them — it was designed for readers with ` +
      'low vision, and keeps every digit easy to tell apart.',
    title: 'Choose a board font',
    current: p.font,
    fallback: {
      value: DEFAULT,
      label: `Default — ${FONTS[ident.font].name}`,
      example: ctx.chipBoard(currentTheme, { font: FONTS[ident.font] }),
      labelFont: FONTS[ident.font],
    },
    options: FONT_IDS.map((id): Choice => ({
      value: id,
      label: [FONTS[id].name, fontOwner(id)].filter(Boolean).join(' — '),
      example: ctx.chipBoard(currentTheme, { font: FONTS[id] }),
      labelFont: FONTS[id],
    })),
    sorts: fontSorts(),
    onPick: (v) => ctx.pick({ font: v as FontId | typeof DEFAULT }),
  });
}

/** The HUD's readouts at the start of a board, keyed by the class each wears in play. */
const HUD_READOUTS = [
  ['hp', 'HP 10'],
  ['lv', 'Level '],
  ['ex', 'EXP 0'],
  ['ne', 'Next Level 6'],
] as const;

/**
 * A copy of the HUD's first `count` readouts, as an example. The real HUD's own classes, so each
 * readout reserves the width it does in play.
 */
function hudCopy(cls: string, count: number = HUD_READOUTS.length): HTMLElement {
  const copy = el('div', `hud ${cls}`);
  for (const [key, text] of HUD_READOUTS.slice(0, count)) {
    const readout = el('span', `hud-item hud-${key}`, text);
    if (key === 'lv') {
      // Level 1, in tier 1's colour, as the real readout draws it.
      const level = el('span', 'hud-level-num', '1');
      level.style.color = tierColor(DEFAULT_TIERS, 1);
      readout.append(level);
    }
    copy.append(readout);
  }
  return copy;
}

/**
 * An interface font's example: the HUD's first two readouts, set in the face. It declares its own
 * size correction, as anything wearing a face other than the page's must (see body in styles.css).
 */
function hudInFace(face: GameFont): () => HTMLElement {
  return () => {
    const copy = hudCopy('font-demo', 2);
    copy.style.fontFamily = face.stack;
    copy.style.setProperty('--ex-fix', String(face.exHeightFix ?? 1));
    return copy;
  };
}

/** A face picked here dresses this screen at once, so the page is an example as well as the tiles. */
export function interfaceFontRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, ident } = ctx;
  choiceRow(ctx.host, host, {
    label: 'Interface font',
    hint:
      'The HUD, the menus and this screen: everything but the board, which the board font ' +
      'above sets. The game’s title keeps a face of its own unless you choose one here.',
    title: 'Choose an interface font',
    current: p.interfaceFont,
    fallback: {
      value: DEFAULT,
      label: `Default — ${FONTS[ident.font].name}`,
      example: hudInFace(FONTS[ident.font]),
      labelFont: FONTS[ident.font],
    },
    options: FONT_IDS.map((id): Choice => ({
      value: id,
      label: [FONTS[id].name, fontOwner(id)].filter(Boolean).join(' — '),
      example: hudInFace(FONTS[id]),
      labelFont: FONTS[id],
    })),
    sorts: fontSorts(),
    onPick: (v) => ctx.pick({ interfaceFont: v as FontId | typeof DEFAULT }),
  });
}

/**
 * Save a setting that resizes the screen, from a slider in `control`. Rebuilding reflows
 * everything above the row, so the row is held where the player's pointer left it rather than
 * where the scroll offset says. `control` carries `data-setting`, so its rebuilt copy is found.
 */
function pickHoldingRow(ctx: ScreenContext, control: HTMLElement, patch: PresentationPatch): void {
  const before = control.getBoundingClientRect().top;
  ctx.pick(patch);
  const after = document
    .querySelector(`[data-setting="${control.dataset.setting}"]`)
    ?.getBoundingClientRect().top;
  if (after !== undefined) window.scrollBy(0, after - before);
}

/**
 * The whole page is the example, but not DURING a drag: resizing every line on the screen moves
 * the slider out from under the pointer. So a copy of the HUD follows the thumb, and the page
 * itself changes once, on release.
 */
export function textSizeRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p } = ctx;
  const textDemo = hudCopy('text-size-demo');
  const showTextSize = (size: number): void => {
    // Relative to what the page is already set at, which is what rem means.
    textDemo.style.setProperty('--demo-scale', String(size / p.textSize));
  };
  const textControl = el('div', 'settings-stack');
  textControl.dataset.setting = 'textSize';
  textControl.append(
    slider(
      MIN_TEXT_SIZE,
      MAX_TEXT_SIZE,
      0.05,
      p.textSize,
      (v) => `${Math.round(v * 100)}%`,
      showTextSize,
      (v) => pickHoldingRow(ctx, textControl, { textSize: v }),
    ),
  );
  textControl.append(textDemo);

  wideRow(
    host,
    'Text size',
    'The HUD, the menus and this screen. The board is left alone — it is sized by its cells, ' +
      'which the zoom controls.',
    textControl,
  );
}

/**
 * Every example board on this screen is drawn again at the new size, so, like the text size, the
 * screen changes on release; while the thumb moves, one thumbnail beside it follows. The zoom
 * example is left alone: it is drawn at the size it sets.
 */
export function previewSizeRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  const sample = el('div', 'preview-size-demo');
  const drawSample = (size: number): void => {
    sample.replaceChildren(
      renderPreview(sampleBoard(), currentTheme, ctx.display({ highlight: null }), {
        cell: previewCell(CHIP_CELL, size),
        pin: samplePin(),
      }).canvas,
    );
  };
  drawSample(p.previewSize);

  const control = el('div', 'settings-stack');
  control.dataset.setting = 'previewSize';
  control.append(
    slider(
      MIN_PREVIEW_SIZE,
      MAX_PREVIEW_SIZE,
      0.05,
      p.previewSize,
      (v) => `${Math.round(v * 100)}%`,
      drawSample,
      (v) => pickHoldingRow(ctx, control, { previewSize: v }),
    ),
  );
  control.append(sample);

  wideRow(
    host,
    'Preview size',
    'The example boards on this screen, and in the windows it opens. The zoom example below is ' +
      'left at the size it shows, since that size is its point.',
    control,
  );
}

/** Each option is shown on a copy of this ladder's own card from the ladder list. */
export function menuStripRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId } = ctx;
  const card = (strip: MenuStrip) => (): HTMLElement => {
    const demo = el('div', `type-card strip-${strip} strip-demo`);
    demo.append(el('span', 'type-name', typeName(typeId)));
    demo.append(el('span', 'type-meta', '0 boards cleared'));
    return demo;
  };
  wideRow(
    host,
    'Palette strip on the game types',
    'Where each card on the list of game types wears its ladder’s colour.',
    gallery(
      [
        { value: 'left', label: 'Default — down the left side', example: card('left') },
        { value: 'sides', label: 'Palette strip on vertical sides', example: card('sides') },
        { value: 'all', label: 'Palette strip on all sides', example: card('all') },
        { value: OFF, label: 'No palette strip', example: card(OFF) },
      ],
      p.menuStrip,
      (v) => ctx.pick({ menuStrip: v as MenuStrip }),
    ),
  );
}

/**
 * The cursor highlight's example: its board held lit, drawn with the presentation as it stands but
 * for `over`, on the grid of the ladder the player came from: hex on HIVE, square boxes elsewhere.
 * The covered cells right of the lit one are out of reach, so the example shows a refusal too.
 */
function highlightChip(ctx: ScreenContext, over: Partial<BoardDisplay>): () => HTMLElement {
  const hex = ladders.find((t) => t.id === ctx.typeId)?.topology === 'hex';
  return () =>
    renderPreview(
      highlightSampleBoard(hex ? 'hex' : 'square'),
      ctx.currentTheme,
      ctx.display(over),
      { cell: ctx.chipCell, pin: HIGHLIGHT_PIN, lands: highlightSampleLands },
    ).canvas;
}

export function highlightRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId } = ctx;
  const hex = ladders.find((t) => t.id === typeId)?.topology === 'hex';
  const chip = (highlight: HighlightStyle | null) => highlightChip(ctx, { highlight });
  const refusal =
    ' Where a click would do nothing, past the edge of your reach, a cell is crossed out instead ' +
    'of boxed, as on the right of these examples.';

  wideRow(
    host,
    '3×3 cursor highlight',
    (hex
      ? 'What the cell under the cursor lights up, on this ladder’s hexagons. The default follows ' +
        'real adjacency, so it lights the six cells around it, where the flat block is always ' +
        'the same eight.'
      : 'What the cell under the cursor lights up. On square cells the default and the flat block ' +
        'light the same eight; they part on a hex board, where the default lights six, and across ' +
        'a wrapped edge, which only the default jumps.') + refusal,
    gallery(
      [
        {
          value: DEFAULT,
          label: 'Game type default — true neighbours',
          example: chip('neighbours'),
        },
        ...(Object.keys(HIGHLIGHT_NAMES) as HighlightStyle[]).map((id): Choice => ({
          value: id,
          label: HIGHLIGHT_NAMES[id],
          example: chip(id),
        })),
        { value: OFF, label: 'Off — no highlight', example: chip(null) },
      ],
      p.highlight,
      (v) => ctx.pick({ highlight: v as HighlightStyle | typeof DEFAULT | typeof OFF }),
    ),
  );
}

/**
 * The highlight's colour: the game type's green, the presets, and any colour at all from the
 * window behind the Custom tile. Each is drawn in the player's own shape of highlight, or while it
 * is off in the default's, so a colour can be chosen before the highlight is turned back on.
 */
export function highlightColorRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, typeId } = ctx;
  const style = settings.highlightStyle(typeId);
  const chip = (color: string): (() => HTMLElement) =>
    highlightChip(ctx, { highlight: style ?? 'neighbours', highlightColor: color });
  const pick = (color: string): void => ctx.pick({ highlightColor: color });
  const preset = HIGHLIGHT_COLORS.some((c) => c.color === p.highlightColor);
  const own = p.highlightColor === DEFAULT || preset ? null : p.highlightColor;
  // Lit when a colour of the player's own is in force; clicking it opens the window either way.
  const custom: Choice = {
    value: own ?? '',
    label: own ? `Custom — ${own}` : 'Custom — any colour',
    example: own
      ? chip(own)
      : () => el('div', 'picker-placeholder', 'Any colour, mixed from red, green and blue'),
    open: () =>
      openColorWindow(ctx.host, {
        current: settings.highlightColor(typeId),
        example: (color) => chip(color)(),
        onUse: pick,
      }),
  };

  wideRow(
    host,
    'Cursor highlight colour',
    'The colour a cell under the cursor is boxed in when a click there would land. A cell where ' +
      'a click would do nothing is crossed out in red whatever this is, as on the right of these ' +
      'examples; with red–green colour blindness the default green is the hardest colour to tell ' +
      'from that red, and magenta the easiest, though the cross reads without either.' +
      (style ? '' : ' The highlight is off above, so none of this shows until it is back on.'),
    gallery(
      [
        { value: DEFAULT, label: 'Game type default — green', example: chip(MARK_COLOR) },
        ...HIGHLIGHT_COLORS.map((c): Choice => ({
          value: c.color,
          label: c.name,
          example: chip(c.color),
        })),
        custom,
      ],
      p.highlightColor,
      pick,
    ),
  );
}

export function strikeRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  wideRow(
    host,
    'Strike out defeated creatures',
    'The diagonal line across a creature you have beaten. With it off, the dimmed glyph carries ' +
      '“dealt with” on its own — which reads more cleanly at small cell sizes, where the stroke ' +
      'crosses the pips.',
    gallery(
      [
        {
          value: 'on',
          label: 'Struck through',
          example: ctx.chipBoard(currentTheme, { strikeDefeated: true }),
        },
        {
          value: 'off',
          label: 'Left plain',
          example: ctx.chipBoard(currentTheme, { strikeDefeated: false }),
        },
      ],
      p.strikeDefeated ? 'on' : 'off',
      (v) => ctx.pick({ strikeDefeated: v === 'on' }),
    ),
  );
}

/**
 * The example is drawn at the exact size being chosen, so the slider reads in the units it
 * controls. Redrawn in place rather than rebuilding the screen: this fires on every frame of a
 * drag, and forty thumbnails a frame is not a slider.
 */
export function zoomRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, currentTheme } = ctx;
  const zoomBox = el('div', 'zoom-demo');
  const drawZoom = (cell: number): void => {
    zoomBox.replaceChildren(
      renderPreview(zoomSampleBoard(), currentTheme, ctx.display(), { cell }).canvas,
    );
  };
  drawZoom(p.maxZoom);

  const zoomControl = el('div', 'settings-stack');
  zoomControl.append(
    slider(
      MIN_MAX_ZOOM,
      MAX_MAX_ZOOM,
      4,
      p.maxZoom,
      (v) => `${Math.round(v)}px per cell`,
      (v) => {
        const cell = Math.round(v);
        drawZoom(cell);
        settings.setPresentation({ maxZoom: cell });
      },
    ),
  );
  zoomControl.append(zoomBox);

  wideRow(
    host,
    'Maximum zoom in',
    'How far scroll and +/- can magnify a board, shown here at actual size. Zooming out is ' +
      'limited by what fits on screen, never by this — a board too big for the stage always shrinks ' +
      'past it.',
    zoomControl,
  );
}
