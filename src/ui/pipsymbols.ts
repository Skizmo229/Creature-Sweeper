/**
 * The symbols a creature's pips can be drawn as, beyond the seven drawn shapes: all of Dingbats,
 * Wingdings, Wingdings 2 and Wingdings 3, as the custom-icon window lays them out.
 *
 * Not the fonts themselves, which are Microsoft's and cannot ship. Every Wingdings character has
 * had a Unicode equivalent since Unicode 7.0, and Dingbats is the Unicode block of that name, so
 * the table (`pipsymbols.json`) maps each font position to its code point, and the symbols are
 * drawn from open fonts bundled as the one family `PIP_FAMILY` (`pipfont/`, built by
 * `scripts/pip_symbols.py`). A single symbol, Wingdings 2's circled reverse solidus, is in none of
 * them and is left out (decision 0035).
 *
 * DOM-free, so the headless tests can hold the table to the fonts.
 */

import type { GlyphPip, Pip } from './looks.js';
import table from './pipsymbols.json';

/** The family every symbol is drawn in, as a CSS font-family value. */
export const PIP_FAMILY = "'Pip Symbols'";

export interface PipSymbol {
  pip: GlyphPip;
  /** The symbol itself, as text. */
  char: string;
  /** Its Unicode name, in sentence case. */
  name: string;
  /** Its position in the Wingdings font it comes from; null in Dingbats, which is Unicode's own. */
  code: number | null;
}

export interface SymbolSet {
  id: string;
  name: string;
  symbols: readonly PipSymbol[];
}

export const SYMBOL_SETS: readonly SymbolSet[] = table.sets.map((set) => ({
  id: set.id,
  name: set.name,
  symbols: set.symbols.map(([code, hex, name]) => ({
    pip: `U+${hex}` as GlyphPip,
    char: String.fromCodePoint(parseInt(hex as string, 16)),
    name: name as string,
    code: code as number | null,
  })),
}));

const GLYPH = /^U\+([0-9A-F]{4,6})$/;

export function isGlyphPip(pip: Pip | string): pip is GlyphPip {
  return GLYPH.test(pip);
}

/** The text that draws a symbol pip. */
export function glyphChar(pip: GlyphPip): string {
  return String.fromCodePoint(parseInt(pip.slice(2), 16));
}

/** Where a symbol pip is found: the first set to hold it, and the symbol. */
export function findSymbol(pip: GlyphPip): { set: SymbolSet; symbol: PipSymbol } | undefined {
  for (const set of SYMBOL_SETS) {
    const symbol = set.symbols.find((s) => s.pip === pip);
    if (symbol) return { set, symbol };
  }
  return undefined;
}

/** Every distinct symbol the window offers; a few appear in more than one set. */
export const SYMBOL_COUNT = new Set(SYMBOL_SETS.flatMap((s) => s.symbols.map((y) => y.pip))).size;
