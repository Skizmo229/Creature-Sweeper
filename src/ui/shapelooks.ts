/**
 * The looks of the shape ladders: the boards cut from their box or joined at their edges. One
 * record per ladder, as `looks.ts` keeps for the rest; `LOOKS` there spreads this table in, so a
 * shape ladder's look is found the same way as any other's. Kept apart only for size: the two
 * tables together outgrew the 600 lines a file may run to.
 */

import type { LadderLook } from './looktypes.js';

/** The shape ladders' looks, by ladder id. */
export const SHAPE_LOOKS: Record<string, LadderLook> = {
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
    // An unglazed cake donut: golden-brown crust for a covered tile, the dark fried dough under
    // it for uncovered ground. `hot` is raspberry, 118 clear of the gold because Reveal writes
    // givens here, 156 from `ink`, and 5.5:1 on the floor (decisions 0032 and 0047).
    palette: {
      tile: '#c98d4e',
      tileEdge: '#95602c',
      floor: '#2a190c',
      ink: '#f5dfc0',
      hot: '#ff5577',
      pip: 'ring',
      accent: '#e0a060',
    },
    // Doughy, like a bakery sign.
    font: 'sniglet',
    // The fryer bubbling.
    sfx: 'bubble',
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
    // Clockwork, and the whole board turning as the gear turns.
    sfx: 'clock',
    victory: 'spin',
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
      // A suit, leaving the gems to DIAMOND.
      pip: 'club',
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
    // A serenade, and hearts let go like balloons.
    sfx: 'pluck',
    victory: 'float',
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
    // Fireworks in the night sky.
    victory: 'fireworks',
  },
};
