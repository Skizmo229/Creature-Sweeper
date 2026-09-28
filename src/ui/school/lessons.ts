/**
 * The school's lessons (docs/teaching-plan.md, section 5): nine short lessons, one trick each, on
 * boards drawn so that the trick is the move. A lesson is a board and a list of steps, and a step
 * says something, points with the tutor, and waits for one thing. Data, DOM-free: where a trick is
 * taught the words are the trick text's, so a change to that sentence reaches the school too.
 * `run.ts` takes one lesson; `test/school.test.ts` takes all nine with the tricks at each lesson's
 * grade, and holds the grade below to failing where the lesson's trick is needed.
 *
 * Where a board needs weak creatures kept out of the lesson (every threshold is `C_k`, so the level
 * is at least the weakest tier alive), they stand in a covered block beyond a column of holes: the
 * rest of the board, as the catalogue's diagrams have it (decision 0049).
 */

import type { Grade, TrickId } from '../../sim/tricks.js';
import { TRICK_TEXT } from '../../sim/tricktext.js';

/** A cell of a lesson board, as [x, y]. */
export type Spot = readonly [number, number];

/** What a step waits for before the lesson moves on. */
export type Wait =
  /** The player says to go on. */
  | { readonly next: true }
  /** Every one of these cells opened, in any order. */
  | { readonly open: readonly Spot[] }
  /** This cell marked with this tier. */
  | { readonly mark: Spot; readonly tier: number }
  /** This cell pencilled with exactly these candidates. */
  | { readonly pencil: Spot; readonly tiers: readonly number[] };

export interface Step {
  /** What the teacher says. */
  readonly say: string;
  /** The trick whose proof the tutor's overlay points at, on the board as it stands. */
  readonly point?: TrickId;
  readonly wait: Wait;
  /** The move the lesson's trick is needed for: the grade below cannot make it. */
  readonly key?: true;
}

export interface SchoolLesson {
  /** Stable, for the save. */
  readonly id: string;
  readonly title: string;
  /** The trick it teaches, where the graded player has one for it. */
  readonly trick?: TrickId;
  /** The grade that takes it without a guess; null where guessing is the lesson. */
  readonly grade: Grade | null;
  /** The board, in `readLayout`'s notation, at five tiers. */
  readonly truth: readonly string[];
  readonly shown: readonly string[];
  readonly level: number;
  readonly steps: readonly Step[];
}

const rule = (trick: TrickId): string => TRICK_TEXT[trick].rule;

/** Pencil mode, and how to reach it, said the same way wherever a lesson asks for it. */
const HOW_TO_MARK = 'right-click it, or pick its LV button and click it';

export const LESSONS: readonly SchoolLesson[] = [
  {
    id: 'sum',
    title: 'A number is a sum',
    trick: 'raw-ring',
    grade: 0,
    level: 2,
    truth: ['1 . . . . .', '. . . . . .', '. . 1 . 2 .'],
    shown: ['? ? ? ? ? ?', '? 2 ? ? 2 ?', '? ? ? ? ? ?'],
    steps: [
      {
        say: 'A number is the sum of the tiers around it. Each 2 here might be one tier 2 or two 1s.',
        point: 'raw-ring',
        wait: { next: true },
      },
      {
        say: `You are level 2. ${rule('raw-ring')} Open all eight cells around the left 2.`,
        point: 'raw-ring',
        key: true,
        wait: {
          open: [
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 1],
            [2, 1],
            [0, 2],
            [1, 2],
            [2, 2],
          ],
        },
      },
      {
        say: 'Two tier 1s made that 2. Now the eight around the right 2.',
        point: 'raw-ring',
        wait: {
          open: [
            [3, 0],
            [4, 0],
            [5, 0],
            [3, 1],
            [5, 1],
            [3, 2],
            [4, 2],
            [5, 2],
          ],
        },
      },
      {
        say: 'One tier 2 made this one. A 9 fits behind a cell with only eight neighbours.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'shield',
    title: 'Your level is a shield',
    trick: 'named-kill',
    grade: 0,
    level: 1,
    truth: ['1 . . . 3', '. . . . .', '1 . . . 2'],
    shown: ['m1 1 . 3 m3', '2 2 . 5 5', 'm1 1 . 2 ?'],
    steps: [
      {
        say:
          'A creature at or below your level dies in one blow for nothing. You are level 1, and ' +
          'the cells marked 1 are tier 1s. Open both: two free kills.',
        point: 'raw-ring',
        key: true,
        wait: {
          open: [
            [0, 0],
            [0, 2],
          ],
        },
      },
      {
        say: 'Every tier 1 is gone, so you are level 2. The LV buttons count what is left: LV 1 reads 0.',
        wait: { next: true },
      },
      {
        say:
          'The cell marked 3 is above your level, so the mark locks it against a slip. The corner ' +
          'below it is the last cell of the 2 beside it, and at level 2 a 2 is free.',
        point: 'raw-ring',
        wait: { open: [[4, 2]] },
      },
      {
        say: 'Level 3, and the 3 is free too.',
        point: 'raw-ring',
        wait: { open: [[4, 0]] },
      },
      {
        say: `${rule('named-kill')} Take every free kill first; levelling frees the rest of the board.`,
        wait: { next: true },
      },
    ],
  },
  {
    id: 'subtract',
    title: 'Subtract what you can see',
    trick: 'residual-ring',
    grade: 1,
    level: 2,
    truth: ['1 1 # 2 1', '. . # 3 .', '3 . # . 4'],
    shown: ['? ? # ? ?', '5 5 # ? ?', 'k3 3 # ? ?'],
    steps: [
      {
        say: `${rule('residual-ring')} Hover a beaten creature to see its own number.`,
        point: 'residual-ring',
        wait: { next: true },
      },
      {
        say:
          'Each 5 sees the beaten 3, so 2 is hidden over the two covered cells. You are level 2: ' +
          'both are free. Open them.',
        point: 'residual-ring',
        key: true,
        wait: {
          open: [
            [0, 0],
            [1, 0],
          ],
        },
      },
      {
        say: 'The block beyond the gap is the rest of the board, where nothing is proven yet.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'last-cell',
    title: 'The last cell',
    trick: 'last-cell',
    grade: 1,
    level: 1,
    truth: ['1 . . 2 . . 3 . .', '. . . . . . . . .', '. . . . . . . . 4'],
    shown: ['? 1 2 ? 2 3 ? 3 .', '1 1 2 2 2 3 3 7 4', '. . . . . . . 4 ?'],
    steps: [
      {
        say:
          `${rule('last-cell')} The 4s at the bottom right have one covered neighbour left, so ` +
          `it is a tier 4. Mark it 4: ${HOW_TO_MARK}.`,
        point: 'last-cell',
        key: true,
        wait: { mark: [8, 2], tier: 4 },
      },
      {
        say:
          'A mark above your level locks the cell. The other creatures are last cells too, and ' +
          'the tier 1 is free at level 1.',
        point: 'last-cell',
        wait: { open: [[0, 0]] },
      },
      {
        say: 'Level 2, and the 2 is free.',
        point: 'last-cell',
        wait: { open: [[3, 0]] },
      },
      {
        say: 'Level 3, and the 3.',
        point: 'last-cell',
        wait: { open: [[6, 0]] },
      },
      {
        say: 'Level 4: your mark of 4 is a free kill now.',
        wait: { open: [[8, 2]] },
      },
      {
        say: 'Every cell named is a tier subtracted from every number it touches, which names the next.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'counters',
    title: 'The counters',
    trick: 'counters',
    grade: 1,
    level: 4,
    truth: ['4 1', '. .'],
    shown: ['? ?', '5 5'],
    steps: [
      {
        say: `${rule('counters')} Look at LV 5: there are none on this board.`,
        point: 'counters',
        wait: { next: true },
      },
      {
        say:
          'So the 5 over the two covered cells is a 4 and a 1, or a 3 and a 2, never a 5 and ' +
          'nothing. Every tier alive is at or below your level, so the whole board is free. Open both.',
        point: 'counters',
        key: true,
        wait: {
          open: [
            [0, 0],
            [1, 0],
          ],
        },
      },
      {
        say: 'Read the counters before every guess.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'one-two-one',
    title: 'The 1-2-1',
    trick: 'subtract',
    grade: 2,
    level: 1,
    truth: ['2 . 3 . # 1 1', '. . . . # . 4', '. . . . # 5 .'],
    shown: ['? ? ? ? # ? ?', '2 5 3 3 # ? ?', '. . . . # ? ?'],
    steps: [
      {
        say:
          `${rule('subtract')} The 2 sees the first two covered cells and the 5 the first ` +
          `three, so the third is exactly 3. Mark it 3: ${HOW_TO_MARK}.`,
        point: 'subtract',
        key: true,
        wait: { mark: [2, 0], tier: 3 },
      },
      {
        say:
          'The last 3 sees the third and fourth cells, and the first 3 sees those and the ' +
          'second, so the second holds nothing. Open it.',
        point: 'subtract',
        wait: { open: [[1, 0]] },
      },
      {
        say: 'The 2 has one covered cell left. Mark it 2.',
        point: 'last-cell',
        wait: { mark: [0, 0], tier: 2 },
      },
      {
        say: 'The last 3 is made by the 3 you named, so the fourth is empty. Open it.',
        point: 'residual-ring',
        wait: { open: [[3, 0]] },
      },
      {
        say: 'The pattern: x, x+z, z over a wall means x, empty, z beneath it.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'bounds',
    title: 'Bounds and the pencil',
    trick: 'bounds',
    grade: 2,
    level: 2,
    truth: ['4 5 # 1 1', '. . # 2 3', '. . # . .'],
    shown: ['? ? # ? ?', '9 9 # ? ?', '. . # ? ?'],
    steps: [
      {
        say: `${rule('bounds')} A 9 over two cells, no tier above 5: each is a 4 or a 5.`,
        point: 'bounds',
        wait: { next: true },
      },
      {
        say: 'Pencil it in. Press N for Pencil, then with the pointer on the first covered cell press 4 and 5.',
        point: 'bounds',
        key: true,
        wait: { pencil: [0, 0], tiers: [4, 5] },
      },
      {
        say: 'And the second: 4 and 5.',
        point: 'bounds',
        wait: { pencil: [1, 0], tiers: [4, 5] },
      },
      {
        say:
          'The pencil is read by its lowest candidate: 4 or 5 locks a cell until level 4, and a ' +
          'click on it does nothing.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'guessing',
    title: 'Guessing well',
    grade: null,
    level: 1,
    truth: ['2 . # 1 . 1', '. . # . . .'],
    shown: ['? ? # ? 2 ?', '2 2 # 1 2 1'],
    steps: [
      {
        say:
          'At level 1 the 2 on the left is a guess: either cell could be the tier 2, at 2 of your ' +
          '10 HP. Before any guess, take every free kill: the two covered cells on the right are ' +
          'tier 1s.',
        point: 'raw-ring',
        wait: {
          open: [
            [3, 0],
            [5, 0],
          ],
        },
      },
      {
        say: 'Level 2 now, so the 2 on the left is free. The guess was never needed.',
        point: 'raw-ring',
        wait: {
          open: [
            [0, 0],
            [1, 0],
          ],
        },
      },
      {
        say:
          'Before a guess, know the worst case, and ask whether two more levels would make it ' +
          'unnecessary. When nothing is proven, the tutor (H) says both.',
        wait: { next: true },
      },
    ],
  },
  {
    id: 'last-of-tier',
    title: 'The last of a tier',
    trick: 'last-of-tier',
    grade: 4,
    level: 4,
    truth: ['4 5 # 1 2 .', '. . # 3 4 1'],
    shown: ['? ? # ? ? ?', '9 9 # ? ? ?'],
    steps: [
      {
        say: 'LV 5 reads 1: one tier 5 left. The 9 over two cells is a 4 and a 5, so it is one of those two.',
        point: 'bounds',
        wait: { next: true },
      },
      {
        say:
          `${rule('last-of-tier')} So the rest of the board, beyond the gap, holds at most a 4, ` +
          'and at level 4 all of it is free. Open it.',
        point: 'last-of-tier',
        key: true,
        wait: {
          open: [
            [3, 0],
            [4, 0],
            [5, 0],
            [3, 1],
            [4, 1],
            [5, 1],
          ],
        },
      },
      {
        say: 'The top thresholds are met by killing every creature of a tier, so every endgame is this hunt.',
        wait: { next: true },
      },
    ],
  },
];
