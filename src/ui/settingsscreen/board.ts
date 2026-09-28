/**
 * More of the Presentation section's drawn settings, beside those in `look.ts`: what a creature
 * is drawn as. Every example is the standard board (decision 0025).
 */

import { el } from '../dom.js';
import { reachSampleBoard, sampleBoard, samplePin } from '../preview.js';
import {
  type CreatureGlyph,
  DEFAULT_DIGIT_SIZE,
  MAX_DIGIT_SIZE,
  MIN_DIGIT_SIZE,
} from '../presentation.js';
import type { ScreenContext } from './context.js';
import { renderPreview } from './render.js';
import { type Choice, gallery, slider, wideRow } from './widgets.js';

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
