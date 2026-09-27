/**
 * The field guide's words (docs/teaching-plan.md, section 6): the catalogue, `docs/strategies.md`,
 * sections 1 to 6, 8 and 9, as a player reads it in the game. The words are the catalogue's,
 * copied less what speaks to a developer, and `test/guide.test.ts` holds them to it: every
 * paragraph word for word, every heading to one of its bold leads, every trick to an entry, every
 * diagram to the entry of its trick, and every entry's ladders to the ones the catalogue names.
 * DOM-free, so the test can read it; `src/ui/screens/guide.ts` draws it.
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

/** What an entry's ladders are asked of. */
export interface LadderRules {
  readonly placement: PlacementRule;
  readonly shape: ShapeRule;
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
  return { placement: placementRule(placement), shape: shapeRule(shape) };
}

/** The ladders an entry belongs to, in the menu's order; every ladder for a general entry. */
export function laddersFor(entry: GuideEntry, ladders: readonly LadderType[]): LadderType[] {
  const on = entry.on;
  return on ? ladders.filter((t) => on(rulesOf(t))) : [...ladders];
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

/** What the guide says before its first section: the catalogue's account of the grades. */
export const GUIDE_INTRO: readonly string[] = [
  'The grades are how much has to be held in the head at once. Grade 0 is a glance at one cell. ' +
    'Grade 1 is one number and a little arithmetic. Grade 2 is two numbers together. Grade 3 is a ' +
    'supposition followed a step or two. Grade 4 is counting the whole board. A grade-1 player ' +
    'who never learns more can still clear a great many boards; the rest is what makes the hard ' +
    'ladders clearable at all.',
];

/** The damage table's tiers and levels, as the catalogue's section 1 lays it out. */
export const DAMAGE_TABLE = { tiers: [2, 3, 4, 5, 6], levels: [1, 2, 3, 4, 5] } as const;

export const GUIDE: readonly GuideSection[] = [
  {
    title: 'Three things to know before the first click',
    entries: [
      {
        heading: 'A number is the sum of the tiers around it, not a count',
        body: [
          'A 4 might be one tier 4, or two tier 2s, or a 3 and a 1, or four tier 1s, and you are ' +
            'never told which. A 9 fits behind a cell that has only eight neighbours. A ' +
            'Minesweeper player reads a 4 as four creatures, plays on it, and concludes the board ' +
            'lied.',
        ],
      },
      {
        heading: 'Your level is a shield, and it is the only one',
        body: [
          'A creature at or below your level dies in one blow and costs nothing. Above it the ' +
            'cost is a staircase, tier x (ceil(tier / level) - 1): one tier over your level costs ' +
            'exactly that tier, two over is a cliff. At full HP on the common 10-HP ladders, a ' +
            'cost of 10 or more is death.',
          { table: 'damage' },
          'Death is at 0 exactly, so a fight you survive costs less than your HP, strictly. At ' +
            'level 1 a tier 4 or 5 kills you from full health; at level 2 a tier 5 still does. ' +
            'From level 3 nothing on a five-tier board kills in one fight, and the game changes ' +
            'character: a guess becomes a price.',
        ],
      },
      {
        heading: 'Every board can be cleared without losing a point',
        body: [
          'The EXP each level needs is always already on the board among creatures you can kill ' +
            'for free. HP is a guess budget, spent on nothing but guesses and misreads. So the ' +
            'question at every moment is not "what is this cell" but "is anything here above my ' +
            'level", and most of the tricks below are ways of answering that without knowing the ' +
            'tier.',
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
          'An open number at or below your level makes every covered cell around it safe, however ' +
            'many there are: whatever is there adds up to that number, so no single one of them is ' +
            'more. At level 2:',
          drawing('raw-ring'),
          'All five covered cells are free to open. Nothing needs adding up; you are only ' +
            'comparing the number with your level. This is the trick that makes a board at Expert ' +
            'Minesweeper density playable, and the one to learn first.',
        ],
      },
      {
        heading: 'The free kill',
        trick: 'named-kill',
        body: [
          'A cell you have marked with a tier at or below your level is a creature you can kill ' +
            'for nothing. Marks are made below your level and harvested when the level comes; keep ' +
            'the harvest going, because levelling is what turns the rest of the board free.',
        ],
      },
      {
        heading: 'Met partner',
        trick: 'met-partner',
        on: pairs,
        body: [
          'Every creature has exactly one creature next to it. A beaten creature that already ' +
            'touches another creature has found its partner, so everything else around it is ' +
            'empty ground, at any level.',
        ],
      },
      {
        heading: 'Corridors',
        trick: 'corridor',
        on: hallways,
        body: [
          'Hallways are one cell wide and always empty, and so is the room cell a hallway arrives ' +
            'at. A thin passage between two rooms can be walked without a thought; a one-cell ' +
            "notch in a room's wall is not a passage, it is room floor, and can hold a creature.",
        ],
      },
      {
        heading: 'The whole pack',
        on: packs,
        body: [
          'A pack is one creature of every tier, standing together and touching no other pack. A ' +
            'pack that has shown every tier is finished, and every covered cell around it is ' +
            'empty ground.',
        ],
      },
      {
        heading: 'The sprinkles',
        trick: 'sprinkles',
        on: shown,
        body: [
          'Every creature is drawn where it stands, each pair as one sprinkle across its two ' +
            'cells. A covered cell with no sprinkle is empty ground, free at any level; a cell ' +
            'under a sprinkle is a creature, never empty ground.',
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
            'number first. What is left is what is still hidden, and it obeys the raw-ring rule: ' +
            'at or below your level, the covered cells are all free; 0, they are all empty ground. ' +
            'At level 2:',
          drawing('residual-ring'),
          'Each 5 sees a beaten tier 3, so 2 is hidden over the two covered cells, and both are ' +
            'free. Hovering a beaten creature shows its own number, which you subtract the same ' +
            'way, except on PAIRS and DOMINOES, where it is not shown.',
        ],
      },
      {
        heading: 'The last cell',
        trick: 'last-cell',
        body: [
          'A number with exactly one covered neighbour left has named it: the cell holds whatever ' +
            'is still hidden, exactly.',
          drawing('last-cell'),
          'That cell is a tier 4, and every number around it says so. Mark it 4 and come back at ' +
            'level 4; until then a mark above your level locks the cell so a slip cannot open it. ' +
            'This is the workhorse, and it compounds: every cell named is a tier subtracted from ' +
            'every other number it touches, which names the next.',
        ],
      },
      {
        heading: 'The counters',
        trick: 'counters',
        body: [
          'The LV buttons show how many creatures of each tier are still alive. A tier whose ' +
            'counter reads 0 is gone, so no number hides one: a 5 over two cells with no 5s left ' +
            'is a 4 and a 1, or a 3 and a 2. When every tier still alive is at or below your ' +
            'level, the whole board is free and you can click anything. Read the counters before ' +
            'every guess.',
        ],
      },
      {
        heading: 'The lone dark square',
        trick: 'lone-dark',
        on: colours,
        body: [
          'Even tiers stand only on light squares, odd tiers only on dark, and empty ground ' +
            'anywhere. The light squares behind a number add up to an even amount, so the ' +
            "number's parity is decided by its dark neighbours alone. If only one dark square " +
            'around a number is still covered and the hidden amount is even, that square is ' +
            'empty, at any level.',
        ],
      },
      {
        heading: "The partner's tier",
        trick: 'partner-number',
        on: pairs,
        body: [
          "A beaten creature's own number is its partner's tier, because nothing else it touches " +
            'is a creature. If it has one covered neighbour left, that is the partner and you know ' +
            'its tier; if its number is at or below your level, the whole ring is free.',
        ],
      },
      {
        heading: 'Count the sprinkles',
        trick: 'census-ring',
        on: shown,
        body: [
          'A number says how much tier is hidden around it, and the sprinkles say how many ' +
            'creatures share it, as a Census would. Each is worth at least 1, so the biggest can ' +
            'be no more than the remainder less one for every other: a 3 over three sprinkles is ' +
            'three tier 1s, and a 5 over three is nothing above a 3.',
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
          "When one number's covered cells all lie inside another's, take the smaller from the " +
            'larger: the cells only the larger one sees hold the difference, exactly. This is ' +
            "Minesweeper's 1-2-1 with the numbers free to vary. Along a wall:",
          drawing('subtract'),
          'At level 1, the 2 sees the first two covered cells and the 5 the first three, so the ' +
            'third is a 3. The last 3 sees the third and fourth, and the first 3 sees those and ' +
            'the second, so the second is empty. That leaves the first for the 2, and the fourth ' +
            'empty. The pattern to remember is x, x+z, z over a wall: beneath it lies x, empty, z, ' +
            'whatever x and z are; when x is at or below your level, the raw ring has given you ' +
            'the first two cells already. Four in a row, a, a+b, a+b, b, put empty ground under ' +
            'both ends and a, b under the middle pair.',
        ],
      },
      {
        heading: 'Overlap',
        trick: 'overlap',
        body: [
          'Two numbers that share some covered cells but not all: the cells each sees alone are ' +
            'bounded by the other. If a 3 and a 7 share two cells, those two hold at most 3, so ' +
            "the 7's private cell holds at least 4; and since that private cell holds at most 5, " +
            "the shared pair holds at least 2, so the 3's private cell holds at most 1.",
        ],
      },
      {
        heading: 'Bounds',
        trick: 'bounds',
        body: [
          'One number on its own says what each of its cells can be. A 9 over two cells on a ' +
            'five-tier board is a 4 and a 5, so both are creatures, both are dangerous below level ' +
            '4, and neither is worth a guess. In general a hidden amount r over k cells puts at ' +
            'least r - (k - 1) x top in every cell, where top is the highest tier still alive; ' +
            'when that is above 0, every cell is a creature. Pencil the candidates in; the pencil ' +
            'is a shield, read by its lowest candidate, so "4 or 5" locks a cell until level 4 and ' +
            'can never expose you.',
          drawing('bounds'),
          'The counters sharpen it, because a tier with none left is no candidate. With only 2s ' +
            'and 5s left, a 9 over three cells:',
          drawing('bounds', 1),
          'None of the three can be empty, since two of them make 4, 7 or 10 from 2s and 5s, ' +
            'never 9; so all three are creatures, and the only way to make 9 is 2 + 2 + 5. You ' +
            'know what is there and not where, which at level 2 is two free kills and one that ' +
            'costs 10.',
        ],
      },
      {
        heading: 'Colour caps',
        trick: 'colour-cap',
        on: colours,
        body: [
          'A light square hides at most the largest even amount at or below what is hidden; a ' +
            'dark square under an odd amount may hide all of it, and under an even amount with ' +
            'other dark squares in sight, all but the 1 its partner must carry. So half a ' +
            "number's ring can be free while the other half is not, which is the shape of " +
            'deduction that belongs to this board alone.',
        ],
      },
      {
        heading: "The pack's gap",
        trick: 'pack-gap',
        on: packs,
        body: [
          'A covered cell beside a pack holds one of the tiers that pack has not shown yet, or ' +
            'nothing. A pack showing 6, 5 and 4 caps everything beside it at 3. A pack missing ' +
            'exactly one tier with exactly one covered cell touching it has named that cell.',
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
          'When no number settles a cell on its own, suppose it holds a tier and follow what ' +
            'that forces from one number to the next; a supposition that ends at a number that ' +
            'cannot be made is false, and that tier is struck off the cell. Three 3s around one ' +
            'creature, at level 2:',
          drawing('what-if'),
          'Suppose the cell left of the middle is a 3. Then the top-left 3 is made and its other ' +
            'two cells are empty, so the top-right 3 must be made by the cell right of the middle, ' +
            'and the bottom 3 would see 6. So it is not a 3, nor by the same steps is the cell ' +
            'right of the middle, and at level 2 both are free. Two numbers along is about as far ' +
            'as anyone follows it at the board.',
        ],
      },
      {
        heading: "A line's ends",
        trick: 'line-reach',
        on: lines,
        body: [
          'Each pack is a straight or bent line of one of every tier, led by the 6, and no member ' +
            'is orthogonally beside any but its neighbours in the line. So a line only continues ' +
            'from its two ends, the cells orthogonally beside a member in the middle of a known ' +
            'stretch are empty, and any cell the missing members could not reach by walking from ' +
            'an end is empty too.',
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
          'The counters say exactly how much tier is left on the board. Numbers whose covered ' +
            'cells do not overlap each account for their own hidden amount, and once a set of them ' +
            'accounts for all of it, every other covered cell on the board is empty, the ' +
            'untouched middle included. Short of that, whatever is unaccounted for is spread over ' +
            'the cells outside those rings, and if that remainder is at or below your level, all ' +
            'of those cells are free.',
        ],
      },
      {
        heading: 'The last of a tier',
        trick: 'last-of-tier',
        body: [
          'When one creature of the top tier is left and some number cannot be made without it, ' +
            'that is where it is, and nowhere else can hold one. One 5 left and a 9 over two cells:',
          drawing('last-of-tier'),
          'The 9 is a 4 and a 5, so the last 5 is one of those two, and every other covered cell ' +
            'on the board is at most a 4. At level 4 all of it is free. The last few level-ups on ' +
            'every ladder are exactly this hunt: the top thresholds are met by killing every ' +
            'creature of a tier, so the endgame is finding the last one, and the counters are the ' +
            'map.',
        ],
      },
    ],
  },
  {
    title: 'Guessing well',
    intro: [
      "You will be forced to guess, and the hard ladders' top boards force it on everyone. What " +
        'separates players is what the guess costs.',
    ],
    entries: [
      {
        heading: 'Check the counters and take every free kill first',
        body: [
          'Levelling is the cheapest safety there is: a cell that is a 3-or-5 today is a free ' +
            'kill at level 5. Before any guess, ask whether two more levels would make it ' +
            'unnecessary, and whether those levels are already on the board.',
        ],
      },
      {
        heading: 'Know the worst case',
        body: [
          "The cell's ceiling is the smallest hidden amount among the numbers touching it, " +
            'capped by the top tier still alive. Look the ceiling up in the table in section 1 at ' +
            'your level: if the worst case would kill, do not click there.',
        ],
      },
      {
        heading: 'Prefer the cell that says the most',
        body: [
          'Among survivable cells, the one touched by more numbers, or beside a large blank area, ' +
            'tells you more when it opens; a corner or rim cell is likelier to open blank ground.',
        ],
      },
      {
        heading: 'A guess you know something about is cheaper than one you do not',
        body: [
          "This is the finding behind every placement ladder: a doorway read, a colour, a pack's " +
            "gap all cap what a guess can be. A cell no number touches is worth the board's " +
            'average, which the counters tell you: total tier left divided by covered cells.',
        ],
      },
      {
        heading: 'One tier over is cheap; two is a cliff',
        body: [
          'At level 3 a tier 4 costs 4 and a tier 5 costs 5; at level 2 a tier 5 costs 10. So a ' +
            'guess whose candidates are all within one tier of your level is a price, and one ' +
            'that reaches two over is a gamble on your life.',
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
          'The endgame kills more players through a wrong mark than through a bad guess: assisted ' +
            'Sweep opens whatever your marks leave provable, and a mark at or below your level is ' +
            'a cell you will open by hand without a thought. If a mark was a guess, pencil it ' +
            'instead.',
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
              "Reading a number as if the level were one higher than it is; the level's colour is " +
                'the colour of the strongest creature it can beat.',
              'Trusting a wrong mark into the endgame.',
              'Reading the pencil the wrong way round: notes say what a cell might still be, and ' +
                'the game reads only the lowest one; a note of 5 alone locks a cell, a note of 0 ' +
                'and 5 does not.',
              'Guessing in the untouched middle when a rim cell with a number on it was available.',
              'Not checking the counters before a guess, when the tier that frightened you was ' +
                'already dead.',
              'On DUNGEON, forgetting that reach is measured from open ground, so a Reveal pushes ' +
                'the frontier and a mark does not.',
            ],
          },
        ],
      },
    ],
  },
];
