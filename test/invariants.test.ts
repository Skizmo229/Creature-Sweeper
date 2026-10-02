/**
 * The findings from the design research, as executable specifications.
 *
 * These run against the real generated ladder data, so if a schedule in
 * `design/ladders.py` changes in a way that breaks the tuning, this fails.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, cumulativeExp, findType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { autoplaySearch, autoplayTierOrder } from '../src/sim/autoplay.js';
import { clearableWithoutGuessing } from '../src/engine/placement/sudoku.js';
import { hiddenCap, shadeOf } from '../src/engine/placement/checker.js';
import {
  ladders,
  battleTypes,
  boardsOf,
  drawingOf,
  playPartWay,
  SEEDS,
  UNGATED_SWEEP,
} from './helpers.js';
import { shapeRule } from '../src/engine/shape/registry.js';
import { placementRule } from '../src/engine/placement/registry.js';

describe('ladder data', () => {
  it('has thirty-five types of ten boards', () => {
    expect(ladders).toHaveLength(35);
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

describe('boards from drawings', () => {
  /** Hand drawings the way the school draws them, and boards in play drawn back. */
  function drawings(): Game[] {
    const games = [
      Game.fromLayout(['. . . .', '. . 4 .', '1 . . .'], ['. 4 ? ?', '1 5 ? ?', '? ? ? ?'], {
        tiers: 5,
      }),
      Game.fromLayout(
        ['1 2 . .', '. . . .', '3 . . 1', '2 . . .'],
        ['k1 ? ? ?', '? ? ? ?', '? ? ? ?', 'm3 ? ? m1'],
      ),
      Game.fromLayout(['2 . .', '. . .', '. . 3'], ['? 2 ?', '? ? ?', '? ? ?'], { tiers: 5 }),
      Game.fromLayout(['1 . 2', '. . .', '. . 3'], ['k1 3 ?', '1 6 ?', '? ? ?']),
    ];
    for (const id of ['normal', 'extreme', 'donut', 'checker', 'pairs']) {
      for (const seed of SEEDS) {
        const game = Game.create(boardConfig(ladders, id, 6), seed);
        playPartWay(game, seed);
        if (game.status !== 'playing') continue;
        const { truth, shown } = drawingOf(game);
        const { tiers, placement } = game.config;
        games.push(Game.fromLayout(truth, shown, { startLevel: game.level, tiers, placement }));
      }
    }
    return games;
  }

  // Facts 1 to 3 hold by construction (`src/engine/layout.ts`); this says so rather than trusts it.
  it('lock every threshold to C_k, and clear at full HP to the top level', () => {
    const games = drawings();
    expect(games.length).toBeGreaterThan(15);
    for (const game of games) {
      const { quantity, tiers, exp } = game.config;
      expect(exp).toEqual(cumulativeExp(quantity).slice(0, tiers - 1));
      // A mark above the level locks its cell, and a drawn mark may be wrong: rub them out.
      for (const c of game.grid.flat()) if (c.mark > 0) game.setMark(c.x, c.y, 0);
      const result = autoplayTierOrder(game);
      expect(result.cleared, JSON.stringify(result.stuck)).toBe(true);
      expect(result.hpLost).toBe(0);
      expect(result.finalLevel).toBe(tiers);
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
        // A blank cell and its ring, except where every creature is shown: there any open cell is
        // a foothold, since each neighbour is plainly empty or a creature. SPRINKLE DONUT runs so
        // dense that a blank cell is often on the rim, and on a few seeds there is none at all.
        const least = placementRule(cfg.placement).display.showsCreatures ? 1 : 9;
        for (const seed of SEEDS) {
          const game = Game.create(cfg, seed);
          const opened = game.grid.flat().filter((c) => c.open);
          expect(opened.length, `${type.id}#${board.n} opened nothing`).toBeGreaterThanOrEqual(
            least,
          );
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
  it('is carried by PYRAMID, DUNGEON, PETRI DISH and SPRINKLE DONUT, and by nothing else', () => {
    const crawling = ladders.filter((t) => (t.reach ?? 0) > 0).map((t) => t.id);
    expect(crawling).toEqual(['pyramid', 'dungeon', 'petri', 'sprinkle_donut']);
    expect(boardConfig(ladders, 'dungeon', 1)).toMatchObject({ reach: 2 });
    expect(boardConfig(ladders, 'dungeon', 1).marksExtendReach).toBeUndefined();
    for (const id of ['pyramid', 'petri', 'sprinkle_donut']) {
      expect(boardConfig(ladders, id, 1)).toMatchObject({ reach: 1, marksExtendReach: true });
    }
  });

  /**
   * A reach of 1 would let you open only the cells already touching your
   * frontier, so the board would advance one ring at a time and no deduction
   * could be acted on until the cascade happened to arrive beside it. It is
   * refused rather than clamped, because it is a different game rather than a
   * harder one and should be chosen on purpose: PETRI DISH chose it, paired
   * with marks that extend it, and only that pairing is accepted.
   */
  it('refuses a reach of one on its own, and anything that is not a count of steps', () => {
    const dungeon = findType(ladders, 'dungeon');
    for (const bad of [1, -2, 1.5]) {
      expect(
        () => boardConfig([{ ...dungeon, reach: bad }], 'dungeon', 1),
        `reach ${bad}`,
      ).toThrow();
    }
    const petri = findType(ladders, 'petri');
    expect(() => boardConfig([{ ...petri, reach_marks: false }], 'petri', 1)).toThrow(/reach of 1/);
    const normal = findType(ladders, 'normal');
    expect(() => boardConfig([{ ...normal, reach_marks: true }], 'normal', 1)).toThrow(/extend/);
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
    for (const id of ['pyramid', 'dungeon', 'petri', 'sprinkle_donut']) {
      for (const board of findType(ladders, id).boards) {
        const cfg = boardConfig(ladders, id, board.n);
        for (const seed of SEEDS) {
          const game = Game.create(cfg, seed);
          const result = autoplayTierOrder(game);
          expect(result.cleared, `${id}#${board.n} seed ${seed} walled in`).toBe(true);
          expect(result.hpLost, `${id}#${board.n} seed ${seed} paid HP`).toBe(0);
        }
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
      'card',
      'cave',
      'cross',
      'diamond',
      'donut',
      'dungeon',
      'gear',
      'petri',
      'pyramid',
      'sprinkle_donut',
      'star',
      'ultra_hive',
      'valentines',
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
          shapeRule(cfg.shape).cellCount(cfg.shapeParam, cfg.width, cfg.height),
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
