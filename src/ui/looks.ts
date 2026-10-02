/**
 * What each ladder looks and sounds like by default: one record per ladder, so a new ladder is one
 * entry. Kept DOM-free, apart from `creature.ts` and its canvas drawing, so the tests can hold every
 * ladder to its record (`test/fonts.test.ts`).
 *
 * The split the palettes keep: pip SHAPE carries ladder identity, pip COLOUR carries tier identity
 * and is global (`tiercolors.ts`), so a tier-4 creature looks the same everywhere.
 * Every face and effect here was checked on its own palette at a 16px cell before it was chosen;
 * two ladders may share a face (decision 0031). The shape ladders' records are in
 * `shapelooks.ts`, so neither file outgrows the size a reader can hold (Milestone 3's bar).
 */

import type { LadderLook, TypeTheme } from './looktypes.js';
import { SHAPE_LOOKS } from './shapelooks.js';

const LOOKS: Record<string, LadderLook> = {
  easy: {
    palette: {
      tile: '#b3ab1e',
      tileEdge: '#857f10',
      floor: '#24220c',
      ink: '#f4efc4',
      hot: '#e8b23a',
      pip: 'circle',
      accent: '#e0d84a',
    },
    // Round and chunky: the softest face, for the ladder that teaches.
    font: 'fredoka',
    sfx: 'chime',
    victory: 'confetti',
  },
  normal: {
    palette: {
      tile: '#8a5a12',
      tileEdge: '#63400a',
      floor: '#1f1608',
      ink: '#f0dcb8',
      hot: '#e0742c',
      pip: 'square',
      accent: '#d99a34',
    },
    // The face the old "Terminal" stack named first, so the classic look is
    // kept — and is now the same on every machine rather than Consolas on some.
    font: 'jetbrains-mono',
    // The original's own clear, on the ladder that is the original.
    sfx: 'blip',
    victory: 'tumble',
  },
  extreme: {
    palette: {
      tile: '#3b28d6',
      tileEdge: '#261a94',
      floor: '#0e0a2e',
      ink: '#d4cdf7',
      hot: '#ff5da8',
      // A bolt of lightning.
      pip: 'bolt',
      accent: '#7b6bff',
    },
    // Clipped corners: aggressive without losing a digit's shape.
    font: 'chakra-petch',
    sfx: 'blip',
    // Blown apart from the middle.
    victory: 'scatter',
  },
  huge: {
    palette: {
      tile: '#1d7a2e',
      tileEdge: '#12561f',
      floor: '#08210d',
      ink: '#c9ecd0',
      hot: '#e8d24a',
      pip: 'hex',
      accent: '#4fc46a',
    },
    // Condensed, because the smallest cells carry two-digit sums up to 72.
    font: 'barlow-condensed',
    sfx: 'thud',
    victory: 'tumble',
  },
  huge_extreme: {
    palette: {
      tile: '#6b2fd6',
      tileEdge: '#4a1f96',
      floor: '#1a0a2e',
      ink: '#e0ccf7',
      hot: '#ff4d6d',
      pip: 'cross',
      accent: '#a96bff',
    },
    // The heaviest face here, and condensed like HUGE's.
    font: 'anton',
    sfx: 'thud',
    // Blown apart, as EXTREME is.
    victory: 'scatter',
  },
  arcane: {
    palette: {
      tile: '#1f7d76',
      tileEdge: '#145650',
      floor: '#06211f',
      ink: '#bfe9e4',
      hot: '#4fe0cf',
      pip: 'hex',
      accent: '#2aa39a',
    },
    // Genie-lamp flourishes, for the ladder where magic arrives.
    font: 'aladin',
    sfx: 'glass',
    victory: 'sparkle',
  },
  oracle: {
    // `hot` is rose: clear of `ink`, and, because Reveal writes givens here, clear of
    // GIVEN_COLOR's gold and Census's cyan, keeping the violet family (decision 0032).
    palette: {
      tile: '#5b3fa8',
      tileEdge: '#3d2a74',
      floor: '#140b26',
      ink: '#dcd0f5',
      hot: '#fa4f7a',
      // A moon, for the reader of the night's signs.
      pip: 'crescent',
      accent: '#7e5bd6',
    },
    // A temple inscription: Delphi.
    font: 'cinzel',
    // The temple's organ.
    sfx: 'organ',
    victory: 'pop',
  },
  checker: {
    palette: {
      tile: '#4f5d75',
      tileEdge: '#37425a',
      floor: '#12161f',
      ink: '#e2e8f4',
      hot: '#ffd166',
      pip: 'square',
      accent: '#7f8fa8',
    },
    // A chess-book serif.
    font: 'libre-baskerville',
    sfx: 'chime',
    // Chequers turned over.
    victory: 'flip',
  },
  pairs: {
    // `hot` is amber, far from the pale `ink` and better against the floor. A beaten
    // creature's number is its partner's tier here, though hover does not show it on
    // pairing boards (decision 0012); the palette is worn elsewhere too (decision 0032).
    palette: {
      tile: '#b5482a',
      tileEdge: '#82301b',
      floor: '#25100a',
      ink: '#f7d6c6',
      hot: '#ffc23d',
      pip: 'ringDiamond',
      accent: '#d96a45',
    },
    // Bouncy and warm, for the couples.
    font: 'baloo-2',
    // Creatures leave in twos, so the effect that takes them one burst at a time
    // is the one that reads as the mode.
    sfx: 'chime',
    victory: 'pop',
  },
  dominoes: {
    // Bone tiles on an ebony floor, round pips, crimson for a creature's number
    // — a domino set. Every value here was measured rather than picked, because
    // the obvious ivory tile is a trap: at #c9bd9b the green mark on a covered
    // cell is 1.1:1, worse than EASY's 1.4:1, which is the tile the mark's dark
    // outline was added to rescue. This bone brings it to 2.1:1, in the pack
    // beside BLIND, and keeps covered and cleared cells 5:1 apart. `hot` sits
    // 183 from `ink` and 5.8:1 on the floor, and 83 clear of the nearest colour
    // that can share this board — the tier-4 orange of the hover-level digit.
    // Round pips because a creature's glyph is already a die face, and half a
    // domino is exactly that.
    palette: {
      tile: '#8f8466',
      tileEdge: '#6b6249',
      floor: '#15130f',
      ink: '#efe6d0',
      hot: '#ff4d6d',
      pip: 'circle',
      accent: '#c9bd9b',
    },
    // A heavy slab: numbers stamped on a games-parlour table.
    font: 'alfa-slab-one',
    // Wood is the clack of a bone tile set down on the table. Cascade is the one clear effect in
    // the game that is already a row of things falling over in sequence.
    sfx: 'wood',
    victory: 'cascade',
  },
  workout: {
    // Pool-tile teal: a gym. Amber `hot` is safe here because the only spell is
    // Exercise, which writes no gold annotation. 195 from `ink`, 10.0:1 on the
    // floor, and a mark on a covered tile 3.2:1, in NORMAL's range.
    palette: {
      tile: '#0b7285',
      tileEdge: '#07505e',
      floor: '#061a1f',
      ink: '#c5f1f6',
      hot: '#ffb347',
      pip: 'square',
      accent: '#1098ad',
    },
    // Boot-camp stencil capitals.
    font: 'black-ops-one',
    // Heavy type and a thud: the weights room.
    sfx: 'thud',
    victory: 'burst',
  },
  packs: {
    // Wolf grey with amber eyes: a pack. Measured the same way as the rest — `hot`
    // 178 from `ink` and 10.4:1 on the floor, and a mark on a covered tile 3.3:1,
    // in NORMAL's range. No spells here, so an amber `hot` has no gold annotation
    // to collide with.
    palette: {
      tile: '#58687c',
      tileEdge: '#3c4859',
      floor: '#0f141b',
      ink: '#dbe4ee',
      hot: '#ffb347',
      pip: 'diamond',
      accent: '#8a9bb0',
    },
    // Heavy, blocky and tight-knit.
    font: 'russo-one',
    // A pack leaves together, so the effect that sends every creature falling at
    // once is the one that reads as the mode.
    sfx: 'thud',
    victory: 'tumble',
  },
  congo: {
    // Carnival orange on a dark cocoa floor: a conga line is a party. `hot` is
    // lavender, and the obvious amber is a trap on this board: it sits 10 units
    // from the tier-3 yellow and 12 from the tier-6 gold, and the hover-level
    // digit puts those on the same cells. Lavender is 130 from `ink`, 6.9:1 on
    // the floor and 103 clear of every tier colour. A mark on a covered tile is
    // 3.0:1, in PAIRS's range. No spells here, so no gold annotation either.
    palette: {
      tile: '#c2410c',
      tileEdge: '#8a2e08',
      floor: '#1f0d05',
      ink: '#fde3cf',
      hot: '#a78bfa',
      pip: 'ring',
      accent: '#ea6a2c',
    },
    // A carnival marquee.
    font: 'bungee',
    // Wood blocks and a marimba: a conga line is percussion. One after another, in order: the
    // effect that is already a line of things going by in sequence.
    sfx: 'wood',
    victory: 'cascade',
  },
  ultra_hive: {
    // Darker honey, and a lavender `hot`, the flower on the comb. No spells here, so nothing writes
    // gold; lavender is 142 from `ink` and 103 clear of the nearest tier colour (decision 0032).
    palette: {
      tile: '#9a6a0c',
      tileEdge: '#6b4a08',
      floor: '#1c1203',
      ink: '#fbe7b5',
      hot: '#a78bfa',
      pip: 'hex',
      accent: '#d49a1e',
    },
    // HIVE's own face, sound and swarm: the same comb, grown.
    font: 'gluten',
    sfx: 'blip',
    victory: 'swarm',
  },
  petri: {
    // Agar green, with crystal violet for `hot`, the stain that shows a colony up. No spells here;
    // violet is 117 from `ink` and 103 clear of the nearest tier colour (decision 0032). A mark on
    // a covered tile is 2.9:1, green on green being the one pairing this palette has to watch.
    palette: {
      tile: '#447a5c',
      tileEdge: '#2f5641',
      floor: '#08140e',
      ink: '#d8f3e3',
      hot: '#a78bfa',
      // A drop of culture on the agar.
      pip: 'drop',
      accent: '#6fbf94',
    },
    // A laboratory instrument's readout.
    font: 'space-mono',
    // The culture bubbling.
    sfx: 'bubble',
    // Rings spreading outward, as a colony does.
    victory: 'ripple',
  },
  patrol: {
    // Olive drab, and an alarm red for `hot`, which on this board is also the "?" of a creature
    // walking on uncovered ground: DOMINOES's red, 83 clear of the tier-4 orange and 5.7:1 on the
    // floor. No spells, so nothing writes gold (decision 0032). A mark on a covered tile is 3.4:1.
    palette: {
      tile: '#5f6650',
      tileEdge: '#42473a',
      floor: '#13150e',
      ink: '#e9edc9',
      hot: '#ff4d6d',
      // A sergeant's stripe.
      pip: 'chevron',
      accent: '#8a9170',
    },
    // Typed, like the sentry post's log.
    font: 'courier-prime',
    // The sentry's watch ticking, and the ranks marched off.
    sfx: 'clock',
    victory: 'march',
  },
  sprinkle_donut: {
    // Vanilla icing over the dough: a covered tile is the glaze, uncovered ground the warm dough
    // under it, and every pair of creatures a sprinkle on the glaze, drawn in `hot`. So `hot` is a
    // pink dark enough to read on the glaze (2.9:1, with the sprinkle's rim) and light enough for
    // a beaten creature's number on the floor (4.0:1), 169 from `ink`. No spells, so nothing
    // writes gold (decision 0032).
    palette: {
      tile: '#fbf5ee',
      tileEdge: '#e2d3c4',
      floor: '#4a2e17',
      ink: '#fbead6',
      hot: '#ff4f93',
      pip: 'ring',
      accent: '#ff79ad',
    },
    // DONUT's bakery-sign face (decision 0031), and its fryer.
    font: 'sniglet',
    sfx: 'bubble',
    // Falling chips, as sprinkles fall.
    victory: 'confetti',
  },
  hive: {
    // Honey amber for the hive, with its own pip. No spells here, so an amber `hot`
    // has no gold annotation to collide with (decision 0032).
    palette: {
      tile: '#b06a1d',
      tileEdge: '#7d4711',
      floor: '#251505',
      ink: '#f7dcb6',
      hot: '#ffab4f',
      pip: 'hex',
      accent: '#d68a33',
    },
    // Soft and gooey, like honey.
    font: 'gluten',
    sfx: 'blip',
    // The hive swarms.
    victory: 'swarm',
  },
  ...SHAPE_LOOKS,
  dungeon: {
    palette: {
      tile: '#6a5088',
      tileEdge: '#493761',
      floor: '#161020',
      ink: '#e2d6f0',
      hot: '#ffb86b',
      pip: 'cross',
      accent: '#9b7ad1',
    },
    // Gothic for a crawl, with digits that stay plain where blackletter's do not.
    font: 'pirata-one',
    // A crypt's organ.
    sfx: 'organ',
    victory: 'burn',
  },
  sudoku: {
    // `hot` is magenta: clear of `ink`, and gold is unavailable on a board covered in
    // givens drawn in GIVEN_COLOR (decision 0032).
    palette: {
      tile: '#7d4a8f',
      tileEdge: '#573165',
      floor: '#1c0f21',
      ink: '#ead2f2',
      hot: '#ff5dc8',
      pip: 'square',
      accent: '#b45cc9',
    },
    // The newspaper puzzle page.
    font: 'libre-franklin',
    // A pencil ticking against the clock.
    sfx: 'clock',
    victory: 'wipeDown',
  },
  blind: {
    // `hot` is a saturated azure: beside a neutral near-white `ink`, only saturation
    // separates. Kept bright because these boards draw the smallest cells. It matters
    // on a ladder that never beats a creature because a palette is a player setting,
    // worn on boards that do (decision 0032).
    palette: {
      tile: '#8a8a8a',
      tileEdge: '#616161',
      floor: '#1a1a1a',
      ink: '#e8e8e8',
      hot: '#3fb8f0',
      pip: 'ring',
      accent: '#bdbdbd',
    },
    // An instrument readout.
    font: 'space-mono',
    sfx: 'thud',
    victory: 'wipeRadial',
  },
  seer: {
    // Night indigo, for the search board that carries a spellbook. `hot` is a hot pink: 157
    // from the pale `ink`, 134 clear of GIVEN_COLOR's gold (Reveal writes givens here) and 207
    // of Census's cyan; 6.5:1 on the floor (decision 0032). The ring pip is BLIND's, since a
    // SEER board is a BLIND board with mana.
    palette: {
      tile: '#3d4a8a',
      tileEdge: '#28315e',
      floor: '#0c0f22',
      ink: '#dcdcf0',
      hot: '#ff5aa0',
      pip: 'ring',
      accent: '#5b7bd5',
    },
    // A crystal-ball reading: soft and rounded, where BLIND's readout is an instrument.
    font: 'comfortaa',
    sfx: 'glass',
    victory: 'wipeRadial',
  },
  augur: {
    // Old parchment and bronze: a reading, not a fight. `hot` is a deep teal, 198 from the warm
    // `ink`, 222 clear of GIVEN_COLOR's gold (the loadout writes no givens, but a palette is a
    // player setting worn on ladders that do), 107 clear of Census's cyan and 219 of the Augur
    // cream; 8.2:1 on the floor, and a mark on a covered tile 3.4:1, in NORMAL's range
    // (decision 0032).
    palette: {
      tile: '#7a5f33',
      tileEdge: '#52401f',
      floor: '#1e1710',
      ink: '#f1e4c6',
      hot: '#2ec4b6',
      pip: 'triangle',
      accent: '#c9a227',
    },
    // A temple inscription, as ORACLE wears: the other reader of signs.
    font: 'cinzel',
    // A lyre at the temple door.
    sfx: 'pluck',
    victory: 'ripple',
  },
  huge_blind: {
    palette: {
      tile: '#7a8288',
      tileEdge: '#545a5f',
      floor: '#14181a',
      ink: '#dde3e6',
      hot: '#7fb4d8',
      pip: 'ringDiamond',
      accent: '#a8b4bb',
    },
    // The tallest digits here on a condensed body, for the smallest cells.
    font: 'big-shoulders',
    sfx: 'thud',
    victory: 'cascade',
  },
};

/** A ladder's look. A ladder without one wears NORMAL's, and fails `test/fonts.test.ts`. */
export function lookFor(typeId: string): LadderLook {
  // Looked up as LOOKS's own key: a palette id comes from a save, and may be anything.
  return Object.hasOwn(LOOKS, typeId) ? LOOKS[typeId]! : LOOKS.normal!;
}

/** A ladder's palette, or a palette the player picked by its ladder's id. */
export function themeFor(typeId: string): TypeTheme {
  return lookFor(typeId).palette;
}

/** Every ladder with a look: every palette the player can pick. The palette window sorts them. */
export const LOOK_IDS: readonly string[] = Object.keys(LOOKS);
