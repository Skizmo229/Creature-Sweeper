/**
 * What each ladder asks of a player: the catalogue's section 7 (`docs/strategies.md`), for the
 * field guide's "how to play" on a ladder. Copied word for word, as the rest of the guide is, and
 * held to the catalogue by `test/guide.test.ts`. A note is filed under the ladders its bold lead
 * names; one also reaches ladders it does not name ("the shapes with magic"), and those are asked
 * of the ladder data, never listed. DOM-free, so the test can read it.
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
      'No Sweep button, on purpose: it is where the sum rule is learned. Boards are sparse and ' +
      'the opening large; the raw ring and the last cell clear most of it.',
  },
  {
    heading: 'NORMAL',
    body:
      'The classic game and the calibration for everything else. Sweep appears, charged: ten ' +
      "cells opened by hand buy one press, and the button's label tells you how many cells are " +
      'provable right now even before you press it.',
  },
  {
    heading: 'EXTREME, ORACLE',
    body:
      'Strong tiers as common as weak ones, so no number is safely assumed and a guess is as ' +
      'likely to land on a 5 as a 1. Level 3 is the goal of the opening, because it is where ' +
      'death stops being one fight away.',
  },
  {
    heading: 'WRAPAROUND',
    body:
      'No edges. Hover a cell near the seam and the highlight jumps to the far side; a number on ' +
      'the rim sees eight cells like any other. Measured, it is still the gentlest of the counted ' +
      'ladders, because zero regions run on round the seam and the opening is larger.',
  },
  {
    heading: 'HIVE',
    body:
      'Six neighbours, so every number is lower and blank ground commoner; it runs denser to ' +
      'compensate. The tricks are unchanged; only the ring is smaller.',
  },
  {
    heading: 'DONUT, CROSS, WRAPPED CROSS, DIAMOND, RAGGED CAVE',
    body:
      'Edges are information: a rim cell sees fewer cells, so work from the rim inwards. A ' +
      "cross's arms are corridor puzzles; stuck at the tip of one on WRAPPED CROSS, go round and " +
      'work in from the other end.',
  },
  {
    heading: 'GEAR, CARD, VALENTINES, STAR',
    body:
      'The same rule with more rim: a gear has edges outside and round its hole, a card has four ' +
      "holes cut where the suits sit, a heart tapers to a point, and each of a star's five points " +
      'narrows to a single cell that sees almost nothing. Start at whichever edge the opening ' +
      "left you nearest and read inwards from every hole; a star's point is cleared from its " +
      'tip, where a number over one or two cells names them outright, and the pentagon in the ' +
      'middle is the last and hardest ground. All four carry Reveal and Census.',
  },
  {
    heading: 'PYRAMID',
    body:
      'The bottom two rows start face up: their empty ground open and every creature there shown ' +
      'with its tier, in gold, alive and waiting. A shown creature is a mark the board wrote for ' +
      'you, so subtract it from every number it touches from the first click, and take it as a ' +
      'free kill the moment your level reaches it; the base is your level-up larder. Work up the ' +
      "steps, each row a cell narrower on either side, so every row's ends are corners.",
  },
  {
    heading: 'ULTRA HIVE',
    body:
      "HIVE's hexagons on a board that is itself a hexagon: six straight edges to read in from, " +
      'and every number still the sum of six neighbours at most. Play it as HIVE with the ' +
      "rim's help.",
  },
  {
    heading: 'SPRINKLE DONUT',
    body:
      "DONUT's ring with every creature shown, two to a sprinkle, and PETRI DISH's growth rule " +
      'from a single opening. Nothing is ever a guess about where, only about what: open the ' +
      'plain ground beside you freely (Sweep does it a ring at a time), count the sprinkles under ' +
      'every number, and take the free kills the counts give you to level. The walls are pairs ' +
      'standing shoulder to shoulder; a mark on a sprinkle beside your ground lets you reach the ' +
      'cell past it, so name what you can and step over it. The sprinkles are tier-blind, so a ' +
      "pair's two halves need not match.",
  },
  {
    heading: 'PETRI DISH',
    body:
      'A round dish that opens at its three largest blank areas, and you may only open a cell ' +
      'touching ground you have uncovered, so each colony grows from its own edge. A mark you ' +
      'make beside uncovered ground counts as ground for that purpose while it touches some: ' +
      'naming a creature on the frontier lets you reach one cell past it, and no further, since ' +
      'marks never chain. So the two habits that pay are naming what the last cell trick gives ' +
      'you, to carry the colony past it, and working all three colonies in turn, because a guess ' +
      'in one is always a frontier cell beside numbers and therefore cheap.',
  },
  {
    heading: 'DUNGEON',
    body:
      'Walk the corridors first (grade 0). Doorways are empty, and so are the room cells beside a ' +
      'doorway that touch the wall, so the first step into a room is free and the second is the ' +
      'risk. You may only open within two cells of ground you have uncovered; marking is exempt, ' +
      'and if the board walls you in the rule lifts.',
  },
  {
    heading: 'CHECKERBOARD',
    body:
      'The lone dark square (grade 1) and the colour caps (grade 2). The pencil refuses the wrong ' +
      'parity for a square; a mark does not, so a wrong-parity mark is your own.',
  },
  {
    heading: 'PAIRS, DOMINOES',
    body:
      "Met partner (grade 0), and the partner's tier where the number is shown. A creature's " +
      'ring empties fast once the cells around it open, so the last candidate standing is named ' +
      'without a guess. DOMINOES is a full double-six set: every pairing once, so a tile you have ' +
      'found is a tile you no longer fear, and the last tiles are known before they are seen.',
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
      'The creatures walk. A tier-t creature paces the edge of a square t cells a side, one cell ' +
      'per action, clockwise from its top-left corner, and every open, every Sweep and every Wait ' +
      '(W, free) is an action; marking and pencilling are not. The board is sparse (6.5 to ' +
      '8.5%), so the opening uncovers most of it and most creatures walk in plain sight as a ? on ' +
      'ground you have already cleared. Three habits and one warning. Read the numbers again ' +
      'after every move, because they are the sums as the board stands now, and what you proved ' +
      'a move ago may be gone; a ? you can see is a creature you know the tier of once it has ' +
      'walked one side of its square, since a side is its tier long. When nothing is proven, ' +
      'Wait rather than guess: waiting is free, the creatures move, and new numbers arrive; one ' +
      'lap of the largest creature, four times its tier in moves, shows it on every cell it can ' +
      'stand on. A mark is a route, not a claim: marking a tier t on a cell draws that ' +
      "creature's whole square from that corner and locks every covered cell of it, which is how " +
      'you fence off where a creature can step, and why Sweep reads no marks here. The warning: ' +
      'a mark on the wrong corner fences the wrong cells and locks ground that was safe.',
  },
  {
    heading: 'WORKOUT',
    body:
      'Exercise lends one level for one fight; a creature named at one tier past your level is a ' +
      'free kill for the price of a cast, and pays double EXP for it. The price rises with each ' +
      'cast and falls with each level.',
  },
  {
    heading: 'ARCANE, ORACLE, and the shapes with magic',
    also: shapedWithMagic,
    body:
      'Reveal names a cell as a fact and opens the empty ground around it, so cast it on the ' +
      'cell you would otherwise guess. Census counts the creatures behind a number; sum plus ' +
      'count usually pins the layout, but only where the count changes the answer, so aim it at ' +
      'a large number over few cells. Exercise makes an unavoidable guess survivable rather than ' +
      'avoidable. Beacon opens the largest untouched blank region, when you can afford it.',
  },
  {
    heading: 'SUDOKU',
    body:
      'Tiers 0 to 8 are the nine digits, so each row, column and box holds each once and the ' +
      'empty cells are the opening. The neighbour sums are worth about fifteen clues; the rest is ' +
      "Sudoku's own tricks, and every board is built to need no guess, because a wrong one kills " +
      'several times over.',
  },
  {
    heading: 'BLIND, HUGE x BLIND',
    body:
      'Level 0, 1 HP, no fighting: the board is won by uncovering every empty cell, and every ' +
      'creature is death. Only the tricks that prove a cell empty apply: the remainder of 0, ' +
      'subtraction to 0, and the counting tricks. Marks are flags and the counters subtract them.',
  },
  {
    heading: 'SEER',
    body:
      'BLIND with Reveal, Census and Beacon, and denser for it. Nothing is killed, so exploring is ' +
      'the only mana: one Reveal in hand at the start, about one more earned over board 1 and two ' +
      'over board 10. Every guess is death, so the spend rule is absolute: never gamble with a ' +
      'Reveal affordable. Reveal on the cell you would otherwise open blind; Census on a large ' +
      'number over few cells; Beacon when the frontier has closed and blank ground is left ' +
      'somewhere.',
  },
  {
    heading: 'AUGUR',
    body:
      "ARCANE's boards with Census and Augur only: no spell will open a cell for you, so every " +
      'guess is still yours. Augur where a number is spread over many cells and could be all at ' +
      'or below your level, which frees the ring; Census where a large number sits over few. ' +
      'Sum, count and strongest together pin most rings, and the pencil loses every tier above ' +
      'the strongest.',
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
