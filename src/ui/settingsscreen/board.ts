/**
 * More of the Presentation section's drawn settings, beside those in `look.ts`: what a creature
 * is drawn as. Every example is the standard board (decision 0025).
 */

import { el } from '../dom.js';
import { reachSampleBoard, sampleBoard, samplePin } from '../preview.js';
import {
  type CreatureGlyph,
  DEFAULT,
  DEFAULT_DIGIT_SIZE,
  MARK_COLORS,
  MAX_DIGIT_SIZE,
  MIN_DIGIT_SIZE,
} from '../presentation.js';
import {
  AUGUR_COLOR,
  CENSUS_COLOR,
  GIVEN_COLOR,
  MARK_COLOR,
  OUT_OF_REACH_COLOR,
  TUTOR_COLOR,
} from '../theme.js';
import type { ScreenContext } from './context.js';
import { type TakenColor, openColorWindow } from './customcolor.js';
import { renderPreview } from './render.js';
import { type Choice, gallery, row, slider, toggle, wideRow } from './widgets.js';

/** The colours the board already means something by, which a mark must stay clear of. */
const TAKEN: readonly TakenColor[] = [
  { color: GIVEN_COLOR, label: 'A given', name: 'the gold of a given' },
  { color: CENSUS_COLOR, label: 'A Census', name: 'the blue of a Census' },
  { color: AUGUR_COLOR, label: 'An Augur', name: 'the cream of an Augur' },
  { color: TUTOR_COLOR, label: 'The tutor', name: 'the violet of the tutor' },
  { color: OUT_OF_REACH_COLOR, label: 'A refused click', name: 'the red of a refused click' },
];

/**
 * The mark's colour: the game's green, the presets, and any colour at all from the window behind
 * the Custom tile, each on the standard example, which carries a mark.
 */
export function markColorRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings, typeId, currentTheme } = ctx;
  const chip = (markColor: string): (() => HTMLElement) =>
    ctx.chipBoard(currentTheme, { markColor });
  const pick = (color: string): void => ctx.pick({ markColor: color });
  const preset = MARK_COLORS.some((c) => c.color === p.markColor);
  const own = p.markColor === DEFAULT || preset ? null : p.markColor;
  // Lit when a colour of the player's own is in force; clicking it opens the window either way.
  const custom: Choice = {
    value: own ?? '',
    label: own ? `Custom — ${own}` : 'Custom — any colour',
    example: own
      ? chip(own)
      : () => el('div', 'picker-placeholder', 'Any colour, mixed from red, green and blue'),
    open: () =>
      openColorWindow(ctx.host, {
        title: 'Custom mark colour',
        blurb:
          'Mix a colour for your marks and pencil notes, or type it in hex. Gold, blue, cream, ' +
          'violet and red are taken: each already means something on the board.',
        mixedLabel: 'A mark',
        taken: TAKEN,
        current: settings.markColor(typeId),
        example: (color) => chip(color)(),
        onUse: pick,
      }),
  };
  wideRow(
    host,
    'Mark colour',
    'Your marks, your pencil notes dimmed, and the seam of a wrapped board. The cursor ' +
      'highlight follows it unless it has a colour of its own.',
    gallery(
      [
        { value: DEFAULT, label: 'Game type default — green', example: chip(MARK_COLOR) },
        ...MARK_COLORS.map((c): Choice => ({
          value: c.color,
          label: c.name,
          example: chip(c.color),
        })),
        custom,
      ],
      p.markColor,
      pick,
    ),
  );
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
    slider(
      MIN_DIGIT_SIZE,
      MAX_DIGIT_SIZE,
      0.05,
      p.digitSize,
      (v) => `${Math.round(v * 100)}%`,
      drawSample,
      (v) => ctx.pick({ digitSize: v }),
      DEFAULT_DIGIT_SIZE,
    ),
    sample,
  );
  wideRow(
    host,
    'Digit size',
    'The numbers, marks and pencil notes on the board. The interface’s text has its own size.',
    control,
  );
}

/** Whether a board opens at the zoom ceiling rather than fitted to the stage. */
export function startAtCeilingRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings } = ctx;
  row(
    host,
    'Start boards at the maximum zoom',
    toggle(p.startAtCeiling, (v) => settings.setPresentation({ startAtCeiling: v })),
    'Every board opens at the zoom ceiling above, panning when it does not fit, instead of ' +
      'shrunk to fit the screen. F fits it.',
  );
}

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
    'On DUNGEON and PETRI DISH a cell opens only within reach of ground you have uncovered. ' +
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
