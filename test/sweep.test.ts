/**
 * Sweep's proof (`src/engine/sweep.ts`) on boards small enough to read: each proof on its own, the
 * guards, and the guess-free harvest. The ladder-wide checks that Sweep never costs HP on real
 * boards are in `invariants.test.ts`; each placement rule's own proof is tested beside the rule.
 */

import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game.js';
import { computeNumbers } from '../src/engine/grid.js';
import { noteBit } from '../src/engine/notes.js';
import { type SweepView, safeCells } from '../src/engine/sweep.js';
import type { Cell, GameStatus, Placement, SweepOptions } from '../src/engine/types.js';
import { testConfig } from './helpers.js';

/**
 * A board drawn cell by cell. Covered: `.` empty ground, a digit a creature of that tier. Open:
 * `_` empty ground, a letter a beaten creature (`a` tier 1, `b` tier 2, ...).
 */
function drawn(rows: string[]): Game {
  const game = Game.create(testConfig({ width: rows[0]!.length, height: rows.length }), 1);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const cell = game.grid[y]![x]!;
      const beaten = ch >= 'a' && ch <= 'i';
      cell.tier = ch === '.' || ch === '_' ? 0 : beaten ? ch.charCodeAt(0) - 96 : Number(ch);
      cell.open = ch === '_' || beaten;
      cell.alive = cell.tier > 0 && !beaten;
      cell.mark = 0;
      cell.given = false;
    }),
  );
  computeNumbers(game.grid, game.config.topology, game.config.wrap);
  return game;
}

/** The game as Sweep sees it, under a placement rule and at a level of the test's choosing. */
function view(
  game: Game,
  level: number,
  placement: Placement = 'uniform',
  status: GameStatus = 'playing',
): SweepView {
  return {
    grid: game.grid,
    config: { ...game.config, placement },
    level,
    status,
    neighboursOf: (c) => game.neighboursOf(c),
  };
}

const at = (cells: Cell[]): string[] => cells.map((c) => `${c.x},${c.y}`).sort();
const swept = (v: SweepView, options?: SweepOptions): string[] => at(safeCells(v, options));
const ringOf = (game: Game, x: number, y: number): string[] =>
  at(game.neighboursOf(game.grid[y]![x]!).filter((n) => !n.open));

describe('the sum', () => {
  it('frees every covered neighbour when the hidden part is within your level', () => {
    const game = drawn(['1..', '._.', '...']);
    expect(swept(view(game, 1))).toEqual(ringOf(game, 1, 1));
  });

  it('frees nothing when the hidden part is above your level', () => {
    expect(swept(view(drawn(['2..', '._.', '...']), 1))).toEqual([]);
  });

  it('subtracts what is already open: a 3 beside a beaten 2 hides a 1', () => {
    const game = drawn(['b..', '._.', '..1']);
    expect(swept(view(game, 1))).toEqual(ringOf(game, 1, 1));
  });

  it('frees nothing at level 0, or once the board is over', () => {
    const game = drawn(['1..', '._.', '...']);
    expect(swept(view(game, 0))).toEqual([]);
    expect(swept(view(game, 1, 'uniform', 'won'))).toEqual([]);
  });
});

describe('Census', () => {
  it('caps the biggest creature at the sum less one for every other', () => {
    // 3 hidden between two creatures: at level 2 the sum proves nothing, but with two creatures
    // sharing it the bigger is at most 2.
    const game = drawn(['1..', '._.', '..2']);
    expect(swept(view(game, 2))).toEqual([]);
    game.grid[1]![1]!.census = 2;
    expect(swept(view(game, 2))).toEqual(ringOf(game, 1, 1));
  });

  it('counts the open creatures out of the census', () => {
    // Census 2, but one of the two is already open: one creature hides the whole 3. What is
    // freed is only the open creature's own empty ring, by the sum.
    const game = drawn(['a..', '._.', '..3']);
    game.grid[1]![1]!.census = 2;
    expect(swept(view(game, 2))).toEqual(ringOf(game, 0, 0));
    expect(swept(view(game, 2))).not.toContain('2,2');
  });
});

describe('marks, when Sweep is asked to trust them', () => {
  const marked = (mark: number): Game => {
    const game = drawn(['2..', '._.', '..1']);
    game.grid[0]![0]!.mark = mark;
    return game;
  };

  it('subtract from the sum and free the unmarked neighbours, never the marked one', () => {
    const game = marked(2);
    const assisted = swept(view(game, 1), { useMarks: true });
    expect(assisted).toEqual(ringOf(game, 1, 1).filter((c) => c !== '0,0'));
  });

  it('are ignored by strict Sweep', () => {
    expect(swept(view(marked(2), 1), { useMarks: false })).toEqual([]);
  });

  it('are not acted on when they contradict the number', () => {
    expect(swept(view(marked(4), 1), { useMarks: true })).toEqual([]);
  });
});

describe('the player’s own locks', () => {
  it('keep a cell marked even one above your level out of a proven ring', () => {
    const game = drawn(['1..', '._.', '...']);
    game.grid[2]![2]!.mark = 2;
    expect(swept(view(game, 1))).not.toContain('2,2');
    expect(swept(view(game, 1))).toHaveLength(ringOf(game, 1, 1).length - 1);
  });

  it('keep a cell whose every note is above your level out, but not one with a low note', () => {
    const game = drawn(['1..', '._.', '...']);
    game.grid[2]![2]!.notes = noteBit(2) | noteBit(3);
    game.grid[2]![0]!.notes = noteBit(0) | noteBit(3);
    const out = swept(view(game, 1));
    expect(out).not.toContain('2,2');
    expect(out).toContain('0,2');
  });
});

describe('a placement rule’s cap on one cell', () => {
  it('frees the checkerboard square the colours prove empty, where the sum cannot', () => {
    // The open (1,0) hides 2 behind four covered cells, one of them dark. An even hidden sum with
    // a single dark cell in sight means the dark cell holds nothing.
    const game = drawn(['2_.', '.._', '...']);
    const plain = swept(view(game, 1, 'uniform'));
    const coloured = swept(view(game, 1, 'checker'));
    expect(plain).not.toContain('0,1');
    expect(coloured).toEqual([...plain, '0,1'].sort());
  });
});

describe('on a guess-free board', () => {
  const sudoku = (): Game => {
    const game = drawn(['1..', '._.', '..2']);
    game.grid[0]![0]!.mark = 1;
    game.grid[0]![0]!.given = true;
    game.grid[2]![2]!.mark = 2;
    return game;
  };

  it('harvests only the givens within your level under strict Sweep', () => {
    expect(swept(view(sudoku(), 2, 'sudoku'), { useMarks: false })).toEqual(['0,0']);
  });

  it('adds the player’s marks within your level under assisted Sweep', () => {
    expect(swept(view(sudoku(), 2, 'sudoku'), { useMarks: true })).toEqual(['0,0', '2,2']);
    expect(swept(view(sudoku(), 1, 'sudoku'), { useMarks: true })).toEqual(['0,0']);
  });

  it('never reads the numbers, even where they prove a ring', () => {
    // The open centre hides 3 at level 3, which the sum would free; the harvest does not look.
    const game = drawn(['1..', '._.', '..2']);
    expect(swept(view(game, 3, 'sudoku'))).toEqual([]);
    expect(swept(view(game, 3, 'uniform'))).toEqual(ringOf(game, 1, 1));
  });
});
