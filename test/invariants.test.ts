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
import { ladders, battleTypes, drawingOf, playPartWay, SEEDS } from './helpers.js';
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
