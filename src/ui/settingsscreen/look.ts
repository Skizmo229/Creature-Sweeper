/**
 * The Presentation section's drawn settings: creature icons (the window of symbols behind the
 * custom tile is in `symbols.ts`) and colours (the custom colours' window is in `customtiers.ts`),
 * board palette, the board's font and the interface's, text size, the game types' palette strip,
 * the cursor highlight and its colour (the custom colour's window is in `customcolor.ts`), the
 * strike-through and the zoom ceiling. Every example is a
 * real board, or for the interface a copy of the HUD (decision 0025).
 */

import type { BoardDisplay } from '../board/view.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import {
  HIGHLIGHT_PIN,
  highlightSampleBoard,
  highlightSampleLands,
  tierSampleBoard,
  zoomSampleBoard,
} from '../preview.js';
import {
  type BeatenLook,
  CUSTOM_TIERS,
  DEFAULT,
  DEFAULT_MAX_ZOOM,
  MAX_MAX_ZOOM,
  MIN_MAX_ZOOM,
  OFF,
  HIGHLIGHT_COLORS,
  HIGHLIGHT_NAMES,
  type HighlightStyle,
  type IconChoice,
  type TierColorChoice,
} from '../presentation.js';
import { PIP_NAMES, PIP_SHAPES } from '../pips.js';
import { OUT_OF_REACH_COLOR, pipName } from '../theme.js';
import { DEFAULT_TIERS, TIER_PRESETS, type TierPalette, tierColor } from '../tiercolors.js';
import { LOOK_IDS, lookFor, themeFor } from '../looks.js';
import { SYMBOL_COUNT, isGlyphPip } from '../pipsymbols.js';
import { FONTS, FONT_IDS, type FontId, type GameFont, LEGIBLE_FONT } from '../typefaces.js';
import { type ScreenContext, typeName } from './context.js';
import { openColorWindow } from './customcolor.js';
import { openTierWindow } from './customtiers.js';
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
      'The shape of a creature’s pips, or any Dingbats or Wingdings symbol. Colour is the next ' +
      'setting. The examples show beaten creatures, the only kind you see.',
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

/** The creature colours' example: one beaten creature of every tier, drawn in `tierColors`. */
function tierChip(ctx: ScreenContext, tierColors: TierPalette): HTMLElement {
  return renderPreview(
    tierSampleBoard(),
    ctx.currentTheme,
    ctx.display({ highlight: null, tierColors }),
    { cell: ctx.chipCell },
  ).canvas;
}

/** What the Custom tile shows before any colours are mixed: a box the size of the example. */
function tierPlaceholder(ctx: ScreenContext): HTMLElement {
  const box = el('div', 'picker-placeholder', 'Any colour for any tier');
  box.style.height = `${tierSampleBoard().config.height * ctx.chipCell}px`;
  return box;
}

/**
 * The creatures' colours: the game's own, the presets, and a palette of the player's own from the
 * window behind the Custom tile, which keeps it while a preset is chosen and opens on it.
 */
export function tierColorsRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, typeId } = ctx;
  const chip = (tierColors: TierPalette) => (): HTMLElement => tierChip(ctx, tierColors);
  const own = p.customTierColors;
  const starts = [
    { name: 'Default', palette: DEFAULT_TIERS },
    ...TIER_PRESETS.map((t) => ({ name: t.name, palette: t.palette })),
    ...(own ? [{ name: 'Your own', palette: own }] : []),
  ];
  // Lit when the player's own colours are in force; clicking it opens the window either way.
  const custom: Choice = {
    value: own ? CUSTOM_TIERS : '',
    label: own ? 'Custom — your own' : 'Custom — any colours',
    example: own ? chip(own) : () => tierPlaceholder(ctx),
    open: () =>
      openTierWindow(ctx.host, {
        current: own ?? settings.tierColors(typeId),
        starts,
        example: (tierColors) => tierChip(ctx, tierColors),
        onUse: (palette) => ctx.pick({ tierColors: CUSTOM_TIERS, customTierColors: palette }),
      }),
  };

  wideRow(
    host,
    'Creature colours',
    'The colour of each tier: its creatures, the level number and the LV buttons. Tiers 6 to 9 ' +
      'also wear a halo. Distinct stays apart under red–green or blue–yellow colour blindness.',
    gallery(
      [
        { value: DEFAULT, label: 'Default — five hues, then haloed', example: chip(DEFAULT_TIERS) },
        ...TIER_PRESETS.map((t): Choice => ({
          value: t.id,
          label: `${t.name} — ${t.blurb}`,
          example: chip(t.palette),
        })),
        custom,
      ],
      p.tierColors,
      (v) => ctx.pick({ tierColors: v as TierColorChoice }),
    ),
  );
}

export function paletteRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId, currentPip } = ctx;
  choiceRow(ctx.host, host, {
    label: 'Board palette',
    hint: 'Borrow another ladder’s colours for the board. The menus keep this ladder’s own accent.',
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
 * share one, decision 0031); "Pirata One" alone says nothing about why. A face no ladder wears
 * says what it is for instead.
 */
function fontOwner(id: FontId): string {
  const blurb = FONTS[id].blurb;
  if (blurb) return blurb;
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
      'The numbers and marks on the board. Every ladder has a face of its own; ' +
      `${FONTS[LEGIBLE_FONT].name} was designed for low vision and keeps every digit distinct.`,
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
export function hudCopy(
  cls: string,
  tierColors: TierPalette,
  count: number = HUD_READOUTS.length,
): HTMLElement {
  const copy = el('div', `hud ${cls}`);
  for (const [key, text] of HUD_READOUTS.slice(0, count)) {
    const readout = el('span', `hud-item hud-${key}`, text);
    if (key === 'lv') {
      // Level 1, in tier 1's colour, as the real readout draws it.
      const level = el('span', 'hud-level-num', '1');
      level.style.color = tierColor(tierColors, 1);
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
function hudInFace(face: GameFont, tierColors: TierPalette): () => HTMLElement {
  return () => {
    const copy = hudCopy('font-demo', tierColors, 2);
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
    hint: 'The HUD, the menus and this screen. The title keeps its own face unless you choose one here.',
    title: 'Choose an interface font',
    current: p.interfaceFont,
    fallback: {
      value: DEFAULT,
      label: `Default — ${FONTS[ident.font].name}`,
      example: hudInFace(FONTS[ident.font], ctx.display().tierColors),
      labelFont: FONTS[ident.font],
    },
    options: FONT_IDS.map((id): Choice => ({
      value: id,
      label: [FONTS[id].name, fontOwner(id)].filter(Boolean).join(' — '),
      example: hudInFace(FONTS[id], ctx.display().tierColors),
      labelFont: FONTS[id],
    })),
    sorts: fontSorts(),
    onPick: (v) => ctx.pick({ interfaceFont: v as FontId | typeof DEFAULT }),
  });
}

/**
 * The cursor highlight's example: its board held lit, drawn with the presentation as it stands but
 * for `over`, on the grid of the ladder the player came from: hex on HIVE, square boxes elsewhere.
 * The covered cells right of the lit one are out of reach, so the example shows a refusal too.
 */
export function highlightChip(ctx: ScreenContext, over: Partial<BoardDisplay>): () => HTMLElement {
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
  const refusal = ' A click that would do nothing is crossed out instead, as on the right.';

  wideRow(
    host,
    '3×3 cursor highlight',
    (hex
      ? 'What the cursor lights up on this ladder’s hexagons: the default lights the six real ' +
        'neighbours, the flat block always the same eight.'
      : 'What the cursor lights up. On squares the first and the block light the same eight; ' +
        'they differ on hexagons and across a wrapped edge, which only the default follows. The ' +
        'last lights the numbers that see a covered cell.') + refusal,
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
        title: 'Custom highlight colour',
        blurb:
          'Mix a colour from red, green and blue, or type it in hex. Red is taken: it crosses ' +
          'out a click that would do nothing.',
        mixedLabel: 'A click that lands',
        taken: [
          {
            color: OUT_OF_REACH_COLOR,
            label: 'A click that would do nothing',
            name: 'the red that crosses out a click that would do nothing',
          },
        ],
        current: settings.highlightColor(typeId),
        example: (color) => chip(color)(),
        onUse: pick,
      }),
  };

  wideRow(
    host,
    'Cursor highlight colour',
    'The box round the cell under the cursor when a click would land. A click that would do ' +
      'nothing is crossed out in red whatever this is; under red–green colour blindness magenta ' +
      'is the easiest to tell from that red.' +
      (style ? '' : ' The highlight is off above, so none of this shows until it is on.'),
    gallery(
      [
        {
          value: DEFAULT,
          label: `Game type default — ${p.markColor === DEFAULT ? 'green' : 'the mark colour'}`,
          example: chip(settings.markColor(typeId)),
        },
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

/** How a beaten creature is drawn, each look on the standard example. */
export function beatenLookRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  const look = (beatenLook: BeatenLook, label: string): Choice => ({
    value: beatenLook,
    label,
    example: ctx.chipBoard(currentTheme, { beatenLook }),
  });
  wideRow(
    host,
    'Beaten creatures',
    'How a beaten creature is drawn. Dimmed or greyed reads better at small cell sizes, where a ' +
      'stroke crosses the pips and an X crosses them twice; plain leaves the open floor under it ' +
      'to say it is beaten.',
    gallery(
      [
        look('dimStrike', 'Dimmed and struck through'),
        look('strike', 'Struck through'),
        look('dimCross', 'Dimmed and crossed out'),
        look('cross', 'Crossed out'),
        look('dim', 'Dimmed'),
        look('grey', 'Greyed'),
        look('plain', 'Plain'),
      ],
      p.beatenLook,
      (v) => ctx.pick({ beatenLook: v as BeatenLook }),
    ),
  );
}

/**
 * The example is drawn at the exact size being chosen, so the slider reads in the units it
 * controls. Redrawn in place rather than rebuilding the screen: this fires on every frame of a
 * drag, and forty thumbnails a frame is not a slider.
 */
export function zoomRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
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
        ctx.set({ maxZoom: cell });
      },
      undefined,
      DEFAULT_MAX_ZOOM,
    ),
  );
  zoomControl.append(zoomBox);

  wideRow(
    host,
    'Maximum zoom in',
    'How far scroll and +/- can magnify a board, shown at actual size. Zooming out is limited ' +
      'only by what fits on screen.',
    zoomControl,
  );
}
