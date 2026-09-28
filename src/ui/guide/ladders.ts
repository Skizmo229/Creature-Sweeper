/**
 * What each ladder asks of a player: the catalogue's section 7 (`docs/strategies.md`), for the
 * field guide's "how to play" on a ladder, in the game's own shorter words (decision 0059). The
 * notes are section 7's, in its order and under its headings, which `test/guide.test.ts` holds.
 * A note is filed under the ladders its bold lead names; one also reaches ladders it does not
 * name ("the shapes with magic"), and those are asked of the ladder data, never listed. DOM-free,
 * so the test can read it.
 */

import type { LadderType } from '../../engine/config.js';

export interface LadderNote {
  /** The catalogue's bold lead, without its full stop: the ladders it is about. */
  readonly heading: string;
  /** The ladders it is about beyond those its heading names, asked of their data. */
  readonly also?: (type: LadderType) => boolean;
  readonly body: string;
}

/** A ladder with spells whose boards are cut from their box: the shapes that carry magic. */
const shapedWithMagic = (type: LadderType): boolean => {
  const first = type.boards[0];
  return (type.spells?.length ?? 0) > 0 && !!first && first.cells < first.w * first.h;
};

export const LADDER_NOTES: readonly LadderNote[] = [
  {
    heading: 'EASY',
    body:
      'No Sweep, on purpose: this is where the sum rule is learned. Sparse boards and a large ' +
      'opening; the raw ring and the last cell clear most of it.',
  },
  {
    heading: 'NORMAL',
    body:
      'The classic game. Sweep appears, charged: ten cells opened by hand buy one press, and its ' +
      'label says how many cells are provable right now.',
  },
  {
    heading: 'EXTREME, ORACLE',
    body:
      'Strong tiers as common as weak, so a guess is as likely to land on a 5 as a 1. Reach ' +
      'level 3 first: it is where death stops being one fight away.',
  },
  {
    heading: 'WRAPAROUND',
    body:
      'No edges. Hover near the seam and the highlight jumps to the far side. Still the gentlest ' +
      'counted ladder: blank regions run on round the seam, and the opening is larger.',
  },
  {
    heading: 'HIVE',
    body:
      'Six neighbours, so numbers run lower and blank ground is commoner; it runs denser to ' +
      'compensate. The tricks are unchanged, only the ring is smaller.',
  },
  {
    heading: 'DONUT, CROSS, WRAPPED CROSS, DIAMOND, RAGGED CAVE',
    body:
      'Edges are information: a rim cell sees fewer cells, so work from the rim inwards. A ' +
      "cross's arms are corridor puzzles; stuck at a tip on WRAPPED CROSS, go round and work in " +
      'from the other end.',
  },
  {
    heading: 'GEAR, CARD, VALENTINES, STAR',
    body:
      'More rim: a gear has edges outside and round its hole, a card four holes, a heart a ' +
      'point, a star five points each narrowing to one cell. Start at the nearest edge and read ' +
      "inwards from every hole. A star's point is cleared from its tip, where a number over one " +
      'or two cells names them; the pentagon in the middle is the last and hardest ground. All ' +
      'four carry Reveal and Census.',
  },
  {
    heading: 'PYRAMID',
    body:
      'The bottom two rows start face up: empty ground open, every creature shown with its tier, ' +
      'in gold, alive. A shown creature is a mark the board wrote for you: subtract it from every ' +
      'number it touches, and kill it free when your level reaches it. Work up the steps; every ' +
      "row's ends are corners.",
  },
  {
    heading: 'ULTRA HIVE',
    body:
      'HIVE on a board that is itself a hexagon: six straight edges to read in from. Play it as ' +
      "HIVE with the rim's help.",
  },
  {
    heading: 'SPRINKLE DONUT',
    body:
      "DONUT's ring with every creature shown, two to a sprinkle, and PETRI DISH's growth rule. " +
      'Nothing is a guess about where, only about what: open the plain ground beside you (Sweep ' +
      'does it a ring at a time), count the sprinkles under every number, and take the free ' +
      'kills the counts give you. A mark on a sprinkle beside your ground lets you reach the cell ' +
      "past it, so name what you can and step over it. Sprinkles are tier-blind: a pair's halves " +
      'need not match.',
  },
  {
    heading: 'PETRI DISH',
    body:
      'The dish opens at its three largest blank areas, and you may only open a cell touching ' +
      'ground you have uncovered, so each colony grows from its edge. A mark beside your ground ' +
      'counts as ground while it touches some: naming a frontier creature lets you reach one ' +
      'cell past it, no further. Name what the last cell gives you to carry a colony on, and ' +
      'work all three colonies in turn; a guess in one is a frontier cell beside numbers, so it ' +
      'is cheap.',
  },
  {
    heading: 'DUNGEON',
    body:
      'Walk the corridors first (grade 0). Doorways are empty, and so are the room cells beside ' +
      'a doorway that touch the wall: the first step into a room is free, the second is the ' +
      'risk. You may only open within two cells of ground you have uncovered; marking is exempt, ' +
      'and if the board walls you in, the rule lifts.',
  },
  {
    heading: 'CHECKERBOARD',
    body:
      'The lone dark square (grade 1) and the colour caps (grade 2). The pencil refuses the ' +
      'wrong parity for a square; a mark does not.',
  },
  {
    heading: 'PAIRS, DOMINOES',
    body:
      "Met partner (grade 0), and the partner's tier where the number is shown. A creature's " +
      'ring empties fast once the cells around it open, so the last candidate standing is named ' +
      'without a guess. DOMINOES is a full double-six set, every pairing once: a tile found is a ' +
      'tile you no longer fear, and the last tiles are known before they are seen.',
  },
  {
    heading: 'PACKS, CONGA LINE',
    body:
      'The whole pack (grade 0) and the gap (grade 2); on CONGA LINE the bonds drawn between ' +
      'open members show the line, and its ends (grade 3).',
  },
  {
    heading: 'PATROL',
    body:
      'The creatures walk: a tier-t creature paces the edge of a square t cells a side, one cell ' +
      'per action, clockwise from its top-left corner. Every open and every Wait (W, free) is an ' +
      'action; marking is not. There is no Sweep. The board is sparse, so most creatures walk in ' +
      'plain sight as a ? on cleared ground. Read the numbers again after every move: they are ' +
      'the sums as the board stands now. A ? that has walked one side of its square has told you ' +
      'its tier. When nothing is proven, Wait rather than guess: it is free, and new numbers ' +
      "arrive. A mark is a route, not a claim: marking tier t on a cell draws that creature's " +
      'whole square from that corner and locks every covered cell of it, so a mark on the wrong ' +
      'corner locks ground that was safe.',
  },
  {
    heading: 'WORKOUT',
    body:
      'Exercise lends one level for one fight: a creature one tier past your level is a free ' +
      'kill for the price of a cast, and pays double EXP. The price rises with each cast and ' +
      'falls with each level.',
  },
  {
    heading: 'ARCANE, ORACLE, and the shapes with magic',
    also: shapedWithMagic,
    body:
      'Reveal names a cell and opens the empty ground around it: cast it on the cell you would ' +
      'otherwise guess. Census counts the creatures behind a number; aim it at a large number ' +
      'over few cells, where the count changes the answer. Exercise makes an unavoidable guess ' +
      'survivable. Beacon opens the largest untouched blank region.',
  },
  {
    heading: 'SUDOKU',
    body:
      'Tiers 0 to 8 are the nine digits: each row, column and box holds each once, and the empty ' +
      'cells are the opening. The neighbour sums are worth about fifteen clues; the rest is ' +
      'Sudoku, and no board needs a guess, because a wrong one kills several times over.',
  },
  {
    heading: 'BLIND, HUGE x BLIND',
    body:
      'Level 0, 1 HP, no fighting: win by uncovering every empty cell, and every creature is ' +
      'death. Only the tricks that prove a cell empty apply: a remainder of 0, subtraction to 0, ' +
      'and counting. Marks are flags, and the counters subtract them.',
  },
  {
    heading: 'SEER',
    body:
      'BLIND with Reveal, Census and Beacon, and denser for it. Nothing is killed, so exploring ' +
      'is the only mana: one Reveal in hand at the start, about one more over board 1 and two ' +
      'over board 10. Every guess is death, so never gamble with a Reveal affordable: Reveal on ' +
      'the cell you would open blind, Census on a large number over few cells, Beacon when the ' +
      'frontier has closed.',
  },
  {
    heading: 'AUGUR',
    body:
      "ARCANE's boards with Census and Augur: no spell opens a cell, so every guess is yours. " +
      'Augur where a number is spread over many cells and could all be at or below your level; ' +
      'Census where a large number sits over few. The pencil loses every tier above the ' +
      'strongest.',
  },
];

/** The ladder names a heading lists: "ARCANE, ORACLE, and the shapes with magic" lists two. */
export function namedIn(heading: string): string[] {
  return heading.split(/,\s*(?:and\s+)?/);
}

/** The notes about a ladder: those whose heading names it, and those that ask for it. */
export function notesFor(type: LadderType): LadderNote[] {
  return LADDER_NOTES.filter((n) => namedIn(n.heading).includes(type.name) || !!n.also?.(type));
}
