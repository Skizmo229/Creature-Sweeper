/**
 * Adjacency on the real ladders, all of it through `neighbours()` (`src/engine/grid.ts`): square
 * and hex cells, wrapped edges, a shaped board with its edges joined, and the numbers read off it.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { ladders } from './helpers.js';

describe('topology', () => {
  it('gives hex cells six neighbours and square cells eight', () => {
    for (const id of ['normal', 'hive']) {
      const cfg = boardConfig(ladders, id, 1);
      const game = Game.create(cfg, 0xc0ffee);
      // an interior cell, well away from the edges
      const cell = game.cellAt(10, 8)!;
      expect(game.neighboursOf(cell), `${id} neighbour count`).toHaveLength(
        cfg.topology === 'hex' ? 6 : 8,
      );
    }
  });

  it('gives every cell a full neighbour count once the edges are joined', () => {
    for (const [id, expected] of [
      ['normal', 8],
      ['wraparound', 8],
    ] as const) {
      const cfg = boardConfig(ladders, id, 1);
      const game = Game.create(cfg, 0xc0ffee);
      // A corner: on an open board it has 3 neighbours, on a torus the full 8.
      const corner = game.cellAt(0, 0)!;
      const got = game.neighboursOf(corner).length;
      if (cfg.wrap === 'both') expect(got, `${id} corner`).toBe(expected);
      else if (cfg.wrap === 'horizontal') expect(got, `${id} corner`).toBe(5);
      else expect(got, `${id} corner`).toBe(3);
    }
  });

  it('never makes a cell its own neighbour when wrapped', () => {
    for (const id of ['wraparound', 'wrapped_cross']) {
      const game = Game.create(boardConfig(ladders, id, 1), 0x5eed);
      for (const row of game.grid) {
        for (const cell of row) {
          const ns = game.neighboursOf(cell);
          expect(ns, `${id} self-adjacent at (${cell.x},${cell.y})`).not.toContain(cell);
          expect(new Set(ns).size, `${id} duplicate neighbour`).toBe(ns.length);
        }
      }
    }
  });

  it('keeps wrapped adjacency symmetric in both directions', () => {
    for (const id of ['wraparound', 'wrapped_cross']) {
      const game = Game.create(boardConfig(ladders, id, 1), 0xbeef);
      for (const row of game.grid) {
        for (const cell of row) {
          for (const n of game.neighboursOf(cell)) {
            expect(
              game.neighboursOf(n),
              `${id} asymmetric (${cell.x},${cell.y}) -> (${n.x},${n.y})`,
            ).toContain(cell);
          }
        }
      }
    }
  });

  /**
   * No ladder wraps a hex board, so this is the config guard alone: hex rows alternate their
   * offset, and only an even height puts an indented row across the seam from an unindented one.
   */
  it('wraps a hex board top to bottom only on an even height, where adjacency stays mutual', () => {
    const hive = ladders.find((t) => t.id === 'hive')!;
    const wrapped = { ...hive, wrap: 'both' };
    const odd = hive.boards.find((row) => row.h % 2 === 1)!;
    const even = hive.boards.find((row) => row.h % 2 === 0)!;
    expect(() => boardConfig([wrapped], hive.id, odd.n)).toThrow(/needs an even height/);
    const game = Game.create(boardConfig([wrapped], hive.id, even.n), 0xbeef);
    for (const row of game.grid) {
      for (const cell of row) {
        for (const n of game.neighboursOf(cell)) {
          expect(
            game.neighboursOf(n),
            `asymmetric (${cell.x},${cell.y}) -> (${n.x},${n.y})`,
          ).toContain(cell);
        }
      }
    }
  });

  /**
   * WRAPPED CROSS is the first board that is both shaped and wrapped, and the
   * combination is the only thing about it that is new: a joined edge made
   * almost entirely of holes, with the arm's tip the one strip of it that is
   * really there. So the claim worth pinning is that the wrap joins the ARMS —
   * a tip cell reaches the opposite tip and nothing reaches into the corner
   * quadrants, which are absent on both sides of the seam.
   */
  describe('a shaped board with its edges joined', () => {
    const cfg = boardConfig(ladders, 'wrapped_cross', 1);
    const game = Game.create(cfg, 0xc0ffee);
    const w = cfg.width;
    const h = cfg.height;
    const midY = Math.floor((h - 1) / 2);
    const midX = Math.floor((w - 1) / 2);

    it('joins the arm tips to each other', () => {
      const left = game.cellAt(0, midY)!;
      const right = game.cellAt(w - 1, midY)!;
      expect(game.neighboursOf(left), 'left arm does not reach the right one').toContain(right);

      const top = game.cellAt(midX, 0)!;
      const bottom = game.cellAt(midX, h - 1)!;
      expect(game.neighboursOf(top), 'top arm does not reach the bottom one').toContain(bottom);
    });

    it('gives a tip cell the neighbour count of one in mid-arm', () => {
      // The tip is what the wrap is FOR: without it the arm ends and the tip
      // is the cheap foothold. With it there is no end to find.
      const tip = game.cellAt(0, midY)!;
      const inland = game.cellAt(3, midY)!;
      expect(game.neighboursOf(tip)).toHaveLength(game.neighboursOf(inland).length);
    });

    it('joins nothing where the seam runs past a hole', () => {
      // The corner quadrants are cut away on both sides of every seam, so
      // most of this board's joined edge is hole meeting hole. A hole
      // neighbours nothing in either direction — which is what keeps
      // adjacency symmetric, and is checked here because a shaped board is
      // the only place the two directions can disagree.
      for (const row of game.grid) {
        for (const cell of row) {
          if (cell.present) continue;
          expect(
            game.neighboursOf(cell),
            `hole at (${cell.x},${cell.y}) has neighbours`,
          ).toHaveLength(0);
        }
      }
      for (const row of game.grid) {
        for (const cell of row) {
          for (const n of game.neighboursOf(cell)) {
            expect(n.present, `(${cell.x},${cell.y}) neighbours a hole`).toBe(true);
          }
        }
      }
    });

    it('leaves the same cells present as the unwrapped cross', () => {
      // Joining edges is an adjacency change and nothing else: the silhouette
      // is still CROSS's, which is what lets it carry CROSS's own schedule.
      const plain = Game.create(boardConfig(ladders, 'cross', 1), 0xc0ffee);
      const mask = (g: Game) =>
        g.grid
          .flat()
          .map((c) => (c.present ? '#' : '.'))
          .join('');
      expect(mask(game)).toBe(mask(plain));
    });
  });

  it('keeps hex adjacency symmetric — a neighbour of mine has me as a neighbour', () => {
    const game = Game.create(boardConfig(ladders, 'hive', 1), 0xbeef);
    for (const row of game.grid) {
      for (const cell of row) {
        for (const n of game.neighboursOf(cell)) {
          expect(
            game.neighboursOf(n),
            `hex adjacency not symmetric at (${cell.x},${cell.y}) -> (${n.x},${n.y})`,
          ).toContain(cell);
        }
      }
    }
  });

  it('numbers every board from its own adjacency, whatever the shape', () => {
    for (const id of ['normal', 'hive', 'wraparound', 'wrapped_cross']) {
      const game = Game.create(boardConfig(ladders, id, 1), 0x5eed);
      for (const row of game.grid) {
        for (const cell of row) {
          const sum = game.neighboursOf(cell).reduce((a, n) => a + n.tier, 0);
          expect(cell.num, `${id} number wrong at (${cell.x},${cell.y})`).toBe(sum);
        }
      }
    }
  });
});
