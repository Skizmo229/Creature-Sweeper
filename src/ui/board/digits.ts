/**
 * Sizing the board's numbers so every face reads the same. Faces differ by more than a third in
 * how tall their digits stand: Baloo 2's are 62% of their em and Anton's 87%, which on a 16px
 * cell is the difference between reading a number and squinting at it. So every face is drawn at
 * whatever size puts its digits at one measured height, within limits, and centred on its
 * measured ink rather than on the em (decision 0021).
 */

import type { GameFont } from '../typefaces.js';

/**
 * How tall a digit stands, as a share of the font size, in the face every number on the board
 * was sized for (JetBrains Mono).
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
 * Measured metrics per face. Only a face that has actually loaded is cached: measured before it
 * lands, a face is its fallback's metrics, and caching those would size the board for the wrong
 * face for the rest of the session.
 */
const DIGIT_METRICS = new Map<string, DigitMetrics>();

function digitMetrics(ctx: CanvasRenderingContext2D, face: GameFont): DigitMetrics {
  const key = `${face.weight} 100px ${face.stack}`;
  const known = DIGIT_METRICS.get(key);
  if (known) return known;
  ctx.save();
  ctx.font = key;
  // All ten together: the board sets a whole number on one baseline, so the digits share one
  // ink box rather than each being centred on its own.
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

/**
 * Set the context's font for a number that would be `px` in the face the board was sized for,
 * and say where to put the baseline. `centre` is the offset from a point to the baseline that
 * centres the digits' ink on that point; `ascent` is the ink above the baseline, for text set
 * from a top edge.
 */
export function setNumberFont(
  ctx: CanvasRenderingContext2D,
  face: GameFont,
  px: number,
): { centre: number; ascent: number } {
  const m = digitMetrics(ctx, face);
  const size = Math.max(1, Math.round(px * m.scale));
  ctx.font = `${face.weight} ${size}px ${face.stack}`;
  ctx.textBaseline = 'alphabetic';
  return { centre: ((m.ascent - m.descent) / 2) * size, ascent: m.ascent * size };
}
