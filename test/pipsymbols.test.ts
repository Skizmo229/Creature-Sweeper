/**
 * The symbols a creature's pips can be drawn as.
 *
 * The table, the faces that draw it and the licences that let them ship have to agree, and none
 * of them fails loudly when they drift: a symbol no face holds is drawn in whatever the machine
 * has, which can be a colour emoji or nothing at all, and a face without its licence ships
 * anyway. So each is held here.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SYMBOL_COUNT,
  SYMBOL_SETS,
  findSymbol,
  glyphChar,
  isGlyphPip,
} from '../src/ui/pipsymbols.js';

const DIR = 'src/ui/pipfont';
const CSS = readFileSync(`${DIR}/pipfont.css`, 'utf8');
const LICENCES = readFileSync('public/FONT-LICENSES.txt', 'utf8');

/** Every @font-face in pipfont.css: family, file, and the code points it claims. */
const FACES = [...CSS.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
  const family = /font-family:\s*'([^']+)'/.exec(body!)![1]!;
  const file = /url\('\.\/([^']+)'\)/.exec(body!)![1]!;
  const range = /unicode-range:\s*([^;]+);/.exec(body!)![1]!;
  const claims = (cp: number): boolean =>
    range.split(',').some((part) => {
      const [lo, hi = lo] = part.trim().slice(2).split('-');
      return cp >= parseInt(lo!, 16) && cp <= parseInt(hi!, 16);
    });
  return { family, file, claims };
});

/** Each face's source, and the name its copyright line is under in the licence file. */
const SOURCES: Record<string, string> = {
  'symbols2.woff2': 'Noto Sans Symbols 2',
  'symbols.woff2': 'Noto Sans Symbols',
  'emoji.woff2': 'Noto Emoji',
  'sans.woff2': 'Noto Sans',
};

describe('the symbol table', () => {
  it('holds Dingbats and Wingdings 1 to 3, in that order', () => {
    expect(SYMBOL_SETS.map((s) => s.name)).toEqual([
      'Dingbats',
      'Wingdings',
      'Wingdings 2',
      'Wingdings 3',
    ]);
    // All of each, bar the Windows logo, which has no code point, and Wingdings 2's circled
    // reverse solidus, which no open face draws (decision 0035).
    expect(SYMBOL_SETS.map((s) => s.symbols.length)).toEqual([192, 221, 215, 207]);
    expect(SYMBOL_COUNT).toBe(782);
  });

  it('places each Wingdings symbol once, at a printable position', () => {
    for (const set of SYMBOL_SETS.slice(1)) {
      const codes = set.symbols.map((s) => s.code!);
      expect(new Set(codes).size, set.name).toBe(codes.length);
      for (const code of codes) {
        expect(code, set.name).toBeGreaterThan(0x20);
        expect(code, set.name).toBeLessThanOrEqual(0xff);
      }
    }
  });

  it('keeps Dingbats in the Unicode block of that name', () => {
    for (const s of SYMBOL_SETS[0]!.symbols) {
      expect(s.code).toBeNull();
      expect(s.char.codePointAt(0)).toBeGreaterThanOrEqual(0x2700);
      expect(s.char.codePointAt(0)).toBeLessThan(0x27c0);
    }
  });

  it('names every symbol and draws it as one character', () => {
    for (const set of SYMBOL_SETS) {
      for (const s of set.symbols) {
        expect(s.name.length, s.pip).toBeGreaterThan(0);
        expect([...s.char], s.pip).toHaveLength(1);
        expect(glyphChar(s.pip)).toBe(s.char);
        expect(isGlyphPip(s.pip)).toBe(true);
      }
    }
  });
});

describe('a symbol pip', () => {
  it('is told apart from a drawn shape', () => {
    expect(isGlyphPip('U+2764')).toBe(true);
    expect(isGlyphPip('U+1F571')).toBe(true);
    for (const shape of ['circle', 'ringDiamond', 'default', 'U+', 'U+27G4', 'u+2764']) {
      expect(isGlyphPip(shape), shape).toBe(false);
    }
  });

  it('is found in the first set that holds it', () => {
    expect(findSymbol('U+2764')?.set.name).toBe('Dingbats');
    expect(findSymbol('U+1F571')?.symbol).toMatchObject({
      name: 'Black skull and crossbones',
      code: 0x4e,
    });
    expect(findSymbol('U+E000')).toBeUndefined();
  });
});

describe('pipfont.css', () => {
  it('gives every symbol exactly one face to come from', () => {
    for (const set of SYMBOL_SETS) {
      for (const s of set.symbols) {
        const cp = s.char.codePointAt(0)!;
        expect(FACES.filter((f) => f.claims(cp)).length, `${set.name} ${s.pip}`).toBe(1);
      }
    }
  });

  it('is one family', () => {
    expect(new Set(FACES.map((f) => f.family))).toEqual(new Set(['Pip Symbols']));
  });

  it('names only files that exist, and every file is named', () => {
    for (const f of FACES) expect(existsSync(`${DIR}/${f.file}`), f.file).toBe(true);
    const files = readdirSync(DIR).filter((f) => f !== 'pipfont.css');
    expect(new Set(FACES.map((f) => f.file))).toEqual(new Set(files));
  });

  it('ships every face with its copyright notice', () => {
    for (const f of FACES) {
      expect(SOURCES, f.file).toHaveProperty(f.file);
      expect(LICENCES, f.file).toContain(`\n${SOURCES[f.file]}\n  Copyright`);
    }
  });
});
