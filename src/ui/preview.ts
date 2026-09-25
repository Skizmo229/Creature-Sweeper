/**
 * The little example boards the settings screen draws its options on.
 *
 * HEADLESS, AND THAT IS LOAD-BEARING. This file builds boards and nothing
 * else — no canvas, no DOM, no rendering. `renderPreview` lives in
 * `settingsscreen/render.ts` beside the code that calls it, which is what keeps
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
const inReadingOrder = (a: Cell, b: Cell) => a.y - b.y || a.x - b.x;

function cellsOf(game: Game, pick: (c: Cell) => boolean): Cell[] {
  return game.grid
    .flat()
    .filter((c) => c.present && pick(c))
    .sort(inReadingOrder);
}

/**
 * Beat the `count` strongest creatures. A creature glyph is only ever visible
 * once it has been beaten — a live one is under a covered tile — so showing the
 * icons at all means showing defeated ones, which is also what puts the
 * strike-through in the picture.
 *
 * Highest tiers first: a tier 4 draws four pips and a tier 1 draws one, so
 * the big ones are the ones that actually show what a pip SHAPE looks like.
 * Taking them in reading order picked whatever the seed happened to put top
 * left, and half the time that was a single dot.
 */
function beatStrongest(game: Game, count: number): void {
  const byTier = cellsOf(game, (c) => c.tier > 0).sort((a, b) => b.tier - a.tier);
  for (const cell of byTier.slice(0, count)) game.open(cell.x, cell.y);
}

/** One mark, so the green ink and the chosen font are both on show. */
function markOne(game: Game): void {
  const covered = cellsOf(game, (c) => !c.open);
  if (covered[0]) game.setMark(covered[0].x, covered[0].y, Math.min(3, game.config.tiers));
}

/**
 * The cursor-highlight examples' board: some covered tiles, some cleared floor
 * with numbers, a defeated creature and one cell the player has marked.
 *
 * The empty cells opened are chosen from those with a number on them. An empty
 * cell numbered 0 cascades, and on a board this small one cascade uncovers
 * almost all of it, leaving nothing covered to look at.
 */
function buildSample(config: BoardConfig, creatures: number, empties: number): Game {
  const game = Game.create(config, SEED);
  beatStrongest(game, creatures);
  for (const cell of cellsOf(game, (c) => c.tier === 0 && c.num > 0).slice(0, empties)) {
    game.open(cell.x, cell.y);
  }
  markOne(game);
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

/**
 * The standard example, which the icon, palette, board font and strike
 * galleries draw and the glow after a fight is shown on. It carries everything
 * a palette paints and a face draws (decision 0034): every digit from 0 to 9 in
 * the ink, a beaten creature's number in `hot` (see `samplePin`), covered tiles
 * with their edge, open floor, a mark, and two beaten creatures wearing their
 * glyphs.
 *
 * Seven creatures of five tiers on twenty cells: the sums run high enough for a
 * two-digit number, which is the only way the ink ever writes a 0 (an empty
 * cell numbered 0 is left blank), and the three beaten are a 5, a 4 and a 3.
 */
const SAMPLE_CONFIG = previewConfig({
  width: 5,
  height: 4,
  tiers: 5,
  quantity: [2, 2, 1, 1, 1],
});

/** The digits the ink is showing: those of every number on open ground. */
function digitsOnShow(game: Game): Set<string> {
  const shown = new Set<string>();
  for (const cell of cellsOf(game, (c) => c.open && c.tier === 0 && c.num > 0)) {
    for (const digit of String(cell.num)) shown.add(digit);
  }
  return shown;
}

/**
 * One deal of the standard example. Floor is opened only where its number shows
 * a digit not yet on show, in reading order, so each digit tends to appear once
 * and the rest of the board stays covered.
 */
function dealSample(seed: number): Game {
  const game = Game.create(SAMPLE_CONFIG, seed);
  beatStrongest(game, 3);
  for (const cell of cellsOf(game, (c) => !c.open && c.tier === 0 && c.num > 0)) {
    const shown = digitsOnShow(game);
    if ([...String(cell.num)].some((digit) => !shown.has(digit))) game.open(cell.x, cell.y);
  }
  markOne(game);
  return game;
}

/**
 * Whether a deal shows everything the standard example promises: all ten
 * digits in the ink, with at least a quarter of the board still covered,
 * because the tile is half of what a palette paints.
 */
function showsEverything(game: Game): boolean {
  const cells = cellsOf(game, () => true);
  const covered = cells.filter((c) => !c.open).length;
  return digitsOnShow(game).size === 10 && covered * 4 >= cells.length;
}

/**
 * Deals to try before giving up. About one deal in 140 shows everything, and
 * the first from the fixed seed is the 102nd, found in about 6 ms in Node
 * (measured over 50,000 deals on 25 Sep 2026).
 */
const MAX_DEALS = 10000;

/**
 * The standard example, dealt by rejection the way SUDOKU's boards are: the
 * first layout from the fixed seed on that shows everything. Asking each
 * layout for the digits, rather than writing down a seed that happened to show
 * them, means a change to the generator moves the example instead of quietly
 * breaking it.
 */
export function sampleBoard(): Game {
  return once('standard', () => {
    for (let i = 0; i < MAX_DEALS; i++) {
      const game = dealSample(SEED + i);
      if (showsEverything(game)) return game;
    }
    throw new Error(`no example board in ${MAX_DEALS} deals shows every digit`);
  });
}

/**
 * The cell the standard example holds the cursor over: its weakest beaten
 * creature, so the two with the most pips keep their glyphs. A beaten creature
 * under the cursor shows its number in the palette's `hot`, the only place a
 * board uses that colour (decision 0012), so a thumbnail that never held the
 * cursor there would show every colour of a palette but one.
 *
 * Headless like everything else here: it names a cell, and the pinning itself
 * is the renderer's job.
 */
export function samplePin(): Cell {
  const beaten = cellsOf(sampleBoard(), (c) => c.open && c.tier > 0);
  return beaten.sort((a, b) => a.tier - b.tier)[0]!;
}

/**
 * The cursor-highlight examples, on the grid the player's ladder is played on.
 *
 * Square boxes on every square ladder, where "true neighbours" and "flat 3x3
 * block" light the same eight cells, and hex on HIVE, where they part (six
 * cells against eight). By request: a preview of a board the player is not on
 * answers a question they had not asked (decision 0025).
 *
 * Both are 5x4, so the pinned cell sits clear of every edge and its whole ring
 * is on the board whichever grid is drawn.
 */
export function highlightSampleBoard(topology: 'square' | 'hex'): Game {
  return once(`highlight-${topology}`, () =>
    buildSample(previewConfig({ width: 5, height: 4, quantity: [1, 1, 1, 1], topology }), 1, 4),
  );
}

/** The cell the highlight examples hold lit: interior on both grids. */
export const HIGHLIGHT_PIN = { x: 2, y: 1 } as const;

/** The hex highlight example — HIVE's. */
export function hexSampleBoard(): Game {
  return highlightSampleBoard('hex');
}

/** Two cells at whatever the zoom ceiling is, so the setting is in real units. */
export function zoomSampleBoard(): Game {
  return once('zoom', () => {
    const game = Game.create(previewConfig({ width: 2, height: 1, quantity: [0, 0, 0, 1] }), SEED);
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
  const game = Game.create(
    previewConfig({
      width: 10,
      height: 6,
      tiers: count,
      quantity: CLEARED_QUANTITY.slice(0, count),
    }),
    seed,
  );
  for (const cell of cellsOf(game, (c) => c.tier === 0)) game.open(cell.x, cell.y);
  for (const cell of cellsOf(game, (c) => c.tier > 0)) game.open(cell.x, cell.y);
  return game;
}
