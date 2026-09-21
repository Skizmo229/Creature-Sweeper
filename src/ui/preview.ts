/**
 * The little example boards the settings screen draws its options on.
 *
 * HEADLESS, AND THAT IS LOAD-BEARING. This file builds boards and nothing
 * else — no canvas, no DOM, no rendering. `renderPreview` lives in
 * `settingsscreen.ts` with the only thing that calls it, which is what keeps
 * this module importable from a Node test: `tsconfig.engine.json` compiles
 * `test/` with no DOM library at all, deliberately, so every test is proven
 * headless. Pulling the renderer in here would drag `CanvasRenderingContext2D`
 * into that pass and the choice would be between weakening the guard and
 * having no test for the examples at all. See `test/preview.test.ts`.
 *
 * THESE ARE REAL BOARDS, RENDERED BY THE REAL RENDERER. Every tile, number,
 * glyph, mark and highlight below comes out of `Game` and `BoardView` exactly
 * as it does in play. A hand-drawn approximation would have been a quarter of
 * the code and would have started lying the first time anything about cell
 * drawing changed — and a preview that has quietly stopped being true is worse
 * than no preview, because the player has no way to tell. This is the same
 * argument that killed `design/opening.py`.
 *
 * Every example is a pure function of a fixed config and a fixed seed, so all
 * the thumbnails in a gallery show the *same* board and the only thing that
 * differs between them is the setting being chosen. That is what makes them
 * comparable; a random layout per tile would make a palette gallery a test of
 * memory rather than of colour.
 *
 * The games are built once and shared: a `BoardView` never mutates the game it
 * draws, so forty thumbnails can render four boards between them.
 */

import { Game } from '../engine/game.js';
import type { BoardConfig, Cell } from '../engine/types.js';

/** Fixed, so every thumbnail everywhere shows the same arrangement. */
const SEED = 0x9e3779b1;

/** The layout every example starts on, before anything asks for a fresh one. */
export const PREVIEW_SEED = SEED;

/**
 * A board config for an example.
 *
 * `startLevel` is always the top tier, which makes every fight on these boards
 * a free kill. That is not a cheat to dodge the damage rules — it is what lets
 * the setup below uncover creatures to show their glyphs without the example
 * board needing an HP budget or a level economy at all.
 */
function previewConfig(over: Partial<BoardConfig> = {}): BoardConfig {
  const tiers = over.tiers ?? 4;
  return {
    typeId: 'preview',
    board: 1,
    width: 4,
    height: 3,
    tiers,
    quantity: [1, 1, 1, 1],
    hp: 99,
    startLevel: tiers,
    // Never reached — the board starts at its own ceiling. Length must still
    // be tiers - 1, which is the engine's contract.
    exp: Array.from({ length: tiers - 1 }, (_, i) => i + 1),
    search: false,
    // Nothing is dealt: the setup below decides exactly what is uncovered, so
    // the examples do not change shape with the opening rule.
    opening: 'none',
    topology: 'square',
    wrap: 'none',
    shape: 'rect',
    shapeParam: 0,
    placement: 'uniform',
    givens: 0,
    spells: [],
    startMana: 0,
    reach: 0,
    ...over,
  };
}

/** Grid order, so "the first two creatures" means the same thing every time. */
const inReadingOrder = (a: Cell, b: Cell) => (a.y - b.y) || (a.x - b.x);

function cellsOf(game: Game, pick: (c: Cell) => boolean): Cell[] {
  return game.grid.flat().filter((c) => c.present && pick(c)).sort(inReadingOrder);
}

/**
 * The standard example: some covered tiles, some cleared floor with numbers,
 * a couple of defeated creatures and one cell the player has marked.
 *
 * A creature glyph is only ever visible once it has been beaten — a live one
 * is under a covered tile — so showing the icons at all means showing defeated
 * ones, which is also what puts the strike-through in the picture.
 *
 * The empty cells opened are chosen from those with a number on them. An empty
 * cell numbered 0 cascades, and on a board this small one cascade uncovers
 * almost all of it, leaving nothing covered to look at.
 */
function buildSample(config: BoardConfig, creatures: number, empties: number): Game {
  const game = Game.create(config, SEED);

  // Highest tiers first: a tier 4 draws four pips and a tier 1 draws one, so
  // the big ones are the ones that actually show what a pip SHAPE looks like.
  // Taking them in reading order picked whatever the seed happened to put top
  // left, and half the time that was a single dot.
  const byTier = cellsOf(game, (c) => c.tier > 0).sort((a, b) => b.tier - a.tier);
  for (const cell of byTier.slice(0, creatures)) {
    game.open(cell.x, cell.y);
  }
  for (const cell of cellsOf(game, (c) => c.tier === 0 && c.num > 0).slice(0, empties)) {
    game.open(cell.x, cell.y);
  }
  // One mark, so the green ink and the chosen font are both on show.
  const covered = cellsOf(game, (c) => !c.open);
  if (covered[0]) game.setMark(covered[0].x, covered[0].y, Math.min(3, config.tiers));

  return game;
}

/** Memoised, because a gallery asks for the same board once per tile. */
const cache = new Map<string, Game>();
const once = (key: string, make: () => Game): Game => {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  cache.set(key, made);
  return made;
};

/** The 4x3 square example used by the icon, palette, font and strike galleries. */
export function sampleBoard(): Game {
  return once('square', () => buildSample(previewConfig(), 2, 3));
}

/**
 * The defeated creature on an example board with the most pips.
 *
 * Derived rather than written down as a coordinate, because what the gallery
 * needs is not "a cell" but "a cell the setting can be SEEN on" — and a hover
 * setting about defeated creatures shows nothing at all if it is pinned over
 * floor. The highest tier for the same reason `buildSample` opens the highest
 * tiers: a tier 4 is four pips, so it is where a shape swap reads and where
 * counting the pips is most worth replacing with a digit.
 *
 * Headless like everything else here — it queries a board and returns a
 * coordinate; the pinning itself is the renderer's job.
 */
export function topDefeatedCell(game: Game): { x: number; y: number } {
  const best = cellsOf(game, (c) => c.open && c.tier > 0)
    .sort((a, b) => b.tier - a.tier)[0];
  return best ? { x: best.x, y: best.y } : { x: 0, y: 0 };
}

/**
 * A hex example, used only by the cursor-highlight gallery.
 *
 * It has to be hex. On a plain square board "true neighbours" and "flat 3x3
 * block" light exactly the same eight cells, so a square example would show
 * two identical pictures for two different settings and teach the player that
 * the choice does nothing. On hex the first lights six and the second eight,
 * which is the whole distinction.
 */
export function hexSampleBoard(): Game {
  return once('hex', () => buildSample(
    previewConfig({ width: 5, height: 4, quantity: [1, 1, 1, 1], topology: 'hex' }), 1, 4,
  ));
}

/** Two cells at whatever the zoom ceiling is, so the setting is in real units. */
export function zoomSampleBoard(): Game {
  return once('zoom', () => {
    const game = Game.create(
      previewConfig({ width: 2, height: 1, quantity: [0, 0, 0, 1] }), SEED,
    );
    for (const cell of game.grid.flat()) game.open(cell.x, cell.y);
    return game;
  });
}

/**
 * A board that has actually been cleared, for the board-clear effect.
 *
 * Genuinely won, not a board dressed up as one: every creature is beaten and
 * `status` is 'won', which is the state the effect fires over in play.
 *
 * Order matters. The empty ground goes first and the creatures last, because
 * the win lands on the final kill and `open` refuses everything afterwards —
 * clearing the creatures first would leave half the floor covered.
 *
 * The only example that takes a seed, and the only one not memoised. The other
 * galleries compare a setting ACROSS tiles and so need one another's boards to
 * be identical; this one is a single tile watched over time, where a fresh
 * layout each time it is played is the point. Caching every seed asked for
 * would grow without bound for no benefit — a ten-by-six board is sixty cells.
 *
 * IT CARRIES EXACTLY THE TIERS THE REAL BOARD DOES — one of each, and none
 * above. `tiers` is the count the board being played actually uses, so NORMAL
 * previews five creatures and HUGE nine, and the player is never shown a
 * creature that cannot appear where they are.
 *
 * Both halves of that matter, because the effects act on the creatures
 * themselves and so what this is really previewing is the glyphs. Missing a
 * tier shows a subset of the art and calls it the art — and tiers 6 to 9 in
 * particular do not look like 1 to 5, since they reuse the five hues wearing a
 * gold halo, which catches the light quite differently when it is tumbling or
 * burning. Showing a tier too many is the same error pointed the other way.
 *
 * Every entry in the quantity is at least 1, which is what makes "one of each"
 * a property of the CONFIG rather than of the seed: the generator deals
 * exactly the quantities it is given. `test/preview.test.ts` holds it to that
 * at every tier count the real ladders use.
 */

/**
 * Creatures per tier on the cleared example, commonest tier first.
 *
 * Sliced to the tier count rather than recomputed, and the shape is doing two
 * jobs. It is the shape a real ladder uses — commoner low tiers, rarer high
 * ones — so the preview is not evenly weighted in a way no real board is. And
 * because the slice gets longer as the tier count does, the density climbs
 * with it: 14 creatures on 60 cells at five tiers, 19 at nine. That tracks the
 * real ladders closely, which run about 23% at five tiers and about 33% at
 * nine, so the example is about as crowded as the board it stands for.
 *
 * Nine entries because nine is the game's ceiling: `DIE_FACES` defines nine
 * faces and `drawCreature` clamps there.
 */
const CLEARED_QUANTITY: readonly number[] = [4, 3, 3, 2, 2, 2, 1, 1, 1];

export function clearedBoard(seed: number = SEED, tiers = 5): Game {
  const count = Math.max(1, Math.min(CLEARED_QUANTITY.length, Math.round(tiers)));
  const game = Game.create(previewConfig({
    width: 10, height: 6, tiers: count, quantity: CLEARED_QUANTITY.slice(0, count),
  }), seed);
  for (const cell of cellsOf(game, (c) => c.tier === 0)) game.open(cell.x, cell.y);
  for (const cell of cellsOf(game, (c) => c.tier > 0)) game.open(cell.x, cell.y);
  return game;
}
