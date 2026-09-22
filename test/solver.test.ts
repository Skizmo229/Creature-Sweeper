/**
 * The complete deducer in `src/sim/solver.ts`, held to the two things that
 * would make its measurements worthless if they failed silently.
 *
 * It claims cells are FREE, so one wrong claim is a free walk into a creature
 * and every number it produces is suspect. And it claims to be complete, so
 * anything Sweep's own proof can open, it must find too — Sweep is a second,
 * independent implementation of part of the same reasoning, which makes it the
 * cheapest alarm there is.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { mulberry32 } from '../src/engine/rng.js';
import type { Cell } from '../src/engine/types.js';
import { play } from '../src/sim/honest.js';
import { solve } from '../src/sim/solver.js';

const ladders = loadLadders();
const covered = (game: Game): Cell[] => game.grid.flat().filter((c) => c.present && !c.open);

describe('the complete deducer', () => {
  it('never calls a cell free that is not, wherever the honest player gets stuck', () => {
    // Every placement rule the solver reads, and a hex grid and a torus, since
    // adjacency is where a model like this goes wrong without failing.
    const LADDERS = ['extreme', 'oracle', 'hive', 'wraparound', 'checker', 'pairs', 'packs', 'congo', 'dungeon'];
    const wrong: string[] = [];
    let freed = 0;
    let hurt = 0;
    for (const id of LADDERS) {
      for (const board of [3, 8]) {
        const game = Game.create(boardConfig(ladders, id, board), 0xbeef + board);
        const run = play(game, 'none', null, {
          rescue: (g) => {
            const r = solve(g, { budget: 5000 });
            expect(r.inconsistent, `${id} #${board}: no layout fits the screen`).toBe(false);
            for (const c of r.safe) {
              if (!c.open && c.tier > g.level) {
                wrong.push(`${id} #${board}: (${c.x},${c.y}) is a ${c.tier} at LV${g.level}`);
              }
            }
            return r.safe;
          },
        });
        freed += run.rescued;
        hurt += run.rescueDamage;
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(hurt).toBe(0);
    // It has to have found something the honest player could not, or this
    // test is exercising nothing.
    expect(freed).toBeGreaterThan(0);
  });

  it('finds everything Sweep proves, on boards opened at random', () => {
    // Random opening scatters the frontier into a loopy mess no real game
    // produces, which is the hard case for completeness — so the boards are
    // kept small enough to settle every question.
    const missed: string[] = [];
    let checked = 0;
    for (const [id, board] of [['cross', 1], ['packs', 1], ['congo', 1], ['dominoes', 1],
      ['dungeon', 6], ['wraparound', 1]] as const) {
      const seed = 0x5eed + board;
      const game = Game.create(boardConfig(ladders, id, board), seed);
      const rng = mulberry32(seed);
      let step = 0;
      while (game.status === 'playing') {
        const free = covered(game).filter((c) => c.tier <= game.level && game.inReach(c));
        if (!free.length) break;
        const pick = free[Math.floor(rng() * free.length)]!;
        game.open(pick.x, pick.y);
        if (++step % 15 !== 0) continue;
        const r = solve(game, { budget: 3000 });
        expect(r.inconsistent).toBe(false);
        for (const c of r.safe) expect(c.tier, `${id} (${c.x},${c.y})`).toBeLessThanOrEqual(game.level);
        if (r.undecided) continue;
        checked++;
        const found = new Set(r.safe);
        for (const c of game.safeCells({ useMarks: false })) {
          if (!found.has(c)) missed.push(`${id} #${board} step ${step}: Sweep opens (${c.x},${c.y})`);
        }
      }
    }
    expect(missed.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(10);
  });
});
