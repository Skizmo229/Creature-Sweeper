/**
 * Boards from drawings (`Game.fromLayout`, `src/engine/layout.ts`): a drawing builds exactly the
 * board it pictures, a drawing of any board in play builds that board back, and a drawing that
 * is not a board the game could be showing is refused with the cell named.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { placementRule } from '../src/engine/placement/registry.js';
import { drawingOf, ladders, playPartWay } from './helpers.js';

/** A 4 and a 1, on a five-tier board, seen from the corner. */
const TRUTH = ['. . . .', '. . 4 .', '1 . . .'];
const SHOWN = ['. 4 ? ?', '1 5 ? ?', '? ? ? ?'];

describe('a board from a drawing', () => {
  it('is the board it pictures', () => {
    const game = Game.fromLayout(TRUTH, SHOWN, { tiers: 5 });
    expect(game.config).toMatchObject({ width: 4, height: 3, tiers: 5, hp: 10, opening: 'none' });
    expect(game.config.quantity).toEqual([1, 0, 0, 1, 0]);
    expect(game.level).toBe(1);
    expect(game.hp).toBe(10);
    const at = (x: number, y: number) => game.cellAt(x, y)!;
    expect(at(1, 1).num).toBe(5);
    expect(at(1, 1).open).toBe(true);
    expect(at(2, 1).open).toBe(false);
    expect(at(2, 1).alive).toBe(true);
    expect(game.grid.flat().filter((c) => c.open)).toHaveLength(4);
    expect(game.counterFor(4)).toBe(1);
  });

  it('counts a beaten creature as killed and paid, and a mark as written', () => {
    // Both marks are wrong, as a person's may be: a 2 marked 3 and empty ground marked 1.
    const game = Game.fromLayout(
      ['1 2 . .', '. . . .', '3 . . 1', '2 . . .'],
      ['k1 ? ? ?', '? ? ? ?', '? ? ? ?', 'm3 ? ? m1'],
    );
    const beaten = game.cellAt(0, 0)!;
    expect(beaten.open).toBe(true);
    expect(beaten.alive).toBe(false);
    expect(game.config.quantity).toEqual([2, 2, 1]);
    expect(game.remaining).toEqual([1, 2, 1]);
    expect(game.ex).toBe(1);
    expect(game.level).toBe(1);
    expect(game.config.exp).toEqual([2, 6]);
    expect(game.cellAt(0, 3)!.mark).toBe(3);
    expect(game.cellAt(3, 3)!.mark).toBe(1);
    expect(game.marksPlaced).toEqual([1, 0, 1]);
  });

  it('starts at the level the beaten creatures bought, or higher when asked', () => {
    // No tier 1s: C_1 is 0, so this board is level 2 before anything is killed.
    const truth = ['2 . .', '. . .', '. . 3'];
    const shown = ['? 2 ?', '? ? ?', '? ? ?'];
    expect(Game.fromLayout(truth, shown).level).toBe(2);
    expect(Game.fromLayout(truth, shown, { startLevel: 3 }).level).toBe(3);
    expect(() => Game.fromLayout(truth, shown, { startLevel: 1 })).toThrow(/buys level 2/);
    const beaten = Game.fromLayout(['1 . 2', '. . .', '. . 3'], ['k1 3 ?', '1 6 ?', '? ? ?']);
    expect(beaten.level).toBe(2);
    expect(beaten.progression.toNext()).toBe(2);
  });

  it('refuses a drawing the game could not be showing, naming the cell', () => {
    const refused: Array<[string[], string[], RegExp]> = [
      [['. 1'], ['. 1', '? ?'], /the truth is 2x1/],
      [['. 1', '.'], ['? ?', '?'], /row 1 of the truth drawing is 1 wide, not 2/],
      [['. 1'], ['2 ?'], /0,0 shows 2, but the creatures around it add up to 1/],
      [['. 1'], ['. ?'], /0,0 shows 0, but the creatures around it add up to 1/],
      [['. . . 1'], ['. ? 1 ?'], /the 0 at 0,0 would have opened the covered cells beside it/],
      [['. 1'], ['? 1'], /1,0 shows open ground over a creature of tier 1/],
      [['. 2'], ['2 k1'], /the beaten creature at 1,0 is a 1 but the truth is 2/],
      [['# 1'], ['? ?'], /0,0 is a hole in one drawing and not in the other/],
      [['. 1'], ['1 k1'], /nothing is left alive/],
      [['. .'], ['? ?'], /the truth has no creature/],
      [['. 1'], ['1 x'], /1,0 shows "x"/],
      [['. 1 2'], ['1 m3 ?'], /the mark at 1,0 is not a tier 1 to 2/],
      [['. 1 z'], ['1 ? ?'], /the truth at 2,0 is "z"/],
    ];
    for (const [truth, shown, message] of refused) {
      expect(() => Game.fromLayout(truth, shown), `${truth} / ${shown}`).toThrow(message);
    }
    expect(() => Game.fromLayout(['. 1'], ['1 ?'], { tiers: 0 })).toThrow(/tiers is 0/);
    expect(() => Game.fromLayout(['. 1'], ['1 ?'], { startLevel: 2 })).toThrow(/not in 1..1/);
  });

  it('is read by the placement it is given, and refused where that rule could not deal it', () => {
    // Odd tiers stand on dark squares, where x + y is odd, and even tiers on light.
    const fair = Game.fromLayout(['2 1', '. .'], ['? ?', '3 3'], { placement: 'checker' });
    const rule = placementRule(fair.config.placement);
    expect(rule.display.washes(fair.cellAt(0, 0)!)).toBe(true);
    expect(() => Game.fromLayout(['1 .', '. .'], ['? 1', '1 1'], { placement: 'checker' })).toThrow(
      /breaks the checker placement: tier 1 at 0,0 stands on a light square/,
    );
  });

  it('builds any board in play back from its drawing', () => {
    const kinds: Array<[string, number]> = [
      ['normal', 3],
      ['extreme', 9],
      ['huge', 5],
      ['donut', 4],
      ['cave', 7],
      ['dungeon', 6],
      ['checker', 5],
      ['pairs', 4],
      ['dominoes', 3],
      ['packs', 6],
      ['congo', 5],
    ];
    const seen = { drawn: 0, beaten: 0, marked: 0 };
    for (const [id, board] of kinds) {
      for (const seed of [11, 12, 13]) {
        const game = Game.create(boardConfig(ladders, id, board), seed);
        playPartWay(game, seed);
        if (game.status !== 'playing') continue;
        const { truth, shown } = drawingOf(game);
        seen.drawn++;
        if (shown.some((row) => row.includes('k'))) seen.beaten++;
        if (shown.some((row) => row.includes('m'))) seen.marked++;
        const drawn = Game.fromLayout(truth, shown, {
          startLevel: game.level,
          tiers: game.config.tiers,
          placement: game.config.placement,
        });
        const at = `${id} #${board} seed ${seed}`;
        expect(drawingOf(drawn), at).toEqual({ truth, shown });
        expect(drawn.remaining, at).toEqual(game.remaining);
        expect(drawn.marksPlaced, at).toEqual(game.marksPlaced);
        expect(drawn.level, at).toBe(game.level);
        for (const cell of game.grid.flat()) {
          const twin = drawn.grid[cell.y]![cell.x]!;
          expect([twin.num, twin.alive], `${at} at ${cell.x},${cell.y}`).toEqual([
            cell.num,
            cell.alive,
          ]);
        }
      }
    }
    expect(seen.drawn).toBeGreaterThan(25);
    expect(seen.beaten).toBeGreaterThan(10);
    expect(seen.marked).toBeGreaterThan(10);
  });
});
