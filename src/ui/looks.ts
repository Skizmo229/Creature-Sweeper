/**
 * What each ladder looks and sounds like by default: one record per ladder, so a new ladder is one
 * entry. Kept DOM-free, apart from `theme.ts` and its canvas drawing, so the tests can hold every
 * ladder to its record (`test/fonts.test.ts`).
 *
 * The split the palettes keep: pip SHAPE carries ladder identity, pip COLOUR carries tier identity
 * and is global (`TIER_COLORS` in `theme.ts`), so a tier-4 creature looks the same everywhere.
 * Every face and effect here was checked on its own palette at a 16px cell before it was chosen;
 * two ladders may share a face (decision 0031).
 */

import type { LadderLook, TypeTheme } from './looktypes.js';

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
      pip: 'diamond',
      accent: '#7b6bff',
    },
    // Clipped corners: aggressive without losing a digit's shape.
    font: 'chakra-petch',
    sfx: 'blip',
    victory: 'burst',
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
    victory: 'cascade',
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
      pip: 'diamond',
      accent: '#7e5bd6',
    },
    // A temple inscription: Delphi.
    font: 'cinzel',
    sfx: 'glass',
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
    victory: 'wipe',
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
    // Thud is the clack of a tile set down. Cascade is the one clear effect in
    // the game that is already a row of things falling over in sequence.
    sfx: 'thud',
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
    // One after another, in order: the effect that is already a line of things
    // going by in sequence.
    sfx: 'chime',
    victory: 'cascade',
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
    victory: 'pop',
  },
  wraparound: {
    palette: {
      tile: '#1d6a9e',
      tileEdge: '#134a70',
      floor: '#061622',
      ink: '#c6e4f5',
      hot: '#4fb8f0',
      pip: 'circle',
      accent: '#3b93c4',
    },
    // Digits drawn from loops, on a board that loops.
    font: 'comfortaa',
    sfx: 'chime',
    victory: 'wipeRadial',
  },
  donut: {
    // Strawberry frosting. `hot` is rose, clear of the gold, because Reveal writes
    // givens here (decision 0032).
    palette: {
      tile: '#a8324f',
      tileEdge: '#78203a',
      floor: '#260a13',
      ink: '#f2c9d3',
      hot: '#ff7a9c',
      pip: 'ring',
      accent: '#d4536f',
    },
    // Doughy, like a bakery sign.
    font: 'sniglet',
    sfx: 'chime',
    victory: 'ripple',
  },
  cross: {
    palette: {
      tile: '#4a8f3a',
      tileEdge: '#316526',
      floor: '#0c2108',
      ink: '#d2eec7',
      hot: '#8ce06a',
      pip: 'square',
      accent: '#6bb054',
    },
    // A crossroads, in the US highway-sign face.
    font: 'overpass',
    sfx: 'blip',
    victory: 'wipe',
  },
  wrapped_cross: {
    palette: {
      tile: '#2f8f7e',
      tileEdge: '#1f6356',
      floor: '#08211c',
      ink: '#c9eee4',
      hot: '#4fe0b8',
      pip: 'cross',
      accent: '#4fb39c',
    },
    // Squared-off loops: halfway between its two parents.
    font: 'exo-2',
    sfx: 'chime',
    victory: 'wipe',
  },
  diamond: {
    palette: {
      tile: '#8f3fa0',
      tileEdge: '#652a73',
      floor: '#210a26',
      ink: '#f0cdf7',
      hot: '#e072ff',
      pip: 'diamond',
      accent: '#b45cc4',
    },
    // Thick and hairline strokes, like cut facets.
    font: 'abril-fatface',
    sfx: 'glass',
    victory: 'sparkle',
  },
  cave: {
    palette: {
      tile: '#8a7050',
      tileEdge: '#5f4c36',
      floor: '#1a1410',
      ink: '#ecdfcd',
      hot: '#ffb04f',
      pip: 'circle',
      accent: '#ad9270',
    },
    // Softened corners, like worn stone.
    font: 'rubik',
    sfx: 'thud',
    victory: 'burn',
  },
  pyramid: {
    // Sandstone, darkened until the green mark reads on it (2.6:1, EASY's olive was the warning),
    // with a lapis `hot`: gold is out, because the base rows and Reveal both write givens here,
    // and lavender sits 90 clear of Census's cyan and 103 of the nearest tier colour (decision 0032).
    palette: {
      tile: '#937232',
      tileEdge: '#6a5223',
      floor: '#1e1709',
      ink: '#f4e6c4',
      hot: '#a78bfa',
      pip: 'triangle',
      accent: '#c49a4a',
    },
    // Carved capitals, as on a monument.
    font: 'cinzel',
    // Stone set on stone, and blocks that tumble when it is done.
    sfx: 'thud',
    victory: 'tumble',
  },
  gear: {
    // Gunmetal, with a `hot` of red-hot metal: DOMINOES's red, 83 clear of the tier-4 orange and 123
    // of the gold that Reveal writes here, and 5.7:1 on the floor (decision 0032).
    palette: {
      tile: '#5a6470',
      tileEdge: '#3d454e',
      floor: '#111418',
      ink: '#dde4ea',
      hot: '#ff4d6d',
      pip: 'gear',
      accent: '#8a97a6',
    },
    // Machined corners.
    font: 'chakra-petch',
    sfx: 'thud',
    // A ring turning out from the centre, like the gear itself.
    victory: 'wipeRadial',
  },
  card: {
    // A red card back on green baize, ivory ink. `hot` is lavender: gold is out because Reveal
    // writes givens here, and it sits 90 clear of Census's cyan and 103 of the nearest tier colour
    // (decision 0032). A mark on a covered tile is 4.2:1.
    palette: {
      tile: '#9e2a33',
      tileEdge: '#6f1d24',
      floor: '#0d1f16',
      ink: '#f5ecd9',
      hot: '#a78bfa',
      pip: 'diamond',
      accent: '#c9404b',
    },
    // A card's index is a bookish serif.
    font: 'libre-baskerville',
    sfx: 'chime',
    // The creatures bounce off leaving trails: the card game everyone has watched finish.
    victory: 'cascade',
  },
  valentines: {
    // Deep rose on a wine floor. `hot` is lavender: gold is out because Reveal writes givens here,
    // and it sits 90 clear of Census's cyan and 103 of the nearest tier colour (decision 0032).
    palette: {
      tile: '#b0254f',
      tileEdge: '#7d1a38',
      floor: '#22070f',
      ink: '#fbd3df',
      hot: '#a78bfa',
      pip: 'heart',
      accent: '#e0487a',
    },
    // Bouncy and warm, PAIRS's face, for another ladder about couples.
    font: 'baloo-2',
    sfx: 'chime',
    victory: 'confetti',
  },
  star: {
    // A night sky, with ORACLE's rose for `hot`: gold is out because Reveal writes givens here,
    // and it sits 76 clear of the tier-5 pink and 124 of the gold (decision 0032).
    palette: {
      tile: '#3a55a0',
      tileEdge: '#27396e',
      floor: '#080c1c',
      ink: '#dfe7ff',
      hot: '#fa4f7a',
      pip: 'star',
      accent: '#6f8fe0',
    },
    // A theatre marquee: a name in lights.
    font: 'bungee',
    sfx: 'glass',
    victory: 'sparkle',
  },
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
    sfx: 'thud',
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
    sfx: 'glass',
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
  return LOOKS[typeId] ?? LOOKS.normal!;
}

/** A ladder's palette, or a palette the player picked by its ladder's id. */
export function themeFor(typeId: string): TypeTheme {
  return lookFor(typeId).palette;
}

/** Every ladder with a look, which is also every palette the player can pick, in ladder order. */
export const LOOK_IDS: readonly string[] = Object.keys(LOOKS);
