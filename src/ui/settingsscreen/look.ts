/**
 * The Presentation section's drawn settings: creature icons, board palette, the board's font and
 * the interface's, text size, the game types' palette strip, the cursor highlight, the strike-through and the zoom ceiling. Every
 * example is a real board, or for the interface a copy of the HUD (decision 0025).
 */

import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import { HIGHLIGHT_PIN, highlightSampleBoard, zoomSampleBoard } from '../preview.js';
import {
  DEFAULT,
  MAX_MAX_ZOOM,
  MAX_TEXT_SIZE,
  MIN_MAX_ZOOM,
  MIN_TEXT_SIZE,
  OFF,
  HIGHLIGHT_NAMES,
  type HighlightStyle,
  type MenuStrip,
} from '../settings.js';
import { PIP_NAMES, PIP_SHAPES, tierColor } from '../theme.js';
import { LOOK_IDS, type PipShape, lookFor, themeFor } from '../looks.js';
import { FONTS, FONT_IDS, type FontId, type GameFont, LEGIBLE_FONT } from '../typefaces.js';
import { type ScreenContext, typeName } from './context.js';
import { CHIP_CELL, renderPreview } from './render.js';
import { type Choice, choiceRow, gallery, slider, wideRow } from './widgets.js';

export function iconsRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId, currentTheme } = ctx;
  choiceRow(ctx.host, host, {
    label: 'Creature icons',
    hint:
      'The shape of a creature’s pips. Pip colour stays global — a tier 4 is the same ' +
      'colour everywhere — and a creature is only ever visible once you have beaten it, which ' +
      'is why the examples show defeated ones.',
    title: 'Choose creature icons',
    current: p.icons,
    fallback: {
      value: DEFAULT,
      label: `Default — ${PIP_NAMES[themeFor(typeId).pip]}`,
      example: ctx.chipBoard({ ...currentTheme, pip: themeFor(typeId).pip }),
    },
    options: PIP_SHAPES.map((shape): Choice => ({
      value: shape,
      label: PIP_NAMES[shape],
      example: ctx.chipBoard({ ...currentTheme, pip: shape }),
    })),
    onPick: (v) => ctx.pick({ icons: v as PipShape | typeof DEFAULT }),
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
    onPick: (v) => ctx.pick({ palette: v }),
  });
}

/**
 * Each tile names the ladder the face belongs to, the first in ladder order if several wear it;
 * "Pirata One" alone says nothing about why.
 */
function fontOwner(id: FontId): string {
  if (id === LEGIBLE_FONT) return 'easiest to read';
  const owner = LOOK_IDS.find((t) => lookFor(t).font === id);
  return owner ? typeName(owner) : '';
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
      level.style.color = tierColor(1);
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
    onPick: (v) => ctx.pick({ interfaceFont: v as FontId | typeof DEFAULT }),
  });
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
      (v) => {
        // Rebuilding reflows everything above this row, so hold the row where the player's
        // pointer left it rather than where the scroll offset says.
        const before = textControl.getBoundingClientRect().top;
        ctx.pick({ textSize: v });
        const after = document
          .querySelector('[data-setting="textSize"]')
          ?.getBoundingClientRect().top;
        if (after !== undefined) window.scrollBy(0, after - before);
      },
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

/** Each option is shown on a copy of this ladder's own card from the ladder list. */
export function menuStripRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId } = ctx;
  const card = (strip: MenuStrip) => (): HTMLElement => {
    const demo = el('div', `type-card strip-${strip} strip-demo`);
    demo.append(el('span', 'type-name', typeName(typeId)));
    demo.append(el('span', 'type-meta', 'Board 1'));
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

/** Drawn on the grid of the ladder the player came from: hex on HIVE, square boxes elsewhere. */
export function highlightRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId, currentTheme } = ctx;
  const hex = ladders.find((t) => t.id === typeId)?.topology === 'hex';
  const highlightChip = (highlight: HighlightStyle | null) => () =>
    renderPreview(
      highlightSampleBoard(hex ? 'hex' : 'square'),
      currentTheme,
      ctx.display({ highlight }),
      { cell: CHIP_CELL, pin: HIGHLIGHT_PIN },
    ).canvas;

  wideRow(
    host,
    '3×3 cursor highlight',
    hex
      ? 'What the cell under the cursor lights up, on this ladder’s hexagons. The default follows ' +
          'real adjacency, so it lights the six cells around it, where the flat block is always ' +
          'the same eight.'
      : 'What the cell under the cursor lights up. On square cells the default and the flat block ' +
          'light the same eight; they part on a hex board, where the default lights six, and across ' +
          'a wrapped edge, which only the default jumps.',
    gallery(
      [
        {
          value: DEFAULT,
          label: 'Game type default — true neighbours',
          example: highlightChip('neighbours'),
        },
        ...(Object.keys(HIGHLIGHT_NAMES) as HighlightStyle[]).map((id): Choice => ({
          value: id,
          label: HIGHLIGHT_NAMES[id],
          example: highlightChip(id),
        })),
        { value: OFF, label: 'Off — no highlight', example: highlightChip(null) },
      ],
      p.highlight,
      (v) => ctx.pick({ highlight: v as HighlightStyle | typeof DEFAULT | typeof OFF }),
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
