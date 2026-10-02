/**
 * The dungeon (`src/engine/shape/dungeon.ts` and `floorplan.ts`) on the real ladder: the cell
 * count, its hallways, doorways and pockets, and the density its rooms play at.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { mulberry32 } from '../src/engine/rng.js';
import { dungeonMap } from '../src/engine/shape/dungeon.js';
import { ladders, MASK_SEEDS } from './helpers.js';

/**
 * The dungeon is the other seeded mask, and the one with rules of its own:
 * hallways one cell wide that never hold a creature, and a doorway at every
 * room mouth that never holds one either.
 *
 * `dungeonMap` is called again with a fresh rng off the same seed to recover
 * the layout. That reproduces it exactly because nothing draws from the rng
 * between `Game.create` and the mask being built — which is worth knowing, as
 * it is the only way to ask a finished board which of its cells were hallway.
 */
describe('the dungeon', () => {
  const dungeon = findType(ladders, 'dungeon');

  function layout(board: number, seed: number) {
    const cfg = boardConfig(ladders, 'dungeon', board);
    const map = dungeonMap(cfg.width, cfg.height, cfg.shapeParam, mulberry32(seed));
    const grid = Game.create(cfg, seed).grid;
    return {
      cfg,
      grid,
      map,
      on: (x: number, y: number) => grid[y]?.[x]?.present === true,
      hall: (x: number, y: number) => map.hall[y]?.[x] === true,
    };
  }

  /** Every board, every seed, once — the sweep the per-rule tests read from. */
  function eachBoard(fn: (l: ReturnType<typeof layout>, label: string) => void): void {
    for (const board of dungeon.boards) {
      for (const seed of MASK_SEEDS) {
        fn(layout(board.n, seed), `dungeon#${board.n} seed ${seed}`);
      }
    }
  }

  /**
   * The same promise the cave makes, and for the same reason: C_k is a density
   * applied to this number, so a mask that came back short on some seed would
   * not throw — the board would just be mistuned on that seed, with the top
   * gate one kill out of reach.
   */
  it('leaves exactly the cell count the ladder was tuned against', () => {
    for (const board of dungeon.boards) {
      const cfg = boardConfig(ladders, 'dungeon', board.n);
      for (const seed of MASK_SEEDS) {
        const present = Game.create(cfg, seed)
          .grid.flat()
          .filter((c) => c.present);
        expect(present.length, `dungeon#${board.n} seed ${seed}: wrong cell count`).toBe(
          board.cells,
        );
      }
    }
  });

  /**
   * A hallway is somewhere you can always walk. That is the whole of the
   * mode's risk structure: the corridors are free, and stepping off one into a
   * room is the moment you are exposed.
   */
  it('never puts a creature in a hallway', () => {
    eachBoard(({ grid, hall }, label) => {
      for (const cell of grid.flat()) {
        if (!cell.present || cell.tier === 0) continue;
        expect(
          hall(cell.x, cell.y),
          `${label}: creature in the hallway at (${cell.x},${cell.y})`,
        ).toBe(false);
      }
    });
  });

  /**
   * Nor in a doorway — the room cell a hallway arrives at. Without this the
   * hallway would be safe right up to the last step and then not, which is the
   * same unfairness in a smaller space; with it, the cell you arrive on can
   * always be read before you commit to the room.
   */
  it('never puts a creature in a doorway', () => {
    eachBoard(({ grid, map }, label) => {
      for (const cell of grid.flat()) {
        if (!cell.present || cell.tier === 0) continue;
        expect(
          map.spawnable[cell.y]![cell.x],
          `${label}: creature in a doorway at (${cell.x},${cell.y})`,
        ).toBe(true);
      }
    });
  });

  /**
   * Nor in a doorway's POCKET: a room cell orthogonally beside a doorway that
   * is itself against a wall.
   *
   * The doorway alone bought a free read into the room, but the cell you
   * stepped onto next was still a blind commitment — and the crawl rule makes
   * that the expensive kind of guess, because you are forced to gamble on what
   * is in front of you rather than on the cheapest square anywhere. The pocket
   * is a foothold you can always stand in.
   *
   * "Against a wall" is what keeps it a pocket rather than a corridor of
   * immunity reaching into the room: for a door in the middle of a long wall
   * it clears the two cells flanking it and nothing deeper, because the cells
   * further in touch no void. Asserted as a property of the finished board
   * rather than of the mask, so it fails if placement ever stops honouring
   * `spawnable`.
   */
  it('never puts a creature in a doorway pocket', () => {
    const ORTHO = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const RING = [...ORTHO, [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    let pockets = 0;
    eachBoard(({ grid, map }, label) => {
      const isDoor = (x: number, y: number) =>
        map.present[y]?.[x] === true &&
        map.hall[y]?.[x] !== true &&
        ORTHO.some(([dx, dy]) => map.hall[y + dy]?.[x + dx] === true);
      for (const cell of grid.flat()) {
        const { x, y } = cell;
        if (!cell.present || map.hall[y]![x] || isDoor(x, y)) continue;
        if (!ORTHO.some(([dx, dy]) => isDoor(x + dx, y + dy))) continue;
        if (!RING.some(([dx, dy]) => map.present[y + dy]?.[x + dx] !== true)) continue;
        pockets++;
        expect(cell.tier, `${label}: creature in a doorway pocket at (${x},${y})`).toBe(0);
      }
    });
    // Non-vacuous: a rule that never applied would pass this silently.
    expect(pockets, 'no pockets found at all').toBeGreaterThan(100);
  });

  /** And there are doorways to speak of: measured, 8 at the fewest. */
  it('leaves a doorway at every room mouth', () => {
    eachBoard(({ cfg, map }, label) => {
      let doors = 0;
      for (let y = 0; y < cfg.height; y++) {
        for (let x = 0; x < cfg.width; x++) {
          if (map.present[y]![x] && !map.hall[y]![x] && !map.spawnable[y]![x]) doors++;
        }
      }
      expect(doors, `${label}: no doorways at all`).toBeGreaterThan(4);
    });
  });

  /**
   * One cell wide: the elbow choice in `carveHalls` and `thinHalls` exist for
   * this assertion (decision 0003).
   */
  it('keeps every hallway one cell wide', () => {
    eachBoard(({ cfg, hall }, label) => {
      for (let y = 0; y + 1 < cfg.height; y++) {
        for (let x = 0; x + 1 < cfg.width; x++) {
          const wide = hall(x, y) && hall(x + 1, y) && hall(x, y + 1) && hall(x + 1, y + 1);
          expect(wide, `${label}: two-wide hallway at (${x},${y})`).toBe(false);
        }
      }
    });
  });

  it('never joins two parts of the map at a single corner', () => {
    eachBoard(({ grid, on }, label) => {
      for (const cell of grid.flat()) {
        if (!cell.present) continue;
        for (const [dx, dy] of [
          [1, -1],
          [1, 1],
        ] as const) {
          const pinched =
            on(cell.x + dx, cell.y + dy) && !on(cell.x + dx, cell.y) && !on(cell.x, cell.y + dy);
          expect(pinched, `${label}: corner pinch at (${cell.x},${cell.y})`).toBe(false);
        }
      }
    });
  });

  it('leaves every room reachable from every other', () => {
    for (const board of dungeon.boards) {
      for (const seed of MASK_SEEDS) {
        const game = Game.create(boardConfig(ladders, 'dungeon', board.n), seed);
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
        expect(seen.size, `dungeon#${board.n} seed ${seed} fragmented`).toBe(present.length);
      }
    }
  });

  it('never lets the map touch the edge of its bounding box', () => {
    for (const board of dungeon.boards) {
      const cfg = boardConfig(ladders, 'dungeon', board.n);
      for (const seed of MASK_SEEDS) {
        const grid = Game.create(cfg, seed).grid;
        const onEdge = grid
          .flat()
          .filter(
            (c) =>
              c.present &&
              (c.x === 0 || c.y === 0 || c.x === cfg.width - 1 || c.y === cfg.height - 1),
          );
        expect(onEdge, `dungeon#${board.n} seed ${seed} reached the box edge`).toHaveLength(0);
      }
    }
  });

  /**
   * Rooms with walls between them, which is the difference between this mask
   * and the cave's. Wall share is how much of the map's own bounding box is
   * NOT map — one cavern has almost none, a floor plan is mostly wall.
   */
  it('builds rooms with walls between them, not one open cavern', () => {
    eachBoard(({ grid }, label) => {
      const present = grid.flat().filter((c) => c.present);
      const xs = present.map((c) => c.x);
      const ys = present.map((c) => c.y);
      const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      expect(1 - present.length / box, `${label}: hardly any wall inside the map`).toBeGreaterThan(
        0.25,
      );
    });
  });

  /**
   * The pool creatures are dealt into is room floor less the doorways and
   * their pockets, so it is smaller than the board and the density the ladder
   * quotes is not the one you feel.
   *
   * The bound is on the felt density, because that decides whether a board
   * still plays as a puzzle, and not on the share of room floor, which is only
   * a proxy for it: small boards, being mostly room perimeter, cannot reach a
   * high share, yet board 1 plays at ~22% because its nominal density is 12.8%
   * (decision 0003). 35% rather than the 34% ceiling: the
   * worst seed in 40 reaches 34.9%, and HIVE at 35% and CHECKERBOARD at 38.5%
   * already sit past 34% for reasons of their own. If this ever fails, the
   * honest fix is DUNGEON's density schedule, not this number.
   */
  it('keeps the density a room actually plays at under the ceiling', () => {
    eachBoard(({ cfg, map }, label) => {
      let spawnable = 0;
      for (let y = 0; y < cfg.height; y++) {
        for (let x = 0; x < cfg.width; x++) if (map.spawnable[y]![x]) spawnable++;
      }
      const creatures = cfg.quantity.reduce((a, b) => a + b, 0);
      expect(creatures, `${label}: the quota does not fit`).toBeLessThanOrEqual(spawnable);
      expect(creatures / spawnable, `${label}: rooms too packed to be a puzzle`).toBeLessThan(0.35);
    });
  });

  it('is a pure function of the seed, and actually varies with it', () => {
    const cfg = boardConfig(ladders, 'dungeon', 5);
    const shape = (seed: number) =>
      Game.create(cfg, seed)
        .grid.flat()
        .map((c) => (c.present ? '#' : '.'))
        .join('');

    expect(shape(0xc0ffee), 'same seed, different dungeon').toBe(shape(0xc0ffee));
    expect(shape(0xc0ffee), 'different seed, same dungeon').not.toBe(shape(0x5eed));
  });
});
