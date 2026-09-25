/**
 * The bundled faces.
 *
 * Four places have to agree about a face — the FONTS table, the ladder that
 * wears it, the @font-face that loads it and the licence that lets it ship —
 * and none of them fails loudly when it drifts. A face missing from the CSS
 * renders in the fallback with no error; a board weight the face does not have
 * is faked by the canvas and smears; a face without its licence ships anyway.
 * So each is held here.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { LOOK_IDS, lookFor } from '../src/ui/looks.js';
import {
  FONTS,
  FONT_IDS,
  LEGIBLE_FONT,
  TITLE_FONT,
  fontFor,
  migrateFontChoice,
} from '../src/ui/typefaces.js';

const CSS = readFileSync('src/ui/fonts.css', 'utf8');
const STYLES = readFileSync('src/ui/styles.css', 'utf8');
const LICENCES = readFileSync('public/FONT-LICENSES.txt', 'utf8');

/** Every @font-face in fonts.css: family, weight range, file. */
const FACES = [...CSS.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
  const family = /font-family:\s*'([^']+)'/.exec(body!)![1]!;
  const [lo, hi = lo] = /font-weight:\s*([\d ]+);/.exec(body!)![1]!.trim().split(/\s+/).map(Number);
  const file = /url\('\.\/fonts\/([^']+)'\)/.exec(body!)![1]!;
  return { family, lo: lo!, hi: hi!, file };
});

/** The face a stack asks for first — the bundled one. */
const familyOf = (stack: string): string => stack.split(',')[0]!.trim().replace(/^"|"$/g, '');

describe('every ladder', () => {
  const ids = loadLadders().map((t) => t.id);

  it('has a look, and every look is a ladder', () => {
    // A ladder without one wears NORMAL's, silently.
    expect([...LOOK_IDS].sort()).toEqual([...ids].sort());
  });

  it('names a bundled face', () => {
    // Two ladders may share one (decision 0031); a new ladder needs no new font.
    for (const id of ids) expect(FONTS, id).toHaveProperty(lookFor(id).font);
  });

  it('leaves the legible face to the player', () => {
    expect(ids.some((id) => lookFor(id).font === LEGIBLE_FONT)).toBe(false);
  });
});

describe('every face', () => {
  it('is loaded by fonts.css', () => {
    const declared = new Set(FACES.map((f) => f.family));
    for (const id of FONT_IDS) expect(declared, id).toContain(familyOf(FONTS[id].stack));
  });

  it('is drawn on the board at a weight it really has', () => {
    for (const id of FONT_IDS) {
      const { stack, weight } = FONTS[id];
      const faces = FACES.filter((f) => f.family === familyOf(stack));
      expect(
        faces.some((f) => weight >= f.lo && weight <= f.hi),
        id,
      ).toBe(true);
    }
  });

  it('ships with its copyright notice', () => {
    for (const id of FONT_IDS)
      expect(LICENCES, id).toContain(`\n${familyOf(FONTS[id].stack)}\n  Copyright`);
    expect(LICENCES).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('falls back to a system face for the glyphs it lacks', () => {
    for (const id of FONT_IDS) expect(FONTS[id].stack.split(',').length, id).toBeGreaterThan(1);
  });
});

describe('fonts.css', () => {
  it('names only files that exist, and every file is named', () => {
    const files = readdirSync('src/ui/fonts');
    for (const f of FACES) expect(existsSync(`src/ui/fonts/${f.file}`), f.file).toBe(true);
    expect(new Set(FACES.map((f) => f.file))).toEqual(new Set(files));
  });

  it('declares only faces the table offers, and the title face', () => {
    const offered = new Set(FONT_IDS.map((id) => familyOf(FONTS[id].stack)));
    offered.add(familyOf(TITLE_FONT.stack));
    for (const f of FACES) expect(offered, f.family).toContain(f.family);
  });
});

describe('styles.css', () => {
  it('gives a form control back its size adjust wherever it gives back the face', () => {
    // The browser's own stylesheet resets both on a button or a select. A rule that inherits the
    // face back and not the adjust leaves the control's text sized by its em, not by the body's
    // rule, so it grows or shrinks with the face; nothing else would notice.
    const rules = [...STYLES.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+){([^}]*)}/g)];
    const restoring = rules.filter(([, , body]) => /font-family:\s*inherit/.test(body!));
    expect(restoring.length).toBeGreaterThan(0);
    for (const [, selector, body] of restoring) {
      expect(body, selector!.trim()).toMatch(/font-size-adjust:\s*inherit/);
    }
  });
});

describe('the title face', () => {
  const family = familyOf(TITLE_FONT.stack);

  it('is loaded, at the weight it is set in', () => {
    const faces = FACES.filter((f) => f.family === family);
    expect(faces.some((f) => TITLE_FONT.weight >= f.lo && TITLE_FONT.weight <= f.hi)).toBe(true);
  });

  it('ships with its copyright notice', () => {
    // Labelled "Griffy (the title)" in the file, so the note in brackets is optional.
    expect(LICENCES).toMatch(new RegExp(`\\n${family}( \\([^)]*\\))?\\n  Copyright`));
  });

  it('belongs to the title alone — no ladder wears it and the picker does not offer it', () => {
    const offered = FONT_IDS.map((id) => familyOf(FONTS[id].stack));
    expect(offered).not.toContain(family);
  });
});

describe('a saved font choice', () => {
  it('from before the faces were bundled lands on a bundled one', () => {
    for (const old of ['mono', 'sans', 'rounded', 'serif', 'slab']) {
      expect(FONTS).toHaveProperty(migrateFontChoice(old));
    }
    // "Terminal" was a stack whose first named face was JetBrains Mono.
    expect(migrateFontChoice('mono')).toBe('jetbrains-mono');
  });

  it('is otherwise kept as written', () => {
    expect(migrateFontChoice('default')).toBe('default');
    expect(migrateFontChoice('bungee')).toBe('bungee');
    // A face from a newer build is kept, and draws in the baseline meanwhile.
    expect(migrateFontChoice('from-the-future')).toBe('from-the-future');
    expect(fontFor('from-the-future')).toBe(FONTS['jetbrains-mono']);
  });
});
