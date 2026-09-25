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

import type { FontId } from './typefaces.js';

export type PipShape = 'circle' | 'square' | 'diamond' | 'hex' | 'cross' | 'ring' | 'ringDiamond';

export interface TypeTheme {
  /** Covered tile. */
  tile: string;
  /** Covered tile's shaded edge, for the bevel. */
  tileEdge: string;
  /** Uncovered ground. */
  floor: string;
  /** Number ink on open ground. */
  ink: string;
  /** This type's danger accent — used for the number on a creature's cell. */
  hot: string;
  pip: PipShape;
  /** UI accent for this type. */
  accent: string;
}

/** Sound packs. See `sfx.ts` — each is a set of synthesis recipes, not files. */
export type SfxPackId = 'chime' | 'blip' | 'thud' | 'glass';

/**
 * Board-clear celebrations. See `victory.ts`.
 *
 * Two families. The first four are ambient — decoration drawn over the board,
 * knowing nothing about what is underneath. The rest animate the board's own
 * creature glyphs, which is why they need the renderer to hand those glyphs
 * over for the length of the animation.
 */
export type VictoryId =
  | 'confetti'
  | 'burst'
  | 'ripple'
  | 'sparkle'
  | 'tumble'
  | 'cascade'
  | 'pop'
  | 'burn'
  | 'wipe'
  | 'wipeDown'
  | 'wipeRadial';

/** A ladder's defaults. The player can override each; this is what "game type default" means. */
export interface LadderLook {
  palette: TypeTheme;
  font: FontId;
  sfx: SfxPackId;
  victory: VictoryId;
}

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
    // `hot` is rose rather than the light violet it shipped with, for the same
    // reason PAIRS moved: at #c08bff it sat 75 RGB units from `ink`, so a
    // creature's number and an ordinary number read as one pale lavender. The
    // warm fix PAIRS took is NOT available here — this ladder carries Reveal,
    // which writes GIVEN_COLOR, and an amber `hot` lands 58 units off that gold.
    // Rose clears the gold by 124, clears Census's cyan, and keeps the violet
    // family the palette is built on. 181 from `ink`, and 5.8:1 on the floor —
    // the same contrast NORMAL and HUGE x EXTREME have always shipped.
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
    // `hot` is amber rather than the pale orange it shipped with, and on this
    // ladder that is legibility rather than taste. A defeated creature's number
    // is its PARTNER'S TIER, so it is the one number on the board that most
    // needs to be told apart from an ordinary floor number at a glance. It is
    // not drawn on pairing boards at the moment (see `BoardView.drawOpen`), so
    // this is kept for if it comes back — and #ffb07a sat 85 units from `ink` in RGB,
    // which reads as the same pale colour. Amber is 139 away and also contrasts
    // BETTER against the floor (11.3:1 against 10.1), so nothing was traded.
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
    // Wolf grey with amber eyes: a pack. Measured the same way as the rest — `hot`
    // 178 from `ink` and 10.4:1 on the floor, and a mark on a covered tile 3.3:1,
    // in NORMAL's range. No spells here, so an amber `hot` has no gold annotation
    // to collide with.
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
    // HIVE and DONUT traded palettes, by request: honey amber for the hive, and
    // DONUT in strawberry frosting. Only the colours moved — each kept its own
    // pip. The trade also fixed DONUT's `hot`: that ladder carries Reveal, and
    // the amber it had sat 27 units from GIVEN_COLOR's gold; the rose it has now
    // is 108 clear, and 97 from its own `ink`. HIVE has no spells, so amber is
    // safe there, 114 from `ink`.
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
    // Magenta, not the light violet it shipped with (74 units from `ink`, which
    // reads as the same colour). Gold is doubly unavailable on this ladder:
    // every given is drawn in GIVEN_COLOR, so an amber `hot` would be 21 units
    // from the one annotation this board is covered in. Magenta is 160 clear of
    // it and 126 from `ink`, at 6.7:1 on the floor.
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
    // A saturated azure rather than the pale blue it shipped with. This is the
    // hardest `ink` in the set to sit beside — a neutral near-white — so the
    // only thing that separates from it is SATURATION, not hue: #9fd8ff was 78
    // units away and #3fb8f0 is 176. Kept bright (7.7:1) rather than taken
    // darker for a few more units of separation, because this ladder's boards
    // are among the largest in the game and so are drawn at the smallest cells.
    //
    // Worth knowing why this matters at all on a ladder that never defeats a
    // creature: a palette is a PLAYER setting, so BLIND's is worn on boards
    // that do.
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
