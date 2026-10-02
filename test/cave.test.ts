/**
 * The ragged cave (`src/engine/shape/cave.ts`) on the real ladder: the promises its seeded
 * generator has to keep, on every board and seed.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { ladders, MASK_SEEDS } from './helpers.js';

/**
 * The ragged cave is grown from its seed rather than cut by a predicate, as the dungeon is, so
 * "how many cells does this leave" is a promise the generator has to keep rather than a fact you
 * can read off the config. These are that promise, written down.
 */
describe('the ragged cave', () => {
  const cave = ladders.find((t) => t.id === 'cave')!;

  /**
   * The load-bearing one, and the reason a ragged cave was deferred for so
   * long. Every level threshold on a board is derived from C_k, which is
   * derived from a creature quota, which is a density applied to this number.
   * If the mask came back one cell short on some seed, nothing would throw:
   * the board would just be mistuned on that seed, and the top gate — which is
   * exactly C_k — might sit one kill out of reach.
   */
  it('leaves exactly the cell count the ladder was tuned against', () => {
    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const game = Game.create(cfg, seed);
        expect(
          game.grid.flat().filter((c) => c.present).length,
          `cave#${board.n} seed ${seed}: wrong cell count`,
        ).toBe(board.cells);
      }
    }
  });

  it('carves one connected cave, never an archipelago', () => {
    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const game = Game.create(cfg, seed);
        const present = game.grid.flat().filter((c) => c.present);
        const seen = new Set([present[0]!]);
        const stack = [present[0]!];
        while (stack.length) {
          for (const n of game.neighboursOf(stack.pop()!)) {
            if (!seen.has(n)) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
        expect(seen.size, `cave#${board.n} seed ${seed} fragmented`).toBe(present.length);
      }
    }
  });

  /** A blob, not a rectangle with bites taken out: the box is never the rim. */
  it('never lets the cave touch the edge of its bounding box', () => {
    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const game = Game.create(cfg, seed);
        const onEdge = game.grid
          .flat()
          .filter(
            (c) =>
              c.present &&
              (c.x === 0 || c.y === 0 || c.x === cfg.width - 1 || c.y === cfg.height - 1),
          );
        expect(onEdge, `cave#${board.n} seed ${seed} reached the box edge`).toHaveLength(0);
      }
    }
  });

  /**
   * Caverns, not a filled-in blob. The cave is grown into a space with holes
   * punched out of it, and the test for whether that still happens is how
   * loosely it sits inside its own bounding rectangle: a solid shape of this
   * kind would fill about 0.86 of it, and these measure 0.60 to 0.65 with a
   * worst seed at 0.81 over 600 boards. The bound is set above that worst
   * case — it is here to catch a generator that has gone back to making blobs,
   * not to pin down a number.
   */
  it('grows caverns and bays rather than a filled blob', () => {
    let total = 0;
    let boards = 0;

    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const cells = Game.create(cfg, seed)
          .grid.flat()
          .filter((c) => c.present);
        const xs = cells.map((c) => c.x);
        const ys = cells.map((c) => c.y);
        const span =
          (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
        const ratio = cells.length / span;
        expect(ratio, `cave#${board.n} seed ${seed} is a solid blob`).toBeLessThan(0.88);
        total += ratio;
        boards++;
      }
    }
    expect(total / boards, 'caves are filling in').toBeLessThan(0.75);
  });

  /**
   * And sometimes a cavern closes over completely — cave on all sides of a
   * hole you can never open. Measured at 27% of seeds on the smallest board
   * and 62% on the largest, so the bound is well under both.
   */
  it('sometimes closes a cavern over entirely', () => {
    let enclosing = 0;
    let total = 0;

    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const game = Game.create(cfg, seed);
        // Flood the absent cells inward from outside the cave; an absent cell
        // the flood never reaches is a hole with cave all the way round it.
        const outside = new Set<number>();
        const stack: number[] = [];
        for (let x = 0; x < cfg.width; x++) stack.push(x, (cfg.height - 1) * cfg.width + x);
        for (let y = 0; y < cfg.height; y++)
          stack.push(y * cfg.width, y * cfg.width + cfg.width - 1);
        while (stack.length) {
          const idx = stack.pop()!;
          const x = idx % cfg.width;
          const y = (idx - x) / cfg.width;
          if (x < 0 || y < 0 || x >= cfg.width || y >= cfg.height) continue;
          if (outside.has(idx) || game.grid[y]![x]!.present) continue;
          outside.add(idx);
          stack.push(idx + 1, idx - 1, idx + cfg.width, idx - cfg.width);
        }
        const enclosed = game.grid
          .flat()
          .filter((c) => !c.present && !outside.has(c.y * cfg.width + c.x));
        if (enclosed.length) enclosing++;
        total++;
      }
    }
    expect(enclosing / total, 'no cavern ever closes over any more').toBeGreaterThan(0.1);
  });

  /**
   * No passage one cell wide, anywhere. Every cell arrives as one corner of a
   * 2x2 square laid down whole and nothing is ever taken away again, so this
   * holds by construction — which is exactly why it is worth asserting, since
   * the construction is the only thing holding it up.
   */
  it('never leaves a passage one cell wide', () => {
    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const grid = Game.create(cfg, seed).grid;
        const on = (x: number, y: number) =>
          x >= 0 && y >= 0 && x < cfg.width && y < cfg.height && grid[y]![x]!.present;

        for (const cell of grid.flat()) {
          if (!cell.present) continue;
          const square = [
            [-1, -1],
            [0, -1],
            [-1, 0],
            [0, 0],
          ].some(([ox, oy]) => {
            const x = cell.x + ox!;
            const y = cell.y + oy!;
            return on(x, y) && on(x + 1, y) && on(x, y + 1) && on(x + 1, y + 1);
          });
          expect(
            square,
            `cave#${board.n} seed ${seed}: (${cell.x},${cell.y}) is one cell wide`,
          ).toBe(true);
        }
      }
    }
  });

  /** Nor a corner touch: a gap you could squeeze through but never walk down. */
  it('never joins two parts of the cave at a single corner', () => {
    for (const board of cave.boards) {
      const cfg = boardConfig(ladders, 'cave', board.n);
      for (const seed of MASK_SEEDS) {
        const grid = Game.create(cfg, seed).grid;
        const on = (x: number, y: number) =>
          x >= 0 && y >= 0 && x < cfg.width && y < cfg.height && grid[y]![x]!.present;

        for (const cell of grid.flat()) {
          if (!cell.present) continue;
          for (const [dx, dy] of [
            [1, -1],
            [1, 1],
          ] as const) {
            const pinched =
              on(cell.x + dx, cell.y + dy) && !on(cell.x + dx, cell.y) && !on(cell.x, cell.y + dy);
            expect(
              pinched,
              `cave#${board.n} seed ${seed}: corner pinch at (${cell.x},${cell.y})`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('is a pure function of the seed, and actually varies with it', () => {
    const cfg = boardConfig(ladders, 'cave', 5);
    const shape = (seed: number) =>
      Game.create(cfg, seed)
        .grid.flat()
        .map((c) => (c.present ? '#' : '.'))
        .join('');

    expect(shape(0xc0ffee), 'same seed, different cave').toBe(shape(0xc0ffee));
    expect(shape(0xc0ffee), 'different seed, same cave').not.toBe(shape(0x5eed));
  });
});
