/**
 * What each trick is called and what it says, for whatever teaches it: the tutor's caption, the
 * school's script and the field guide (docs/teaching-plan.md). One entry per trick, named as
 * `docs/strategies.md` names it and stated in one short sentence of the game's own; the test in
 * `test/tricktext.test.ts` holds the names and the sections to the document, both ways.
 */

import type { TrickId } from './tricks.js';

export interface TrickText {
  /** The catalogue's heading for the trick, as sections 2 to 6 of `docs/strategies.md` bold it. */
  readonly name: string;
  /** The catalogue's section the trick is in: one per grade, 2 for grade 0 to 6 for grade 4. */
  readonly section: 2 | 3 | 4 | 5 | 6;
  /** The rule, in one sentence, with no numbers filled in. */
  readonly rule: string;
}

export const TRICK_TEXT: Readonly<Record<TrickId, TrickText>> = {
  'raw-ring': {
    name: 'The raw ring',
    section: 2,
    rule:
      'An open number at or below your level makes every covered cell around it safe: no one ' +
      'cell can hold more than the whole sum.',
  },
  'named-kill': {
    name: 'The free kill',
    section: 2,
    rule: 'A cell marked with a tier at or below your level is a creature you can kill for nothing.',
  },
  'met-partner': {
    name: 'Met partner',
    section: 2,
    rule:
      'Every creature has exactly one creature beside it, so a beaten creature already touching ' +
      'another has found its partner, and everything else around it is empty.',
  },
  corridor: {
    name: 'Corridors',
    section: 2,
    rule: 'Hallways are one cell wide and always empty, and so is the room cell a hallway arrives at.',
  },
  sprinkles: {
    name: 'The sprinkles',
    section: 2,
    rule:
      'Every creature is drawn where it stands: a covered cell with no sprinkle is empty ground, ' +
      'and a cell under one is a creature.',
  },
  'residual-ring': {
    name: 'Subtract what you can see',
    section: 3,
    rule:
      'Open ground counts 0 and a beaten creature counts its tier; take them off the number, and ' +
      'the rest obeys the raw-ring rule.',
  },
  'last-cell': {
    name: 'The last cell',
    section: 3,
    rule:
      'A number with one covered neighbour left has named it: that cell holds exactly what is ' +
      'still hidden.',
  },
  'census-ring': {
    name: 'Count the sprinkles',
    section: 3,
    rule:
      'When you know how many creatures share a hidden amount, each is worth at least 1, so the ' +
      'biggest is at most the amount less one for every other.',
  },
  'augur-cap': {
    name: 'The hidden tiers',
    section: 3,
    rule:
      'An Augur lists the tier of every creature hidden around a number, but not where: at or ' +
      'below your level the ring is free, and above it each cell is empty or a listed tier.',
  },
  counters: {
    name: 'The counters',
    section: 3,
    rule:
      'The LV buttons count the creatures of each tier still alive; a tier at 0 is gone, and no ' +
      'number hides one.',
  },
  'lone-dark': {
    name: 'The lone dark square',
    section: 3,
    rule:
      'Even tiers stand on light squares and odd tiers on dark, so if one dark square is left ' +
      'around a number and the hidden amount is even, that square is empty.',
  },
  'partner-number': {
    name: "The partner's tier",
    section: 3,
    rule:
      "A beaten creature's own number is its partner's tier, because nothing else it touches is " +
      'a creature.',
  },
  subtract: {
    name: 'Subtraction, or the 1-2-1',
    section: 4,
    rule:
      "When one number's covered cells all lie inside another's, the cells only the larger sees " +
      'hold the difference, exactly.',
  },
  overlap: {
    name: 'Overlap',
    section: 4,
    rule:
      'Two numbers that share some covered cells but not all: the cells each sees alone are ' +
      'bounded by the other.',
  },
  bounds: {
    name: 'Bounds',
    section: 4,
    rule:
      'One number on its own says what each of its cells can be: a hidden amount over a few ' +
      'cells puts a floor under every one.',
  },
  'colour-cap': {
    name: 'Colour caps',
    section: 4,
    rule:
      'A light square hides at most the largest even amount at or below what is hidden, and a ' +
      'dark square the largest odd one.',
  },
  'pack-gap': {
    name: "The pack's gap",
    section: 4,
    rule:
      'A covered cell beside a pack holds one of the tiers that pack has not shown yet, or ' +
      'nothing.',
  },
  'what-if': {
    name: 'Suppose, then follow it',
    section: 5,
    rule:
      'Suppose the cell is each candidate in turn and follow the numbers a step or two; a ' +
      'candidate the numbers cannot make is struck off.',
  },
  'line-reach': {
    name: "A line's ends",
    section: 5,
    rule:
      'A line grows only from its two ends, so the cells beside a middle member, and any the ' +
      'missing members cannot reach, are empty.',
  },
  accounted: {
    name: 'Accounted for',
    section: 6,
    rule:
      'Numbers whose covered cells do not overlap each account for their own hidden amount; what ' +
      'the counters say is left beyond that is spread over every other covered cell.',
  },
  'last-of-tier': {
    name: 'The last of a tier',
    section: 6,
    rule:
      'When the last creatures of a tier are all forced into numbers that cannot be made ' +
      'without one, no other cell holds that tier.',
  },
};
