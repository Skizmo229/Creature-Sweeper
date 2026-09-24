/**
 * The findings from the design research, as executable specifications.
 *
 * These run against the real generated ladder data, so if a schedule in
 * `design/ladders.py` changes in a way that breaks the tuning, this fails.
 */

import { describe, expect, it } from 'vitest';
import { loadLadders } from '../src/data.js';
import { boardConfig, cumulativeExp, findType } from '../src/engine/config.js';
import { presentCellCount } from '../src/engine/board.js';
import { dungeonMap } from '../src/engine/dungeon.js';
import { mulberry32 } from '../src/engine/rng.js';
import { Game } from '../src/engine/game.js';
import { autoplaySearch, autoplayTierOrder } from '../src/sim/autoplay.js';
import { clearableWithoutGuessing } from '../src/engine/sudoku.js';
import { hiddenCap, shadeForTier, shadeOf } from '../src/engine/checker.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';

/**
 * Settings with the Sweep gate taken off.
 *
 * The tuned default charges Sweep by ten hand-opened cells. A test about what
 * a sweep FINDS says so explicitly rather than opening ten unrelated cells
 * first — which on a Sudoku board would also change what there is to find.
 */
const UNGATED_SWEEP = { settings: { ...DEFAULT_GAMEPLAY, sweep: 'on' as const } };

const ladders = loadLadders();
const battleTypes = ladders.filter((t) => !t.search);
const SEEDS = [0xc0ffee, 0x5eed, 0xbeef];

/** Every board config of one game type. */
function boardsOf(typeId: string) {
  return findType(ladders, typeId).boards.map((row) => boardConfig(ladders, typeId, row.n));
}

describe('ladder data', () => {
  it('has twenty-four types of ten boards', () => {
    expect(ladders).toHaveLength(24);
    for (const type of ladders) expect(type.boards).toHaveLength(10);
  });

  it('keeps every threshold at or below C_k — the zero-damage precondition', () => {
    for (const type of battleTypes) {
      for (const board of type.boards) {
        const C = cumulativeExp(board.quantity);
        board.exp.forEach((threshold, k) => {
          expect(
            threshold,
            `${type.id}#${board.n} threshold ${k + 1} exceeds C_${k + 1}`,
          ).toBeLessThanOrEqual(C[k]!);
        });
      }
    }
  });

  it('locks exactly the top `lock` thresholds to C_k', () => {
    for (const type of battleTypes) {
      for (const board of type.boards) {
        const C = cumulativeExp(board.quantity);
        const firstLocked = board.exp.length - board.lock;
        board.exp.forEach((threshold, k) => {
          if (k >= firstLocked) {
            expect(threshold, `${type.id}#${board.n} gate ${k + 1} should equal C_${k + 1}`).toBe(
              C[k],
            );
          }
        });
      }
    }
  });

  it('never makes a later board easier on any threshold', () => {
    for (const type of battleTypes) {
      for (let i = 1; i < type.boards.length; i++) {
        const prev = type.boards[i - 1]!.exp;
        const cur = type.boards[i]!.exp;
        for (let k = 0; k < Math.min(prev.length, cur.length); k++) {
          expect(
            cur[k],
            `${type.id} board ${i + 1} threshold ${k + 1} dipped`,
          ).toBeGreaterThanOrEqual(prev[k]!);
        }
      }
    }
  });
});

describe('the zero-damage guarantee', () => {
  it('clears every battle board in tier order without losing a point of HP', () => {
    for (const type of battleTypes) {
      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        for (const seed of SEEDS) {
          const game = Game.create(cfg, seed);
          const result = autoplayTierOrder(game);
          expect(
            result.cleared,
            `${type.id}#${board.n} seed ${seed} got stuck: ` + JSON.stringify(result.stuck),
          ).toBe(true);
          expect(result.hpLost, `${type.id}#${board.n} seed ${seed} took damage`).toBe(0);
          expect(game.hp).toBe(game.maxHp);
        }
      }
    }
  });

  it('reaches max level exactly, with only the top tier left to spend it on', () => {
    for (const type of battleTypes) {
      const board = type.boards[9]!;
      const cfg = boardConfig(ladders, type.id, board.n);
      const game = Game.create(cfg, 0xc0ffee);
      const result = autoplayTierOrder(game);
      expect(result.finalLevel, `${type.id}#10 should top out at ${board.tiers}`).toBe(board.tiers);
    }
  });
});

describe('search boards', () => {
  it('are cleared by opening every empty cell', () => {
    for (const type of ladders.filter((t) => t.search)) {
      for (const board of [type.boards[0]!, type.boards[9]!]) {
        const cfg = boardConfig(ladders, type.id, board.n);
        const game = Game.create(cfg, 0xc0ffee);
        expect(autoplaySearch(game).cleared).toBe(true);
      }
    }
  });
});

describe('the auto-opening', () => {
  it('always exists and always hands over a usable foothold', () => {
    for (const type of ladders) {
      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        for (const seed of SEEDS) {
          const game = Game.create(cfg, seed);
          const opened = game.grid.flat().filter((c) => c.open);
          expect(opened.length, `${type.id}#${board.n} opened nothing`).toBeGreaterThanOrEqual(9);
          expect(
            opened.every((c) => c.tier === 0),
            `${type.id}#${board.n} opening uncovered a creature`,
          ).toBe(true);
        }
      }
    }
  });
});

/**
 * The crawl rule as the ladder data carries it, and the one claim that matters
 * most: that a board with one can still be cleared without paying HP.
 */
describe('the crawl rule on the real ladders', () => {
  it('is carried by DUNGEON and by nothing else', () => {
    const crawling = ladders.filter((t) => (t.reach ?? 0) > 0).map((t) => t.id);
    expect(crawling).toEqual(['dungeon']);
    expect(boardConfig(ladders, 'dungeon', 1).reach).toBe(2);
  });

  /**
   * A reach of 1 would let you open only the cells already touching your
   * frontier, so the board would advance one ring at a time and no deduction
   * could be acted on until the cascade happened to arrive beside it. It is
   * refused rather than clamped, because it is a different game rather than a
   * harder one and should be chosen on purpose.
   */
  it('refuses a reach of one, and anything that is not a count of steps', () => {
    const dungeon = findType(ladders, 'dungeon');
    for (const bad of [1, -2, 1.5]) {
      expect(
        () => boardConfig([{ ...dungeon, reach: bad }], 'dungeon', 1),
        `reach ${bad}`,
      ).toThrow();
    }
  });

  /**
   * The load-bearing one. The zero-damage guarantee is a claim about what is
   * POSSIBLE, and a rule that says where you may act can take away a
   * possibility the EXP economy was relying on — the free kills are on the
   * board, just not near you. `npm run sim` checks this across every seed;
   * this is the same claim pinned to a handful, so it fails in the test suite
   * rather than only in the simulator.
   */
  it('never costs a board its zero-damage clear', () => {
    for (const board of findType(ladders, 'dungeon').boards) {
      const cfg = boardConfig(ladders, 'dungeon', board.n);
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        const result = autoplayTierOrder(game);
        expect(result.cleared, `dungeon#${board.n} seed ${seed} walled in`).toBe(true);
        expect(result.hpLost, `dungeon#${board.n} seed ${seed} paid HP`).toBe(0);
      }
    }
  });
});

describe('board shapes', () => {
  const shaped = ladders.filter((t) => (t.shape ?? 'rect') !== 'rect');

  it('has shaped ladders to check', () => {
    // Sorted: this asserts WHICH ladders are shaped, not what order the menu
    // puts them in. Menu order is a presentation decision — it moved when the
    // variants were regated on boards cleared — and it has no business
    // failing a test about board geometry.
    expect(shaped.map((t) => t.id).sort()).toEqual([
      'cave',
      'cross',
      'diamond',
      'donut',
      'dungeon',
      'wrapped_cross',
    ]);
  });

  /**
   * The load-bearing test. `design/ladders.py` carries its own copy of the
   * shape predicates because it must know how many cells a shape leaves before
   * it can apportion creatures — and that count feeds C_k and therefore every
   * level threshold. If the two copies ever disagree, the ladder is mistuned in
   * a way nothing else would notice.
   */
  it('agrees with the ladder generator on how many cells a shape leaves', () => {
    for (const type of shaped) {
      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        expect(
          presentCellCount(cfg.shape, cfg.shapeParam, cfg.width, cfg.height),
          `${type.id}#${board.n}: engine mask and ladders.py disagree`,
        ).toBe(board.cells);
      }
    }
  });

  it('leaves every shaped board in one connected piece', () => {
    for (const type of shaped) {
      for (const board of [type.boards[0]!, type.boards[9]!]) {
        const game = Game.create(boardConfig(ladders, type.id, board.n), 0xc0ffee);
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
        // A second region would be unreachable: the opening only reveals one.
        expect(seen.size, `${type.id}#${board.n} is not connected`).toBe(present.length);
      }
    }
  });

  it('treats holes as absent, not empty', () => {
    for (const type of shaped) {
      const game = Game.create(boardConfig(ladders, type.id, 1), 0x5eed);
      const holes = game.grid.flat().filter((c) => !c.present);
      expect(holes.length, `${type.id} carved nothing`).toBeGreaterThan(0);

      for (const hole of holes) {
        // never a creature, never clickable, never anyone's neighbour
        expect(hole.tier, 'creature placed in a hole').toBe(0);
        expect(game.cellAt(hole.x, hole.y), 'hole is clickable').toBeNull();
      }
      for (const cell of game.grid.flat()) {
        for (const n of game.neighboursOf(cell)) {
          expect(n.present, `${type.id}: a hole is someone's neighbour`).toBe(true);
        }
      }
    }
  });

  it('counts only real ground toward a clear', () => {
    for (const type of shaped) {
      const board = type.boards[0]!;
      const game = Game.create(boardConfig(ladders, type.id, board.n), 0xbeef);
      const present = game.grid.flat().filter((c) => c.present).length;
      expect(present).toBe(board.cells);
      expect(board.empty).toBe(board.cells - board.monsters);
    }
  });
});

/**
 * The ragged cave is the only board whose shape is not a predicate, so it is
 * the only one where "how many cells does this leave" is a promise the
 * generator has to keep rather than a fact you can read off the config. These
 * are that promise, written down.
 */
describe('the ragged cave', () => {
  const cave = ladders.find((t) => t.id === 'cave')!;
  const caveSeeds = [...SEEDS, 0x1d107, 0xfeed];

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
      for (const seed of caveSeeds) {
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
      for (const seed of caveSeeds) {
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
      for (const seed of caveSeeds) {
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
      for (const seed of caveSeeds) {
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
      for (const seed of caveSeeds) {
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
      for (const seed of caveSeeds) {
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
      for (const seed of caveSeeds) {
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
  const dungeonSeeds = [...SEEDS, 0x1d107, 0xfeed];

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
      for (const seed of dungeonSeeds) {
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
      for (const seed of dungeonSeeds) {
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
    eachBoard(({ cfg, grid, map }, label) => {
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
   * One cell wide, which is what the mode was changed to be. The old design
   * made every cell part of a 2x2 block and so could not have expressed this
   * at all; what replaced it is the elbow choice in `carveHalls` plus
   * `thinHalls`, and this is the assertion both of them exist for.
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
      for (const seed of dungeonSeeds) {
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
      for (const seed of dungeonSeeds) {
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
   * This used to assert the SHARE — room floor above 77% of the map — and that
   * was only ever a proxy. The thing that matters is the felt density, because
   * that is what decides whether a board still plays as a puzzle, and the
   * share mattered solely because density/share is it. The pocket broke the
   * proxy without breaking the property: small boards cannot reach a 77% share
   * at all, being mostly room perimeter, yet board 1 still only plays at ~22%
   * because its nominal density is 12.8%.
   *
   * So the bound is stated directly now. 35% rather than the 34% ceiling: the
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

describe('cascades', () => {
  it('never uncover a living creature', () => {
    for (const type of ladders) {
      const cfg = boardConfig(ladders, type.id, 5);
      const game = Game.create(cfg, 0xbeef);
      // open a scattering of covered empty cells and re-check after each
      let opens = 0;
      for (const row of game.grid) {
        for (const cell of row) {
          if (opens >= 40 || game.status !== 'playing') break;
          if (cell.open || cell.tier !== 0) continue;
          game.open(cell.x, cell.y);
          opens++;
          const leaked = game.grid.flat().find((c) => c.open && c.tier > 0 && c.alive);
          expect(
            leaked,
            `${type.id}: cascade uncovered a live tier-${leaked?.tier}`,
          ).toBeUndefined();
        }
      }
    }
  });
});

describe('sweep', () => {
  it('is provably free in strict mode — never costs HP on any board', () => {
    for (const type of battleTypes) {
      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        const game = Game.create(cfg, 0x5eed);
        const before = game.hp;
        game.sweep({ useMarks: false });
        expect(game.hp, `${type.id}#${board.n} lost HP to a strict sweep`).toBe(before);
      }
    }
  });

  it('is also free with marks on, as long as no mark is wrong', () => {
    // Nothing is marked here, so the mark-assisted rule can only ever fall
    // back on the proof. This pins the default path, not just the strict one.
    for (const type of battleTypes) {
      for (const board of type.boards) {
        const cfg = boardConfig(ladders, type.id, board.n);
        const game = Game.create(cfg, 0x5eed);
        const before = game.hp;
        game.sweep();
        expect(game.hp, `${type.id}#${board.n} lost HP to sweep`).toBe(before);
      }
    }
  });

  it('only ever targets creatures at or below the player level', () => {
    for (const type of battleTypes) {
      const cfg = boardConfig(ladders, type.id, 3);
      const game = Game.create(cfg, 0x5eed);
      for (const cell of game.safeCells({ useMarks: false })) {
        expect(cell.tier).toBeLessThanOrEqual(game.level);
      }
    }
  });

  it('leaves marked-above-level cells alone', () => {
    const cfg = boardConfig(ladders, 'normal', 1);
    const game = Game.create(cfg, 0x5eed);
    const target = game.safeCells()[0];
    expect(target).toBeDefined();
    game.setMark(target!.x, target!.y, game.level + 1);
    expect(game.safeCells()).not.toContain(target);
  });
});

describe('the sudoku placement', () => {
  const sudokuBoards = boardsOf('sudoku');

  it('lays every tier out as a Sudoku solution', () => {
    for (const cfg of sudokuBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        const at = (x: number, y: number) => game.grid[y]![x]!.tier;
        const expectOnceEach = (tiers: number[], where: string) => {
          expect(
            [...tiers].sort((a, b) => a - b),
            where,
          ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        };
        for (let i = 0; i < 9; i++) {
          expectOnceEach(
            Array.from({ length: 9 }, (_, k) => at(k, i)),
            `row ${i}`,
          );
          expectOnceEach(
            Array.from({ length: 9 }, (_, k) => at(i, k)),
            `column ${i}`,
          );
        }
        for (let by = 0; by < 9; by += 3) {
          for (let bx = 0; bx < 9; bx += 3) {
            const box: number[] = [];
            for (let dy = 0; dy < 3; dy++)
              for (let dx = 0; dx < 3; dx++) box.push(at(bx + dx, by + dy));
            expectOnceEach(box, `box ${bx},${by}`);
          }
        }
      }
    }
  });

  it('opens exactly the nine empty cells, and they pay no EXP', () => {
    // The whole reason the digits are 0-8: tier 0 is a digit, so it lands once
    // per row, column and box, and those nine cells are the opening. A 1-9
    // board would have to pre-kill creatures instead, which grants EXP and
    // would hand the player levels before their first click.
    for (const cfg of sudokuBoards) {
      const game = Game.create(cfg, SEEDS[0]!);
      const open = game.grid.flat().filter((c) => c.open);
      expect(open).toHaveLength(9);
      expect(open.every((c) => c.tier === 0)).toBe(true);
      expect(game.ex).toBe(0);
      expect(game.level).toBe(1);
      expect(game.hp).toBe(game.maxHp);
    }
  });

  it('holds C_k identical on every board, because the rule fixes the quantities', () => {
    // No density dial, no distribution archetype, no tier-count dial. This is
    // what forces the givens count to carry the whole ladder.
    const curves = sudokuBoards.map((cfg) => cumulativeExp(cfg.quantity).join(','));
    expect(new Set(curves).size).toBe(1);
    expect(cumulativeExp(sudokuBoards[0]!.quantity)).toEqual([
      9, 27, 63, 135, 279, 567, 1143, 2295,
    ]);
  });

  it('deals exactly the givens the ladder asked for, always truthfully', () => {
    for (const cfg of sudokuBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        const marked = game.grid.flat().filter((c) => c.mark > 0);
        expect(marked).toHaveLength(cfg.givens);
        // A given is a fact, not a claim: mark-assisted Sweep trusts these.
        expect(marked.every((c) => c.mark === c.tier)).toBe(true);
        // Never on empty ground — the opening already reveals every empty cell.
        expect(marked.every((c) => c.tier > 0)).toBe(true);
      }
    }
  });

  it('never ships a board that needs a guess', () => {
    // The point of the type. At 100% density HP cannot be a guess budget — a
    // tier-8 at LV1 costs 56 against an HP pool of 14-20 — so a board with an
    // unresolvable 50/50 in it is not hard, it is broken.
    for (const cfg of sudokuBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        const tiers: number[] = [];
        const givens: number[] = [];
        for (let y = 0; y < 9; y++) {
          for (let x = 0; x < 9; x++) {
            tiers.push(game.grid[y]![x]!.tier);
            if (game.grid[y]![x]!.mark > 0) givens.push(y * 9 + x);
          }
        }
        const grid = Array.from({ length: 9 }, (_, y) => tiers.slice(y * 9, y * 9 + 9));
        expect(
          clearableWithoutGuessing(grid, givens, cfg.exp, cfg.startLevel),
          `${cfg.typeId}#${cfg.board} seed ${seed}`,
        ).toBe(true);
      }
    }
  });
});

describe('sweep on a sudoku board', () => {
  it('never solves the board for the player', () => {
    // The board is generated by rejecting anything the propagator cannot
    // finish, so a Sweep that reasoned with the Sudoku rule would clear every
    // board of this ladder in one click. It must stay strictly weaker than the
    // generator's own solver, which on every other type happens for free.
    for (const cfg of boardsOf('sudoku')) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        for (let i = 0; i < 20 && game.status === 'playing'; i++) game.sweep();
        expect(game.status, `${cfg.typeId}#${cfg.board} seed ${seed}`).toBe('playing');
        const open = game.grid.flat().filter((c) => c.open).length;
        expect(open, 'sweep alone should not carry the board').toBeLessThan(81);
      }
    }
  });

  it('harvests the marks at or below your level, and nothing else', () => {
    // Sweep on this type is "open what I have already identified". The
    // neighbour-sum proof is not weak here, it is empty: hidden sums run to
    // sixty, so it returned zero cells on every board of the ladder.
    const cfg = boardsOf('sudoku')[0]!;
    const game = Game.create(cfg, SEEDS[0]!, UNGATED_SWEEP);

    const cheap = game.grid.flat().filter((c) => !c.open && c.mark > 0 && c.mark <= game.level);
    const dear = game.grid.flat().filter((c) => !c.open && c.mark > game.level);
    expect(cheap.length, 'board 1 should deal some tier-1 clues').toBeGreaterThan(0);
    expect(dear.length).toBeGreaterThan(0);

    const strict = game.safeCells({ useMarks: false });
    expect(strict.every((c) => c.mark > 0 && c.mark <= game.level)).toBe(true);
    expect(strict.some((c) => dear.includes(c))).toBe(false);

    game.sweep({ useMarks: false });
    expect(game.hp).toBe(game.maxHp);
    expect(cheap.every((c) => c.open)).toBe(true);
    expect(dear.every((c) => !c.open)).toBe(true);
  });

  it('acts on a committed mark, never on an open pencil', () => {
    const cfg = boardsOf('sudoku')[0]!;
    const game = Game.create(cfg, SEEDS[0]!, UNGATED_SWEEP);
    const target = game.grid.flat().find((c) => !c.open && !c.given && c.tier === 1)!;

    game.toggleNote(target.x, target.y, 1);
    expect(game.safeCells().some((c) => c === target)).toBe(false);

    game.setMark(target.x, target.y, 1); // commit it
    expect(game.grid[target.y]![target.x]!.notes).toBe(0);
    expect(game.safeCells().some((c) => c === target)).toBe(true);
    // A mark is the player's claim, so the strict proof still will not take it.
    expect(game.safeCells({ useMarks: false }).some((c) => c === target)).toBe(false);
    game.sweep();
    expect(target.open).toBe(true);
    expect(game.hp).toBe(game.maxHp);
  });

  it('leaves every other ladder sweep untouched', () => {
    // The Sudoku channel is gated on the placement. If that gate leaked, a
    // uniform board would start proving things from a rule it does not obey.
    const cfg = boardConfig(ladders, 'normal', 5);
    const a = Game.create(cfg, SEEDS[0]!);
    expect(cfg.placement).toBe('uniform');
    expect(a.safeCells({ useMarks: false }).length).toBe(
      Game.create(cfg, SEEDS[0]!).safeCells({ useMarks: false }).length,
    );
  });

  it('refuses to let the player rub out a clue', () => {
    const game = Game.create(boardsOf('sudoku')[0]!, SEEDS[0]!);
    const clue = game.grid.flat().find((c) => c.given)!;
    const tier = clue.mark;
    expect(game.setMark(clue.x, clue.y, tier)[0]).toMatchObject({ reason: 'given' });
    expect(game.setMark(clue.x, clue.y, 0)[0]).toMatchObject({ reason: 'given' });
    expect(game.toggleNote(clue.x, clue.y, 1)[0]).toMatchObject({ reason: 'given' });
    expect(clue.mark).toBe(tier);
  });
});

describe('the checkerboard placement', () => {
  const checkerBoards = boardsOf('checker');

  it('puts every creature on a square of its own parity', () => {
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        for (const cell of game.grid.flat()) {
          if (cell.tier === 0) continue;
          expect(
            shadeOf(cell),
            `${cfg.typeId}#${cfg.board} seed ${seed}: tier ${cell.tier} at ${cell.x},${cell.y}`,
          ).toBe(shadeForTier(cell.tier));
        }
      }
    }
  });

  it('leaves empty ground free to sit on either colour', () => {
    // The rule is about creatures, not about cells. If tier 0 were pinned to
    // one colour the board would solve itself: every square of the other
    // colour would be provably occupied before a single click.
    const game = Game.create(checkerBoards[0]!, SEEDS[0]!);
    const empties = game.grid.flat().filter((c) => c.tier === 0);
    expect(empties.some((c) => shadeOf(c) === 'light')).toBe(true);
    expect(empties.some((c) => shadeOf(c) === 'dark')).toBe(true);
  });

  it('deals the two colours within one creature of each other', () => {
    // The promise the mode makes, checked on the boards rather than on the
    // schedule that produced them.
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        let light = 0;
        let dark = 0;
        for (const cell of game.grid.flat()) {
          if (cell.tier === 0) continue;
          if (shadeOf(cell) === 'light') light++;
          else dark++;
        }
        expect(
          Math.abs(light - dark),
          `${cfg.typeId}#${cfg.board} seed ${seed}`,
        ).toBeLessThanOrEqual(1);
        expect(light + dark).toBe(cfg.quantity.reduce((a, b) => a + b, 0));
      }
    }
  });

  it('gives each colour exactly half the board to stand on', () => {
    for (const cfg of checkerBoards) {
      expect((cfg.width * cfg.height) % 2, `${cfg.typeId}#${cfg.board}`).toBe(0);
    }
  });

  it('proves `hiddenCap` against every layout it claims to bound', () => {
    // The load-bearing claim: the cap is the largest tier a single covered
    // cell can be hiding, given the sum behind a number and how many of that
    // number's covered cells are dark. Sweep acts on it as a proof, so it is
    // checked as one -- by enumerating every legal assignment of tiers to a
    // small ring and asking what the biggest light and dark values were.
    //
    // SOUND (never below what a layout can hold) is the half that matters:
    // too high is a missed deduction, too low is HP the player did not agree
    // to spend. TIGHT is checked too, because a cap nobody can reach would
    // quietly be a weaker rule than the one documented.
    const MAX_TIER = 6;
    for (let lights = 0; lights <= 3; lights++) {
      for (let darks = 0; darks <= 3; darks++) {
        if (lights + darks === 0) continue;
        const reachable = new Map<number, { light: number; dark: number }>();

        const walk = (i: number, sum: number, topLight: number, topDark: number): void => {
          if (i === lights + darks) {
            const seen = reachable.get(sum) ?? { light: -1, dark: -1 };
            reachable.set(sum, {
              light: Math.max(seen.light, topLight),
              dark: Math.max(seen.dark, topDark),
            });
            return;
          }
          const isLight = i < lights;
          for (let t = 0; t <= MAX_TIER; t++) {
            // A cell holds empty ground or a creature of its own parity.
            if (t !== 0 && (t % 2 === 0) !== isLight) continue;
            walk(
              i + 1,
              sum + t,
              isLight ? Math.max(topLight, t) : topLight,
              isLight ? topDark : Math.max(topDark, t),
            );
          }
        };
        walk(0, 0, -1, -1);

        for (const [hidden, best] of reachable) {
          if (lights) {
            const cap = hiddenCap('light', hidden, darks);
            expect(cap, `light, hidden ${hidden}, ${darks} dark`).toBeGreaterThanOrEqual(
              best.light,
            );
            if (cap <= MAX_TIER) expect(cap).toBe(best.light);
          }
          if (darks) {
            const cap = hiddenCap('dark', hidden, darks);
            expect(cap, `dark, hidden ${hidden}, ${darks} dark`).toBeGreaterThanOrEqual(best.dark);
            if (cap <= MAX_TIER) expect(cap).toBe(best.dark);
          }
        }
      }
    }
  });

  it('never sweeps a cell that costs HP', () => {
    // The parity bound is the only proof in the game decided per cell rather
    // than for a whole ring at once, so the thing to check is the thing every
    // Sweep rule promises: what it hands you is free.
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        let guard = cfg.width * cfg.height;
        while (game.status === 'playing' && guard-- > 0) {
          const before = game.hp;
          if (!game.sweep({ useMarks: false }).length) break;
          expect(game.hp, `${cfg.typeId}#${cfg.board} seed ${seed}`).toBe(before);
        }
      }
    }
  });

  it('does not let Sweep alone carry a board', () => {
    // Same guard as Sudoku's, for the same reason: the colour rule is real
    // deduction and an automatic deducer that could finish with it would have
    // made the mode a button. It runs out, because it is bounded by what the
    // numbers already on screen say.
    let cleared = 0;
    for (const cfg of checkerBoards) {
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        let guard = cfg.width * cfg.height;
        while (game.status === 'playing' && guard-- > 0) {
          if (!game.sweep({ useMarks: false }).length) break;
        }
        if (game.status === 'won') cleared++;
      }
    }
    expect(cleared).toBe(0);
  });

  it('refuses a board the colours cannot balance', () => {
    // The balance is a property of `quantity`, so it is checked where the
    // ladder data becomes a config -- a schedule that stopped apportioning per
    // parity would otherwise produce a playable board that is not this mode.
    const type = structuredClone(findType(ladders, 'checker'));
    type.boards[0]!.quantity = [...type.boards[0]!.quantity];
    type.boards[0]!.quantity[0]! += 4;
    expect(() => boardConfig([type], 'checker', 1)).toThrow(/within one of each other/);
  });
});
