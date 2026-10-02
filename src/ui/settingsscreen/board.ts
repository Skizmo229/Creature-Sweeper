/**
 * More of the Presentation section's settings, beside those in `look.ts`: what a creature is
 * drawn as, the mark colour, the size of the board's digits, the cursor highlight's thickness,
 * reach shading, and whether a board opens at the zoom ceiling. Every example is a real board
 * (decision 0025).
 */

import { RATIO_STEP } from '../../engine/settings.js';
import { el } from '../dom.js';
import { ladders } from '../ladders.js';
import { reachSampleBoard, sampleBoard, samplePin } from '../preview.js';
import {
  type CreatureGlyph,
  DEFAULT,
  DEFAULT_DIGIT_SIZE,
  DEFAULT_HIGHLIGHT_WIDTH,
  MARK_COLORS,
  MAX_DIGIT_SIZE,
  MAX_HIGHLIGHT_WIDTH,
  MIN_DIGIT_SIZE,
  MIN_HIGHLIGHT_WIDTH,
} from '../presentation.js';
import {
  AUGUR_COLOR,
  CENSUS_COLOR,
  GIVEN_COLOR,
  MARK_COLOR,
  REFUSAL_COLOR,
  TUTOR_COLOR,
} from '../theme.js';
import { listed } from '../words.js';
import type { ScreenContext } from './context.js';
import { type TakenColor, colorRow } from './customcolor.js';
import { highlightChip } from './look.js';
import { renderPreview } from './render.js';
import { type Choice, gallery, percent, row, slider, toggle, wideRow } from './widgets.js';

/** The colours the board already means something by, which a mark must stay clear of. */
const TAKEN: readonly TakenColor[] = [
  { color: GIVEN_COLOR, label: 'A given', name: 'the gold of a given' },
  { color: CENSUS_COLOR, label: 'A Census', name: 'the blue of a Census' },
  { color: AUGUR_COLOR, label: 'An Augur', name: 'the cream of an Augur' },
  { color: TUTOR_COLOR, label: 'The tutor', name: 'the violet of the tutor' },
  { color: REFUSAL_COLOR, label: 'A refused click', name: 'the red of a refused click' },
];

/**
 * The mark's colour: the game's green, the presets, and any colour at all from the window behind
 * the Custom tile, each on the standard example, which carries a mark.
 */
export function markColorRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, typeId, currentTheme } = ctx;
  const chip = (markColor: string): (() => HTMLElement) =>
    ctx.chipBoard(currentTheme, { markColor });
  colorRow(ctx.host, host, {
    label: 'Mark colour',
    hint:
      'Your marks, your pencil notes dimmed, and the seam of a wrapped board. The cursor ' +
      'highlight follows it unless it has a colour of its own.',
    current: p.markColor,
    fallback: { value: DEFAULT, label: 'Game type default — green', example: chip(MARK_COLOR) },
    presets: MARK_COLORS,
    chip,
    window: {
      title: 'Custom mark colour',
      blurb:
        'Mix a colour for your marks and pencil notes, or type it in hex. Gold, blue, cream, ' +
        'violet and red are taken: each already means something on the board.',
      mixedLabel: 'A mark',
      taken: TAKEN,
      current: settings.markColor(typeId),
    },
    onPick: (color) => ctx.pick({ markColor: color }),
  });
}

/**
 * The board's digit size. The standard example follows the thumb, redrawn in place, and the
 * screen changes once, on release, as the text size does.
 */
export function digitSizeRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  const sample = el('div', 'digit-size-demo');
  const drawSample = (size: number): void => {
    sample.replaceChildren(
      renderPreview(
        sampleBoard(),
        currentTheme,
        ctx.display({ highlight: null, digitScale: size }),
        {
          cell: ctx.chipCell,
          pin: samplePin(),
        },
      ).canvas,
    );
  };
  drawSample(p.digitSize);
  const control = el('div', 'settings-stack');
  control.append(
    slider({
      min: MIN_DIGIT_SIZE,
      max: MAX_DIGIT_SIZE,
      step: RATIO_STEP,
      value: p.digitSize,
      format: percent,
      onInput: drawSample,
      onRelease: (v) => ctx.pick({ digitSize: v }),
      resetTo: DEFAULT_DIGIT_SIZE,
    }),
    sample,
  );
  wideRow(
    host,
    'Digit size',
    'The numbers, marks and pencil notes on the board. The interface’s text has its own size.',
    control,
  );
}

/**
 * The cursor highlight's thickness. The highlight example follows the thumb, redrawn in place,
 * and the screen changes once, on release.
 */
export function highlightWidthRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p } = ctx;
  const sample = el('div', 'highlight-width-demo');
  const drawSample = (width: number): void => {
    sample.replaceChildren(highlightChip(ctx, { highlightWidth: width })());
  };
  drawSample(p.highlightWidth);
  const control = el('div', 'settings-stack');
  control.append(
    slider({
      min: MIN_HIGHLIGHT_WIDTH,
      max: MAX_HIGHLIGHT_WIDTH,
      step: 1,
      value: p.highlightWidth,
      format: (v) => `${Math.round(v)}px`,
      onInput: drawSample,
      onRelease: (v) => ctx.pick({ highlightWidth: Math.round(v) }),
      resetTo: DEFAULT_HIGHLIGHT_WIDTH,
    }),
    sample,
  );
  wideRow(
    host,
    'Cursor highlight thickness',
    'The line the cursor draws round a cell, for a large zoom or a big screen.',
    control,
  );
}

/** Whether a board opens at the zoom ceiling rather than fitted to the stage. */
export function startAtCeilingRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p } = ctx;
  row(
    host,
    'Start boards at the maximum zoom',
    toggle(p.startAtCeiling, (v) => ctx.set({ startAtCeiling: v })),
    'Every board opens at the zoom ceiling above, panning when it does not fit, instead of ' +
      'shrunk to fit the screen. F fits it.',
  );
}

/** The ladders with a crawl rule, by name: those the ladder data gives a reach. */
const CRAWL_LADDERS = listed(ladders.filter((t) => (t.reach ?? 0) > 0).map((t) => t.name));

/** Shading the cells out of reach, or not, each on a board with a crawl rule opened at one end. */
export function reachShadingRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  const chip = (reachShading: boolean) => (): HTMLElement =>
    renderPreview(
      reachSampleBoard(),
      currentTheme,
      ctx.display({ highlight: null, reachShading }),
      {
        cell: ctx.chipCell,
      },
    ).canvas;
  wideRow(
    host,
    'Reach shading',
    `On ${CRAWL_LADDERS} a cell opens only within reach of ground you have uncovered. ` +
      'Shaded, the cells out of reach are darkened; the cursor crosses one out either way.',
    gallery(
      [
        { value: 'on', label: 'Shaded', example: chip(true) },
        { value: 'off', label: 'Not shaded', example: chip(false) },
      ],
      p.reachShading ? 'on' : 'off',
      (v) => ctx.pick({ reachShading: v === 'on' }),
    ),
  );
}

/** What a creature is drawn as: its pips, its tier as a digit, or both, each on the standard example. */
export function glyphRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  const style = (glyph: CreatureGlyph, label: string): Choice => ({
    value: glyph,
    label,
    example: ctx.chipBoard(currentTheme, { glyph }),
  });
  wideRow(
    host,
    'Creature tiers',
    'A creature as its pips, a die face of its tier; as the digit, which reads at a cell size ' +
      'where seven pips do not; or both. Only a beaten creature is ever drawn.',
    gallery(
      [style('pips', 'Pips'), style('digit', 'Digit'), style('both', 'Pips with the digit')],
      p.glyph,
      (v) => ctx.pick({ glyph: v as CreatureGlyph }),
    ),
  );
}
