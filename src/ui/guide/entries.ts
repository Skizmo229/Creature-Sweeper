/**
 * The field guide's words (docs/teaching-plan.md, section 6): the catalogue, `docs/strategies.md`,
 * sections 1 to 6, 8 and 9, as a player reads it in the game. The shape is the catalogue's and
 * `test/guide.test.ts` holds it to it: every section one of its sections, every heading one of
 * its bold leads, every trick an entry, every diagram in the entry of its trick, and every entry's
 * ladders the ones the catalogue names. The words are the game's own, shorter than the
 * catalogue's (decision 0059). DOM-free, so the test can read it; `src/ui/screens/guide.ts` draws
 * it.
 */

import type { LadderType } from '../../engine/config.js';
import { isPlacement, placementRule } from '../../engine/placement/registry.js';
import { NOTHING_EMPTIED, type PlacementRule } from '../../engine/placement/rule.js';
import { isShape, shapeRule } from '../../engine/shape/registry.js';
import type { ShapeRule } from '../../engine/shape/rule.js';
import { type Diagram, DIAGRAMS } from '../../sim/diagrams.js';
import type { Grade, TrickId } from '../../sim/tricks.js';

/** One block of an entry: a paragraph, a diagram drawn as a board, a list, or the damage table. */
export type Block =
  | string
  | { readonly diagram: Diagram }
  | { readonly list: readonly string[] }
  | { readonly table: 'damage' };

/** What an entry's ladders are asked of: the rules, and the spells the ladder offers. */
export interface LadderRules {
  readonly placement: PlacementRule;
  readonly shape: ShapeRule;
  readonly spells: readonly string[];
}

export interface GuideEntry {
  /** The catalogue's bold lead, without its full stop; absent for an entry that is a list. */
  readonly heading?: string;
  /** The trick it teaches, where it is one of the graded player's. */
  readonly trick?: TrickId;
  /** The ladders it belongs to, asked of their rules; absent for every ladder. */
  readonly on?: (rules: LadderRules) => boolean;
  readonly body: readonly Block[];
}

export interface GuideSection {
  /** The catalogue's section heading, without its number. */
  readonly title: string;
  /** The grade of every trick in it, for the catalogue's sections 2 to 6. */
  readonly grade?: Grade;
  readonly intro?: readonly string[];
  readonly entries: readonly GuideEntry[];
}

/** The rules a ladder is played by. */
function rulesOf(type: LadderType): LadderRules {
  const placement = type.placement ?? 'uniform';
  const shape = type.shape ?? 'rect';
  if (!isPlacement(placement) || !isShape(shape)) {
    throw new Error(`${type.id}: no rule for "${placement}" or "${shape}"`);
  }
  return {
    placement: placementRule(placement),
    shape: shapeRule(shape),
    spells: type.spells ?? [],
  };
}

/** The ladders an entry belongs to, in the menu's order; every ladder for a general entry. */
export function laddersFor(entry: GuideEntry, ladders: readonly LadderType[]): LadderType[] {
  const on = entry.on;
  return on ? ladders.filter((t) => on(rulesOf(t))) : [...ladders];
}

/**
 * The entries that belong to one ladder alone among the guide's: the tricks its placement rule or
 * shape adds, asked of the rules. A ladder with any gets a card the first time it is opened
 * (docs/teaching-plan.md, section 5.5).
 */
export function ownEntries(type: LadderType): GuideEntry[] {
  return GUIDE.flatMap((s) => s.entries).filter((e) => e.on?.(rulesOf(type)));
}

/** The `n`th of a trick's diagrams, in the catalogue's order. */
function drawing(trick: TrickId, n = 0): { diagram: Diagram } {
  const diagram = DIAGRAMS.filter((d) => d.trick === trick)[n];
  if (!diagram) throw new Error(`${trick} has no diagram ${n}`);
  return { diagram };
}

const pairs = (r: LadderRules): boolean => r.placement.groups === 'pairs';
const packs = (r: LadderRules): boolean => r.placement.groups === 'packs';
/** A pack rule that proves cells empty from what is open: packs strung into lines. */
const lines = (r: LadderRules): boolean => packs(r) && r.placement.emptied !== NOTHING_EMPTIED;
const shown = (r: LadderRules): boolean => r.placement.display.showsCreatures;
/** Where a square's position decides which tiers may stand on it: the checkerboard's colours. */
const colours = (r: LadderRules): boolean =>
  r.placement.pools.forTier(1) !== r.placement.pools.forTier(2);
const hallways = (r: LadderRules): boolean => r.shape.hallways;
/** A ladder whose loadout has Augur: asked of the data, never of a name (CLAUDE.md). */
const augur = (r: LadderRules): boolean => r.spells.includes('augur');

/** What the guide says before its first section: the grades in a breath. */
export const GUIDE_INTRO: readonly string[] = [
  'The grades are how much you hold in your head at once: grade 0 one cell, grade 1 one number, ' +
    'grade 2 two numbers, grade 3 a supposition followed a step or two, grade 4 the whole board. ' +
    'A grade-1 player clears a great many boards; the rest is for the hard ladders.',
];

/** The damage table's tiers and levels, as the catalogue's section 1 lays it out. */
export const DAMAGE_TABLE = { tiers: [2, 3, 4, 5, 6], levels: [1, 2, 3, 4, 5] } as const;

/** The section the tutor sends a player to at a guess. */
export const GUESSING_WELL = 'Guessing well';

export const GUIDE: readonly GuideSection[] = [
  {
    title: 'Three things to know before the first click',
    entries: [
      {
        heading: 'A number is the sum of the tiers around it, not a count',
        body: [
          'A 4 might be one tier 4, two 2s, a 3 and a 1, or four 1s. A 9 fits behind a cell with ' +
            'only eight neighbours.',
        ],
      },
      {
        heading: 'Your level is a shield, and it is the only one',
        body: [
          'A creature at or below your level dies in one blow for nothing. Above it the cost ' +
            'climbs in steps: one tier over costs that tier, two over is a cliff.',
          { table: 'damage' },
          'Death is at 0 exactly. At level 1 a tier 4 or 5 kills you from full health, and at ' +
            'level 2 a tier 5 still does. From level 3 nothing on a five-tier board kills in one ' +
            'fight, and a guess becomes a price.',
        ],
      },
      {
        heading: 'Every board can be cleared without losing a point',
        body: [
          'The EXP each level needs is always on the board among creatures you can kill for ' +
            'free. HP goes on nothing but guesses and misreads, so the question is never "what ' +
            'is this cell" but "is anything here above my level".',
        ],
      },
    ],
  },
  {
    title: 'Grade 0: a glance',
    grade: 0,
    entries: [
      {
        heading: 'The raw ring',
        trick: 'raw-ring',
        body: [
          'An open number at or below your level makes every covered cell around it safe: no one ' +
            'cell can hold more than the whole sum. At level 2:',
          drawing('raw-ring'),
          'All five covered cells are free. Nothing to add up; compare the number with your ' +
            'level. Learn this one first.',
        ],
      },
      {
        heading: 'The free kill',
        trick: 'named-kill',
        body: [
          'A cell marked with a tier at or below your level is a creature you can kill for ' +
            'nothing. Mark below your level and harvest when the level comes; levelling is what ' +
            'turns the rest of the board free.',
        ],
      },
      {
        heading: 'Met partner',
        trick: 'met-partner',
        on: pairs,
        body: [
          'Every creature has exactly one creature beside it. A beaten creature already touching ' +
            'another has found its partner, so everything else around it is empty ground, at any ' +
            'level.',
        ],
      },
      {
        heading: 'Corridors',
        trick: 'corridor',
        on: hallways,
        body: [
          'Hallways are one cell wide and always empty, and so is the room cell a hallway ' +
            "arrives at. A one-cell notch in a room's wall is not a hallway: it is room floor, " +
            'and can hold a creature.',
        ],
      },
      {
        heading: 'The whole pack',
        on: packs,
        body: [
          'A pack is one creature of every tier, standing together and touching no other pack. ' +
            'A pack that has shown every tier is finished: every covered cell around it is empty ' +
            'ground.',
        ],
      },
      {
        heading: 'The sprinkles',
        trick: 'sprinkles',
        on: shown,
        body: [
          'Every creature is drawn where it stands, each pair as one sprinkle across two cells. ' +
            'No sprinkle means empty ground, free at any level; a sprinkle means a creature, ' +
            'never ground.',
        ],
      },
    ],
  },
  {
    title: 'Grade 1: one number',
    grade: 1,
    entries: [
      {
        heading: 'Subtract what you can see',
        trick: 'residual-ring',
        body: [
          'Open ground counts 0 and a beaten creature counts its tier, so take them off the ' +
            'number first. What is left obeys the raw-ring rule: at or below your level, every ' +
            'covered cell is free; 0, they are all empty ground. At level 2:',
          drawing('residual-ring'),
          'Each 5 sees a beaten 3, so 2 is hidden over the two covered cells, and both are free. ' +
            'Hover a beaten creature to see its own number, except on PAIRS and DOMINOES, where ' +
            'it is hidden.',
        ],
      },
      {
        heading: 'The last cell',
        trick: 'last-cell',
        body: [
          'A number with one covered neighbour left has named it: that cell holds exactly what ' +
            'is still hidden.',
          drawing('last-cell'),
          'That cell is a tier 4. Mark it and come back at level 4; until then the mark locks it ' +
            'against a slip. Every cell named is a tier subtracted from every other number it ' +
            'touches, which names the next.',
        ],
      },
      {
        heading: 'The counters',
        trick: 'counters',
        body: [
          'The LV buttons count the creatures of each tier still alive. A tier at 0 is gone, so ' +
            'no number hides one: with no 5s left, a 5 over two cells is a 4 and a 1, or a 3 and ' +
            'a 2. When every tier alive is at or below your level, the whole board is free. Read ' +
            'the counters before every guess.',
        ],
      },
      {
        heading: 'The lone dark square',
        trick: 'lone-dark',
        on: colours,
        body: [
          'Even tiers stand on light squares, odd tiers on dark, and empty ground anywhere. ' +
            "Light squares add up to an even amount, so a number's parity comes from its dark " +
            'neighbours alone: one dark square left and an even hidden amount means that square ' +
            'is empty, at any level.',
        ],
      },
      {
        heading: "The partner's tier",
        trick: 'partner-number',
        on: pairs,
        body: [
          "A beaten creature's own number is its partner's tier, since nothing else it touches " +
            'is a creature. One covered neighbour left is the partner, tier known; a number at ' +
            'or below your level frees the whole ring.',
        ],
      },
      {
        heading: 'Count the sprinkles',
        trick: 'census-ring',
        on: shown,
        body: [
          'The number says how much tier is hidden; the sprinkles say how many creatures share ' +
            'it. Each is worth at least 1, so the biggest is at most the amount less one for ' +
            'every other: a 3 over three sprinkles is three 1s, and a 5 over three is nothing ' +
            'above a 3.',
        ],
      },
      {
        heading: 'The strongest one',
        trick: 'augur-cap',
        on: augur,
        body: [
          'An Augur names the strongest hidden creature around a number: at or below your level the ' +
            'ring is free, and above it no cell can be more. Sum, count and strongest together ' +
            'pin most rings: a 7 over three cells with a strongest of 3 is 3, 3 and 1, or 3, 2 ' +
            'and 2. Aim it at a number spread over many cells, where the strongest is likeliest ' +
            'small.',
        ],
      },
    ],
  },
  {
    title: 'Grade 2: two numbers',
    grade: 2,
    entries: [
      {
        heading: 'Subtraction, or the 1-2-1',
        trick: 'subtract',
        body: [
          "When one number's covered cells all lie inside another's, the cells only the larger " +
            'sees hold the difference, exactly. Along a wall:',
          drawing('subtract'),
          'At level 1 the 2 sees the first two covered cells and the 5 the first three, so the ' +
            'third is a 3. The last 3 sees the third and fourth, the first 3 sees those and the ' +
            'second, so the second is empty; the first is the 2, and the fourth is empty. The ' +
            'pattern: x, x+z, z over a wall means x, empty, z beneath it. Four in a row, a, a+b, ' +
            'a+b, b, means empty ground under both ends and a, b under the middle.',
        ],
      },
      {
        heading: 'Overlap',
        trick: 'overlap',
        body: [
          "Two numbers that share some covered cells but not all bound each other's private " +
            "cells. A 3 and a 7 sharing two cells: the pair holds at most 3, so the 7's own cell " +
            "holds at least 4; that cell holds at most 5, so the pair holds at least 2 and the 3's " +
            'own cell at most 1.',
        ],
      },
      {
        heading: 'Bounds',
        trick: 'bounds',
        body: [
          'One number on its own says what each of its cells can be. A 9 over two cells on a ' +
            'five-tier board is a 4 and a 5: both creatures, both dangerous below level 4, ' +
            'neither worth a guess. In general a hidden r over k cells puts at least ' +
            'r - (k - 1) x top in every cell, top being the highest tier alive; above 0, every ' +
            'cell is a creature. Pencil the candidates in: the pencil is read by its lowest ' +
            'candidate, so "4 or 5" locks a cell until level 4 and can never expose you.',
          drawing('bounds'),
          'The counters sharpen it: a tier with none left is no candidate. With only 2s and 5s ' +
            'left, a 9 over three cells:',
          drawing('bounds', 1),
          'Two of them make 4, 7 or 10, never 9, so all three are creatures, and the only way to ' +
            '9 is 2 + 2 + 5. You know what is there, not where: at level 2, two free kills and ' +
            'one that costs 10.',
        ],
      },
      {
        heading: 'Colour caps',
        trick: 'colour-cap',
        on: colours,
        body: [
          'A light square hides at most the largest even amount at or below what is hidden. A ' +
            'dark square under an odd amount may hide all of it; under an even amount with other ' +
            'dark squares in sight, all but the 1 its partner must carry. So half a ring can be ' +
            'free while the other half is not.',
        ],
      },
      {
        heading: "The pack's gap",
        trick: 'pack-gap',
        on: packs,
        body: [
          'A covered cell beside a pack holds one of the tiers the pack has not shown, or ' +
            'nothing. A pack showing 6, 5 and 4 caps everything beside it at 3; a pack missing ' +
            'one tier with one covered cell touching it has named that cell.',
        ],
      },
    ],
  },
  {
    title: 'Grade 3: what if',
    grade: 3,
    entries: [
      {
        heading: 'Suppose, then follow it',
        trick: 'what-if',
        body: [
          'When no number settles a cell, suppose it holds a tier and follow what that forces ' +
            'from number to number. A supposition that ends at a number that cannot be made is ' +
            'false, and that tier is struck off. Three 3s around one creature, at level 2:',
          drawing('what-if'),
          'Suppose the cell left of the middle is a 3. Then the top-left 3 is made and its other ' +
            'cells are empty, so the top-right 3 must be made by the cell right of the middle, ' +
            'and the bottom 3 would see 6. So it is not a 3; by the same steps nor is the cell ' +
            'right of the middle, and at level 2 both are free. Two numbers along is about as ' +
            'far as anyone follows it.',
        ],
      },
      {
        heading: "A line's ends",
        trick: 'line-reach',
        on: lines,
        body: [
          'A line is one of every tier, led by the 6, straight or bent, and no member is ' +
            'orthogonally beside any but its neighbours in the line. So a line grows only from ' +
            'its two ends: the cells orthogonally beside a middle member are empty, and so is any ' +
            'cell the missing members could not reach from an end.',
        ],
      },
    ],
  },
  {
    title: 'Grade 4: counting',
    grade: 4,
    entries: [
      {
        heading: 'Accounted for',
        trick: 'accounted',
        body: [
          'The counters say exactly how much tier is left. Numbers whose covered cells do not ' +
            'overlap each account for their own hidden amount; once they account for all of it, ' +
            'every other covered cell is empty, the untouched middle included. Short of that, the ' +
            'rest is spread over the cells outside those rings, and if it is at or below your ' +
            'level, all of those cells are free.',
        ],
      },
      {
        heading: 'The last of a tier',
        trick: 'last-of-tier',
        body: [
          'When one creature of the top tier is left and some number cannot be made without it, ' +
            'that is where it is. One 5 left and a 9 over two cells:',
          drawing('last-of-tier'),
          'The 9 is a 4 and a 5, so the last 5 is one of those two, and every other covered cell ' +
            'is at most a 4: at level 4 all of it is free. The top thresholds are met by killing ' +
            'every creature of a tier, so every endgame is this hunt, and the counters are the ' +
            'map.',
        ],
      },
    ],
  },
  {
    title: GUESSING_WELL,
    intro: [
      'You will be forced to guess; the hard ladders force it on everyone. What separates ' +
        'players is what the guess costs.',
    ],
    entries: [
      {
        heading: 'Check the counters and take every free kill first',
        body: [
          'Levelling is the cheapest safety: a 3-or-5 today is a free kill at level 5. Before ' +
            'any guess, ask whether two more levels would make it unnecessary, and whether they ' +
            'are already on the board.',
        ],
      },
      {
        heading: 'Know the worst case',
        body: [
          "A cell's ceiling is the smallest hidden amount among the numbers touching it, capped " +
            'by the top tier alive. Look it up in the table at your level; if the worst case ' +
            'would kill, do not click there.',
        ],
      },
      {
        heading: 'Prefer the cell that says the most',
        body: [
          'Among survivable cells, prefer one touched by more numbers or beside a large blank ' +
            'area; a rim or corner cell is likelier to open blank ground.',
        ],
      },
      {
        heading: 'A guess you know something about is cheaper than one you do not',
        body: [
          "A doorway, a colour, a pack's gap all cap what a guess can be. A cell no number " +
            "touches is worth the board's average: total tier left divided by covered cells, " +
            'from the counters.',
        ],
      },
      {
        heading: 'One tier over is cheap; two is a cliff',
        body: [
          'At level 3 a tier 4 costs 4 and a tier 5 costs 5; at level 2 a tier 5 costs 10. A ' +
            'guess within one tier of your level is a price; two over is a gamble on your life.',
        ],
      },
      {
        heading: 'Spend mana before HP',
        body: [
          'Reveal on the cell you would guess, or Census on the number over it, costs nothing ' +
            'that does not come back. Exercise before the fight you cannot avoid.',
        ],
      },
      {
        heading: 'Never trust a mark you did not prove',
        body: [
          'A wrong mark kills more players than a bad guess: assisted Sweep opens what your ' +
            'marks leave provable, and a mark at or below your level is a cell you will open ' +
            'without a thought. If a mark was a guess, pencil it instead.',
        ],
      },
    ],
  },
  {
    title: 'Mistakes worth naming',
    entries: [
      {
        body: [
          {
            list: [
              'Reading a 4 as four creatures.',
              "Forgetting to subtract a beaten creature's tier from the number beside it.",
              "Reading a number as if the level were one higher; the level's colour is the " +
                'strongest tier it beats.',
              'Trusting a wrong mark into the endgame.',
              'Reading the pencil backwards: notes say what a cell might still be, and the game ' +
                'reads the lowest, so a note of 5 locks a cell and a note of 0 and 5 does not.',
              'Guessing in the untouched middle when a rim cell with a number on it was available.',
              'Not checking the counters before a guess, when the tier that frightened you was ' +
                'already dead.',
              'On DUNGEON, forgetting that reach is measured from open ground: a Reveal pushes ' +
                'the frontier, a mark does not.',
            ],
          },
        ],
      },
    ],
  },
];
