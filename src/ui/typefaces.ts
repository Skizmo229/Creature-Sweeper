/**
 * The bundled faces, and which ladder wears which.
 *
 * Kept apart from `theme.ts` because that file draws creatures on a canvas,
 * and the test pass compiles with no DOM at all — the same reason `preview.ts`
 * builds boards and renders nothing. Everything here is data, so
 * `test/fonts.test.ts` can hold the table, the CSS that loads it, the files
 * and the licence together.
 */

/**
 * The fonts the player can choose between: one per ladder, and one more chosen
 * for nothing but legibility.
 *
 * All bundled (`fonts.css`), because twenty-four distinct faces cannot come
 * from what happens to be installed — the system stacks this replaced looked
 * different on every machine, and one of them (Georgia) set its 3, 4, 5, 7 and
 * 9 below the line, so a board of numbers jumped about. Every face here has
 * LINING figures, all ten digits on the baseline, and that is the one thing a
 * new face must be checked for before it is added: a canvas cannot switch a
 * face's figure style, so an old-style face cannot be rescued once chosen.
 *
 * A bundled face can still arrive a moment after the first frame. The
 * interface reflows when it does; the board is a canvas and cannot, so
 * `BoardView` repaints itself once its face has loaded.
 */
export type FontId =
  | 'atkinson' | 'fredoka' | 'jetbrains-mono' | 'barlow-condensed' | 'chakra-petch'
  | 'anton' | 'aladin' | 'cinzel' | 'comfortaa' | 'overpass' | 'exo-2' | 'gluten'
  | 'abril-fatface' | 'baloo-2' | 'alfa-slab-one' | 'black-ops-one' | 'russo-one'
  | 'sniglet' | 'libre-baskerville' | 'bungee' | 'rubik' | 'pirata-one'
  | 'libre-franklin' | 'space-mono' | 'big-shoulders';

export interface GameFont {
  /** The face's own name, as the picker shows it. */
  name: string;
  /**
   * CSS font-family list: the bundled face, then system fonts for any glyph it
   * lacks. The bundled files are Latin only, so the arrows and the star in the
   * interface always come from the fallback.
   */
  stack: string;
  /**
   * The weight the board draws its numbers at. The face's own heavy weight,
   * and never one it does not have: a canvas asked for bold from a face with
   * only a regular smears a fake one, and eight of these have only a regular —
   * which in every case is already heavy.
   */
  weight: number;
}

const SANS = 'system-ui, sans-serif';
const SERIF = 'Georgia, serif';
const MONO = 'ui-monospace, monospace';

/**
 * In picker order: the legible one first, where a player looking for it will
 * find it, then the ladders' own in the order the ladders read.
 */
export const FONTS: Record<FontId, GameFont> = {
  // Designed by the Braille Institute for readers with low vision, with every
  // digit pair a reader might confuse (1/7, 3/8, 6/8/9/0) pulled apart on
  // purpose. No ladder defaults to it: it is the one to reach for, not a look.
  atkinson: { name: 'Atkinson Hyperlegible Next', stack: `"Atkinson Hyperlegible Next", ${SANS}`, weight: 700 },
  fredoka: { name: 'Fredoka', stack: `Fredoka, ${SANS}`, weight: 600 },
  'jetbrains-mono': { name: 'JetBrains Mono', stack: `"JetBrains Mono", ${MONO}`, weight: 700 },
  'barlow-condensed': { name: 'Barlow Condensed', stack: `"Barlow Condensed", ${SANS}`, weight: 600 },
  'chakra-petch': { name: 'Chakra Petch', stack: `"Chakra Petch", ${SANS}`, weight: 700 },
  anton: { name: 'Anton', stack: `Anton, ${SANS}`, weight: 400 },
  aladin: { name: 'Aladin', stack: `Aladin, ${SERIF}`, weight: 400 },
  cinzel: { name: 'Cinzel', stack: `Cinzel, ${SERIF}`, weight: 700 },
  comfortaa: { name: 'Comfortaa', stack: `Comfortaa, ${SANS}`, weight: 700 },
  overpass: { name: 'Overpass', stack: `Overpass, ${SANS}`, weight: 700 },
  'exo-2': { name: 'Exo 2', stack: `"Exo 2", ${SANS}`, weight: 700 },
  gluten: { name: 'Gluten', stack: `Gluten, ${SANS}`, weight: 600 },
  'abril-fatface': { name: 'Abril Fatface', stack: `"Abril Fatface", ${SERIF}`, weight: 400 },
  'baloo-2': { name: 'Baloo 2', stack: `"Baloo 2", ${SANS}`, weight: 700 },
  'alfa-slab-one': { name: 'Alfa Slab One', stack: `"Alfa Slab One", ${SERIF}`, weight: 400 },
  'black-ops-one': { name: 'Black Ops One', stack: `"Black Ops One", ${SANS}`, weight: 400 },
  'russo-one': { name: 'Russo One', stack: `"Russo One", ${SANS}`, weight: 400 },
  sniglet: { name: 'Sniglet', stack: `Sniglet, ${SANS}`, weight: 800 },
  'libre-baskerville': { name: 'Libre Baskerville', stack: `"Libre Baskerville", ${SERIF}`, weight: 700 },
  bungee: { name: 'Bungee', stack: `Bungee, ${SANS}`, weight: 400 },
  rubik: { name: 'Rubik', stack: `Rubik, ${SANS}`, weight: 700 },
  'pirata-one': { name: 'Pirata One', stack: `"Pirata One", ${SERIF}`, weight: 400 },
  'libre-franklin': { name: 'Libre Franklin', stack: `"Libre Franklin", ${SANS}`, weight: 700 },
  'space-mono': { name: 'Space Mono', stack: `"Space Mono", ${MONO}`, weight: 700 },
  'big-shoulders': { name: 'Big Shoulders Display', stack: `"Big Shoulders Display", ${SANS}`, weight: 800 },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];

/** The legibility face, which is nobody's default. */
export const LEGIBLE_FONT: FontId = 'atkinson';

/**
 * Font ids from before the faces were bundled, when each was a system stack.
 *
 * Saves and exported codes carrying these are in testers' hands, so each is
 * read as the bundled face nearest what it used to mean rather than dropped
 * back to the ladder's default. "Terminal" was a stack whose first named face
 * was JetBrains Mono, so that one is exact; "Clean" asked for plain and
 * readable, which is what the legibility face is for.
 */
const LEGACY_FONTS: Record<string, FontId> = {
  mono: 'jetbrains-mono',
  sans: 'atkinson',
  rounded: 'fredoka',
  serif: 'libre-baskerville',
  slab: 'alfa-slab-one',
};

/** A saved font choice, with the retired ids mapped onto their successors. */
export function migrateFontChoice(saved: string): string {
  return LEGACY_FONTS[saved] ?? saved;
}

/** A font by id, or the baseline face for an id this build does not know. */
export function fontFor(id: string): GameFont {
  return FONTS[id as FontId] ?? FONTS['jetbrains-mono'];
}

/**
 * Every ladder wears a face of its own — no two share one, and
 * `test/fonts.test.ts` holds that. The reasons are the look, not the reading:
 * each was checked on its own palette at a 16px cell before it was chosen.
 */
export const TYPE_FONTS: Record<string, FontId> = {
  // Round and chunky: the softest face, for the ladder that teaches.
  easy: 'fredoka',
  // The face the old "Terminal" stack named first, so the classic look is
  // kept — and is now the same on every machine rather than Consolas on some.
  normal: 'jetbrains-mono',
  // Clipped corners: aggressive without losing a digit's shape.
  extreme: 'chakra-petch',
  // Condensed, because the smallest cells carry two-digit sums up to 72.
  huge: 'barlow-condensed',
  // The heaviest face here, and condensed like HUGE's.
  huge_extreme: 'anton',
  // Genie-lamp flourishes, for the ladder where magic arrives.
  arcane: 'aladin',
  // A temple inscription: Delphi.
  oracle: 'cinzel',
  // A chess-book serif.
  checker: 'libre-baskerville',
  // Bouncy and warm, for the couples.
  pairs: 'baloo-2',
  // A heavy slab: numbers stamped on a games-parlour table.
  dominoes: 'alfa-slab-one',
  // Boot-camp stencil capitals.
  workout: 'black-ops-one',
  // Heavy, blocky and tight-knit.
  packs: 'russo-one',
  // A carnival marquee.
  congo: 'bungee',
  // Soft and gooey, like honey.
  hive: 'gluten',
  // Digits drawn from loops, on a board that loops.
  wraparound: 'comfortaa',
  // Doughy, like a bakery sign.
  donut: 'sniglet',
  // A crossroads, in the US highway-sign face.
  cross: 'overpass',
  // Squared-off loops: halfway between its two parents.
  wrapped_cross: 'exo-2',
  // Thick and hairline strokes, like cut facets.
  diamond: 'abril-fatface',
  // Softened corners, like worn stone.
  cave: 'rubik',
  // Gothic for a crawl, with digits that stay plain where blackletter's do not.
  dungeon: 'pirata-one',
  // The newspaper puzzle page.
  sudoku: 'libre-franklin',
  // An instrument readout.
  blind: 'space-mono',
  // The tallest digits here on a condensed body, for the smallest cells.
  huge_blind: 'big-shoulders',
};

/**
 * The face a ladder wears by default. A ladder with no entry wears NORMAL's,
 * so a new one draws correctly on the day it is added — and fails the
 * one-face-each test until it is given its own.
 */
export function typeFontId(typeId: string): FontId {
  return TYPE_FONTS[typeId] ?? 'jetbrains-mono';
}
