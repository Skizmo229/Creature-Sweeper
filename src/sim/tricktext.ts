/**
 * What each trick is called and what it says, for whatever teaches it: the tutor's caption, the
 * school's script and the field guide (docs/teaching-plan.md). One entry per trick, in the
 * catalogue's words, so the game and `docs/strategies.md` speak with one voice; the test in
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
      'An open number at or below your level makes every covered cell around it safe: whatever ' +
      'is there adds up to that number, so no single one of them is more.',
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
      'Every creature has exactly one creature next to it, so a beaten creature that already ' +
      'touches another has found its partner, and everything else around it is empty ground.',
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
      'Every creature is drawn where it stands, so a covered cell with no sprinkle is empty ' +
      'ground and a cell under a sprinkle is a creature.',
  },
  'residual-ring': {
    name: 'Subtract what you can see',
    section: 3,
    rule:
      'Open ground counts 0 and a beaten creature counts its tier; take them off the number, and ' +
      'what is left obeys the raw-ring rule.',
  },
  'last-cell': {
    name: 'The last cell',
    section: 3,
    rule:
      'A number with exactly one covered neighbour left has named it: the cell holds whatever ' +
      'is still hidden, exactly.',
  },
  'census-ring': {
    name: 'Count the sprinkles',
    section: 3,
    rule:
      'When you know how many creatures share what is hidden, each is worth at least 1, so the ' +
      'biggest can be no more than the remainder less one for every other.',
  },
  'augur-cap': {
    name: 'The strongest one',
    section: 3,
    rule:
      'An Augur names the strongest creature around a number, so nothing hidden there is above ' +
      'it: at or below your level the whole ring is free, and above it no cell can be more.',
  },
  counters: {
    name: 'The counters',
    section: 3,
    rule:
      'The LV buttons show how many creatures of each tier are still alive; a tier whose ' +
      'counter reads 0 is gone, and no number hides one.',
  },
  'lone-dark': {
    name: 'The lone dark square',
    section: 3,
    rule:
      'Even tiers stand only on light squares and odd tiers only on dark, so if one dark square ' +
      'is left around a number and the hidden amount is even, that square is empty.',
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
      "When one number's covered cells all lie inside another's, the cells only the larger one " +
      'sees hold the difference, exactly.',
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
      'cells puts a floor under every one of them.',
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
      'Suppose the cell is each of its candidates in turn and follow the numbers a step or two; ' +
      'a candidate the numbers cannot accommodate is struck off.',
  },
  'line-reach': {
    name: "A line's ends",
    section: 5,
    rule:
      'A line continues only from its two ends, so the cells beside a member in the middle, and ' +
      'any the missing members could not reach, are empty.',
  },
  accounted: {
    name: 'Accounted for',
    section: 6,
    rule:
      'Numbers whose covered cells do not overlap each account for their own hidden amount; ' +
      'whatever the counters say is left beyond that is spread over every other covered cell.',
  },
  'last-of-tier': {
    name: 'The last of a tier',
    section: 6,
    rule:
      'When the last creatures of a tier are all forced into numbers that cannot be made ' +
      'without one, no other cell holds that tier.',
  },
};
