/**
 * More of the Presentation section's drawn settings, beside those in `look.ts`: what a creature
 * is drawn as. Every example is the standard board (decision 0025).
 */

import { type CreatureGlyph } from '../presentation.js';
import type { ScreenContext } from './context.js';
import { type Choice, gallery, wideRow } from './widgets.js';

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
