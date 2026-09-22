import { describe, expect, it } from 'vitest';
import { Game } from '../src/engine/game.js';
import { computeNumbers, findBestOpening, neighbours } from '../src/engine/board.js';
import { noteTiers } from '../src/engine/notes.js';
import type { BoardConfig } from '../src/engine/types.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';

/**
 * Settings with the Sweep gate taken off.
 *
 * The tuned default charges Sweep by ten hand-opened cells. Tests about what a
 * sweep DOES once it fires say so here rather than banking ten clicks of
 * unrelated setup first — and rather than passing by accident because the
 * setup happened to open enough cells.
 */
const UNGATED_SWEEP = { settings: { ...DEFAULT_GAMEPLAY, sweep: 'on' as const } };

/** A small hand-built board so the assertions can be exact. */
function tinyConfig(over: Partial<BoardConfig> = {}): BoardConfig {
  return {
    typeId: 'test',
    board: 1,
    width: 8,
    height: 8,
    tiers: 3,
    quantity: [4, 3, 2],
    hp: 10,
    startLevel: 1,
    exp: [4, 20],
    search: false,
    placement: 'uniform',
    givens: 0,
    opening: 'none',
    topology: 'square',
    wrap: 'none',
    shape: 'rect',
    shapeParam: 0,
    spells: [],
    startMana: 0,
    reach: 0,
    ...over,
  };
}

/** Replace a generated layout with an exact one, then recompute numbers. */
function paint(game: Game, rows: string[]): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const cell = game.grid[y]![x]!;
      cell.tier = ch === '.' ? 0 : Number(ch);
      cell.alive = cell.tier > 0;
    });
  });
  computeNumbers(game.grid, game.config.topology, game.config.wrap);
  game.remaining.fill(0);
  for (const r of game.grid) {
    for (const c of r) if (c.tier > 0) game.remaining[c.tier - 1]!++;
  }
}

/** Reveal size of every candidate opening on the board, largest-first. */
function everyOpeningSize(grid: Game['grid']): number[] {
  const h = grid.length;
  const w = grid[0]!.length;
  const seen = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  const sizes: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y]![x] || grid[y]![x]!.tier !== 0 || grid[y]![x]!.num !== 0) continue;
      const revealed = new Set<(typeof grid)[0][0]>();
      const stack = [grid[y]![x]!];
      seen[y]![x] = true;
      while (stack.length) {
        const cell = stack.pop()!;
        revealed.add(cell);
        for (const n of neighbours(grid, cell.x, cell.y)) {
          revealed.add(n);
          if (n.tier === 0 && n.num === 0 && !seen[n.y]![n.x]) {
            seen[n.y]![n.x] = true;
            stack.push(n);
          }
        }
      }
      sizes.push(revealed.size);
    }
  }
  return sizes.sort((a, b) => b - a);
}

describe('numbers', () => {
  it('sums neighbouring tiers rather than counting creatures', () => {
    const game = Game.create(tinyConfig(), 1);
    paint(game, [
      '........',
      '.1.1....',
      '..X.....', // X marks the cell under test; painted as empty below
      '.2......',
      '........',
      '........',
      '........',
      '........',
    ].map((r) => r.replace('X', '.')));
    // neighbours of (2,2): 1 at (1,1), 1 at (3,1), 2 at (1,3) -> 4, from 3 creatures
    expect(game.grid[2]![2]!.num).toBe(4);
  });
});

describe('opening', () => {
  it('reveals a region and never uncovers a creature', () => {
    const game = Game.create(tinyConfig({ opening: 'auto' }), 42);
    const open = game.grid.flat().filter((c) => c.open);
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((c) => c.tier === 0)).toBe(true);
  });

  it('picks the region that reveals the most cells', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, [
      '........',
      '........',
      '........',
      '11111111', // wall splitting the board
      '........',
      '...1....', // clutter on the lower half
      '........',
      '........',
    ]);
    const best = findBestOpening(game.grid);
    expect(best).not.toBeNull();
    // Assert the contract rather than a guess at the geometry: the chosen
    // region must reveal at least as much as every other candidate.
    const sizes = everyOpeningSize(game.grid);
    expect(sizes.length).toBeGreaterThan(1); // the fixture really offers a choice
    expect(best!.cells.length).toBe(Math.max(...sizes));
  });

  it('leaves the board cold when the rule is "none"', () => {
    const game = Game.create(tinyConfig({ opening: 'none' }), 42);
    expect(game.grid.flat().some((c) => c.open)).toBe(false);
  });
});

describe('open()', () => {
  it('cascades through blanks but stops at numbers', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.......1',
      '........',
    ]);
    game.open(0, 0);
    expect(game.grid[0]![0]!.open).toBe(true);
    // the lone creature stays covered, and so does its own cell
    expect(game.grid[6]![7]!.open).toBe(false);
  });

  it('fights an alive creature and awards EXP', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.1......', '........', '........',
                 '........', '........', '........', '........']);
    const events = game.open(1, 1);
    expect(events.some((e) => e.type === 'battle' && e.defeated)).toBe(true);
    expect(game.ex).toBe(1);
    expect(game.hp).toBe(10);
    expect(game.grid[1]![1]!.alive).toBe(false);
  });

  it('treats a defeated creature as open ground — its number is shown on hover', () => {
    // It used to flip between sprite and number on a click. Hovering shows the
    // number now, which is the renderer's alone, so a click here is a click on
    // open ground: refused, and nothing about the cell changes.
    const game = Game.create(tinyConfig(), 7);
    // two creatures, so defeating one does not end the board
    paint(game, ['........', '.1......', '........', '........',
                 '........', '........', '......1.', '........']);
    game.open(1, 1);
    expect(game.status).toBe('playing');
    const before = { ...game.grid[1]![1]! };
    expect(game.open(1, 1)).toEqual([{ type: 'blocked', reason: 'already-open' }]);
    expect(game.grid[1]![1]!).toEqual(before);
  });

  it('ends the game when HP runs out', () => {
    const game = Game.create(tinyConfig({ hp: 2 }), 7);
    paint(game, ['........', '.3......', '........', '........',
                 '........', '........', '........', '........']);
    game.open(1, 1); // level 1 vs tier 3 costs 6 — fatal at 2 HP
    expect(game.status).toBe('lost');
    expect(game.hp).toBe(0);
  });

  it('wins a battle board once the last creature falls', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['1.......', '........', '........', '........',
                 '........', '........', '........', '........']);
    const events = game.open(0, 0);
    expect(events.some((e) => e.type === 'won')).toBe(true);
    expect(game.status).toBe('won');
  });

  it('wins a search board once every empty cell is open', () => {
    const cfg = tinyConfig({ search: true, startLevel: 0, exp: [9999, 9999] });
    const game = Game.create(cfg, 7);
    paint(game, ['1.......', '........', '........', '........',
                 '........', '........', '........', '........']);
    for (const row of game.grid) {
      for (const cell of row) if (cell.tier === 0) game.open(cell.x, cell.y);
    }
    expect(game.status).toBe('won');
  });
});

describe('marks', () => {
  it('sets, re-marks and clears', () => {
    const game = Game.create(tinyConfig(), 7);
    expect(game.setMark(0, 0, 3)[0]).toMatchObject({ type: 'marked', from: 0, to: 3 });
    expect(game.setMark(0, 0, 3)[0]).toMatchObject({ type: 'marked', from: 3, to: 0 });
    game.setMark(0, 0, 2);
    expect(game.setMark(0, 0, 0)[0]).toMatchObject({ type: 'marked', from: 2, to: 0 });
  });

  it('blocks clicks on a cell marked above your level', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.3......', '........', '........',
                 '........', '........', '........', '........']);
    game.setMark(1, 1, 3); // level is 1, so this locks the cell
    expect(game.open(1, 1)[0]).toMatchObject({ type: 'blocked', reason: 'mark-guard' });
    expect(game.grid[1]![1]!.open).toBe(false);
  });

  it('lets a mark at or below your level through', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.1......', '........', '........',
                 '........', '........', '........', '........']);
    game.setMark(1, 1, 1);
    game.open(1, 1);
    expect(game.grid[1]![1]!.open).toBe(true);
  });

  it('counts marks against the tier counters in search modes only', () => {
    const battle = Game.create(tinyConfig(), 7);
    battle.setMark(0, 0, 1);
    expect(battle.counterFor(1)).toBe(battle.remaining[0]);

    const search = Game.create(tinyConfig({ search: true, startLevel: 0 }), 7);
    const before = search.counterFor(1);
    search.setMark(0, 0, 1);
    expect(search.counterFor(1)).toBe(before - 1);
  });
});

describe('determinism', () => {
  it('produces an identical board from the same seed', () => {
    const layout = (seed: number) =>
      Game.create(tinyConfig({ opening: 'auto' }), seed).grid.flat().map((c) => c.tier).join('');
    expect(layout(12345)).toBe(layout(12345));
    expect(layout(12345)).not.toBe(layout(54321));
  });
});

describe('sweep and marks', () => {
  it('subtracts creatures you can already see, not just the raw number', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['3.......', '........', '........', '........',
                 '........', '........', '........', '........']);
    // (1,1) sees a 3, so nothing around it is provably free at LV1...
    expect(game.safeCells()).toHaveLength(0);
    // ...but once that tier-3 is dead and visible, the 3 hides nothing at all.
    game.grid[0]![0]!.open = true;
    game.grid[0]![0]!.alive = false;
    expect(game.safeCells().length).toBeGreaterThan(0);
  });

  it('uses the marked value to reach further', () => {
    const game = Game.create(tinyConfig({ tiers: 5, quantity: [1, 0, 0, 1, 0] }), 7);
    paint(game, ['4.......', '........', '..1.....', '........',
                 '........', '........', '........', '........']);
    game.open(1, 1);                       // reveals a 5: the tier-4 plus the tier-1
    expect(game.grid[1]![1]!.num).toBe(5);

    // 5 hides more than LV1 can promise, so nothing is provable yet.
    expect(game.safeCells({ useMarks: false })).toHaveLength(0);

    // Claim the tier-4. Residual is 1, so the rest of that ring is free.
    game.setMark(0, 0, 4);
    const assisted = game.safeCells();
    expect(assisted.length).toBeGreaterThan(0);
    expect(assisted.every((c) => c.mark === 0)).toBe(true);   // never the claim itself
    expect(assisted).not.toContain(game.grid[0]![0]);
  });

  it('ignores marks that contradict the number', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['1.......', '........', '........', '........',
                 '........', '........', '........', '........']);
    game.setMark(0, 1, 5);   // claims 5 beside a cell whose whole number is 1
    const cell = game.grid[1]![1]!;
    expect(cell.num).toBe(1);
    // Over-claiming must not make everything look safe.
    for (const c of game.safeCells()) expect(c.mark).toBe(0);
  });

  it('never opens a cell marked above your level, even mark-assisted', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '........', '........', '........',
                 '........', '........', '........', '........']);
    game.setMark(3, 3, 5);
    game.open(0, 0);
    expect(game.safeCells()).not.toContain(game.grid[3]![3]);
  });

  it('can cost HP when a mark is wrong — the price of the assumption', () => {
    const build = () => {
      const g = Game.create(tinyConfig(), 7, UNGATED_SWEEP);
      paint(g, ['........', '.3......', '........', '........',
                '........', '........', '........', '........']);
      g.open(2, 2);              // reveals a 3: the tier-3 at (1,1)
      expect(g.grid[2]![2]!.num).toBe(3);
      return g;
    };

    // Strict mode cannot touch it: 3 hides more than LV1 can promise.
    const strict = build();
    strict.sweep({ useMarks: false });
    expect(strict.hp).toBe(strict.maxHp);
    expect(strict.grid[1]![1]!.alive).toBe(true);

    // Now claim the 3 sits at (3,3) — it does not; (3,3) is empty ground.
    const lied = build();
    lied.setMark(3, 3, 3);
    lied.sweep();
    // The bad claim made the real tier-3 look free, and it charged for it.
    expect(lied.grid[1]![1]!.alive).toBe(false);
    expect(lied.hp).toBe(lied.maxHp - 6);   // damage(level 1, tier 3) === 6
  });
});

describe('notes — candidate-set pencil marks', () => {
  it('toggles candidates on and off, including empty ground', () => {
    const game = Game.create(tinyConfig(), 7);
    expect(game.toggleNote(0, 0, 2)[0]).toMatchObject({ type: 'noted', from: 0, to: 0b100 });
    expect(game.toggleNote(0, 0, 0)[0]).toMatchObject({ type: 'noted', to: 0b101 });
    expect(noteTiers(game.grid[0]![0]!.notes)).toEqual([0, 2]);
    game.toggleNote(0, 0, 2);
    expect(noteTiers(game.grid[0]![0]!.notes)).toEqual([0]);
  });

  it('is mutually exclusive with a mark, in both directions', () => {
    const game = Game.create(tinyConfig(), 7);
    game.setMark(0, 0, 3);
    const events = game.toggleNote(0, 0, 1);
    expect(events[0]).toMatchObject({ type: 'marked', from: 3, to: 0 });
    expect(game.grid[0]![0]!.mark).toBe(0);

    game.setMark(0, 0, 2);
    expect(game.grid[0]![0]!.notes).toBe(0);
  });

  it('blocks a click only when EVERY candidate is out of reach', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.3......', '..2.....', '........',
                 '........', '........', '........', '........']);
    // Level 1. "This is a 2 or a 3" — both fatal to touch, so the guard holds.
    game.toggleNote(1, 1, 2);
    game.toggleNote(1, 1, 3);
    expect(game.open(1, 1)[0]).toMatchObject({ type: 'blocked', reason: 'note-guard' });
    expect(game.grid[1]![1]!.open).toBe(false);

    // "A 1 or a 3" admits something survivable, so it stays the player's call.
    game.clearNotes(1, 1);
    game.toggleNote(1, 1, 1);
    game.toggleNote(1, 1, 3);
    game.open(1, 1);
    expect(game.grid[1]![1]!.open).toBe(true);
  });

  it('an empty note mask is "no notes", never "nothing is possible"', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.3......', '........', '........',
                 '........', '........', '........', '........']);
    game.toggleNote(1, 1, 3);
    game.toggleNote(1, 1, 3);   // back to blank
    expect(game.grid[1]![1]!.notes).toBe(0);
    // Neither guarded nor swept: a blank cell is simply unannotated.
    expect(game.sweep().some((e) => e.type === 'battle')).toBe(false);
    expect(game.open(1, 1).some((e) => e.type === 'blocked')).toBe(false);
  });

  it('never makes a cell sweepable, however low the candidates are', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.1......', '........', '........',
                 '........', '........', '........', '........']);
    // A pencil mark says "I have not ruled these out", not "it is one of
    // these". Acting on it charges the player for thinking out loud.
    game.toggleNote(1, 1, 0);
    game.toggleNote(1, 1, 1);
    expect(game.safeCells({ useMarks: false })).toHaveLength(0);
    expect(game.safeCells()).toHaveLength(0);
    game.sweep();
    expect(game.grid[1]![1]!.alive).toBe(true);
    expect(game.hp).toBe(game.maxHp);
  });

  it('can never cost HP, however wrong the pencil was', () => {
    // The asymmetry that makes notes safe to use as scratch work: the guard
    // reads them, Sweep does not.
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.3......', '........', '........',
                 '........', '........', '........', '........']);
    game.toggleNote(1, 1, 1);            // it is really a 3
    game.sweep();
    expect(game.grid[1]![1]!.alive).toBe(true);
    expect(game.hp).toBe(game.maxHp);
  });

  it('never sweeps a cell its own notes rule out, even when the number proves it', () => {
    const game = Game.create(tinyConfig(), 7);
    paint(game, ['........', '.1......', '........', '........',
                 '........', '........', '........', '........']);
    game.open(2, 2);                     // a 1: the number alone proves (1,1) free
    expect(game.safeCells({ useMarks: false }).map((c) => [c.x, c.y])).toContainEqual([1, 1]);

    game.toggleNote(1, 1, 3);            // the player insists it is a 3
    expect(game.safeCells().map((c) => [c.x, c.y])).not.toContainEqual([1, 1]);
    game.sweep();
    expect(game.grid[1]![1]!.alive).toBe(true);
  });

});

/**
 * The crawl rule: on a board with a `reach` you may only act within that many
 * steps of ground you have already uncovered.
 *
 * Everything here is asserted on a hand-painted 8x8 rather than on a real
 * DUNGEON board, because what these are about is the rule, and a generated
 * board would make every one of them depend on a seed.
 */
describe('the crawl rule', () => {
  /** A board with one open cell at (0,0) and a reach of 2. */
  function crawlBoard(over: Partial<BoardConfig> = {}): Game {
    const game = Game.create(tinyConfig({ reach: 2, startLevel: 3, ...over }), 7);
    paint(game, [
      '........', '........', '........', '........',
      '........', '........', '........', '........',
    ]);
    game.grid[0]![0]!.open = true;
    return game;
  }

  it('opens ground within reach and refuses ground beyond it', () => {
    const game = crawlBoard();
    expect(game.inReach(game.grid[0]![2]!), 'two steps away').toBe(true);
    expect(game.inReach(game.grid[2]![2]!), 'two diagonal steps away').toBe(true);
    expect(game.inReach(game.grid[0]![3]!), 'three steps away').toBe(false);

    expect(game.open(0, 3)).toEqual([{ type: 'blocked', reason: 'out-of-reach' }]);
    expect(game.grid[3]![0]!.open).toBe(false);
  });

  it('is a walking distance, not a radius — a wall stops it', () => {
    // A full-height wall of absent cells at x=1, with the only way round it
    // more than two steps away. Straight-line distance from (0,0) to (2,0) is
    // two; the distance you could walk is far more than that.
    const game = crawlBoard();
    for (let y = 0; y < 8; y++) game.grid[y]![1]!.present = false;
    computeNumbers(game.grid, game.config.topology, game.config.wrap);

    expect(game.inReach(game.grid[0]![2]!), 'reached through the wall').toBe(false);
    expect(game.inReach(game.grid[1]![0]!), 'on this side of it').toBe(true);
  });

  it('grows as you open ground, which is the whole point of it', () => {
    const game = crawlBoard();
    expect(game.inReach(game.grid[0]![4]!)).toBe(false);
    game.open(0, 2);
    expect(game.inReach(game.grid[0]![4]!), 'the frontier did not move').toBe(true);
  });

  it('governs targeted spells too, so magic cannot teleport the frontier', () => {
    const game = crawlBoard({ spells: ['reveal', 'census'], startMana: 300 });
    const mana = game.mana;
    expect(game.cast('reveal', 6, 6)).toEqual([{ type: 'blocked', reason: 'out-of-reach' }]);
    expect(game.cast('census', 6, 6)).toEqual([{ type: 'blocked', reason: 'out-of-reach' }]);
    expect(game.mana, 'a refused cast still charged').toBe(mana);

    expect(game.cast('census', 2, 2).some((e) => e.type === 'spell')).toBe(true);
  });

  it('leaves marking and pencilling alone — thinking is not acting', () => {
    const game = crawlBoard();
    expect(game.setMark(7, 7, 2).some((e) => e.type === 'marked')).toBe(true);
    expect(game.toggleNote(6, 6, 3).some((e) => e.type === 'noted')).toBe(true);
  });

  it('does not apply to a board that has none', () => {
    const game = Game.create(tinyConfig({ reach: 0 }), 7);
    paint(game, [
      '........', '........', '........', '........',
      '........', '........', '........', '........',
    ]);
    expect(game.inReach(game.grid[7]![7]!)).toBe(true);
    expect(game.sealedIn()).toBe(false);
  });

  /**
   * The exception that keeps the zero-damage guarantee true. Measured at reach
   * 2 over 2,280 generated boards, five ended with the frontier walled in by
   * creatures above the player's level and every free kill out of reach — so
   * the rule lifts rather than leaving a board that cannot be finished.
   */
  describe('when the board seals you in', () => {
    /**
     * One open cell at (0,0), with every cell within two steps of it a tier-3
     * creature — out of reach of a level-1 player, who can kill nothing above
     * tier 1. That is the whole failure mode in eight cells.
     */
    function sealed(): Game {
      const game = Game.create(tinyConfig({ reach: 2, startLevel: 1, tiers: 3 }), 7);
      paint(game, [
        '.33.....', '333.....', '333.....', '........',
        '........', '........', '........', '........',
      ]);
      game.grid[0]![0]!.open = true;
      return game;
    }

    it('lifts the rule when nothing in reach can be opened for free', () => {
      const game = sealed();
      expect(game.level).toBe(1);
      expect(game.sealedIn()).toBe(true);
      // The far side of the board is now fair game, because the near side is
      // nothing but fights that would cost HP.
      expect(game.inReach(game.grid[7]![7]!)).toBe(true);
      expect(game.open(7, 7).some((e) => e.type === 'revealed')).toBe(true);
    });

    it('stays shut while there is anywhere free to go', () => {
      // The same ring with a single cell of empty ground in it. One square you
      // can step on is the whole difference: the rule holds, and the far side
      // of the board stays out of reach.
      const game = sealed();
      game.grid[2]![2]!.tier = 0;
      game.grid[2]![2]!.alive = false;
      computeNumbers(game.grid, game.config.topology, game.config.wrap);

      expect(game.sealedIn()).toBe(false);
      expect(game.inReach(game.grid[7]![7]!)).toBe(false);
      expect(game.inReach(game.grid[2]![2]!)).toBe(true);
    });

    it('reopens the board as soon as the level does not cover the ring', () => {
      // Walled in at LV1; at LV3 the same ring is a row of free kills, so the
      // rule comes back on without anything on the board having changed.
      const game = sealed();
      expect(game.sealedIn()).toBe(true);
      game.progression.level = 3;
      expect(game.sealedIn(), 'the seal outlived the level that caused it').toBe(false);
    });

    it('reads the level, not a spell the player happens to be holding', () => {
      const game = sealed();
      game.exerciseCharge = 2;
      expect(game.sealedIn(), 'a purchase should never be the thing that unsticks a run')
        .toBe(true);
    });

    it('is not sealed before anything is open at all', () => {
      const game = Game.create(tinyConfig({ reach: 2, opening: 'none' }), 7);
      expect(game.grid.flat().some((c) => c.open)).toBe(false);
      expect(game.sealedIn()).toBe(false);
      expect(game.inReach(game.grid[7]![7]!), 'a board nobody may touch').toBe(true);
    });
  });
});

describe('a ladder without Sweep', () => {
  // EASY is where the sum rule is learned, so it offers no Sweep at all —
  // under any setting of the player's dial, and through any door.
  it('offers none on EASY, whatever the dial says', async () => {
    const { loadLadders } = await import('../src/data.js');
    const { boardConfig } = await import('../src/engine/config.js');
    const ladders = loadLadders();
    for (const n of [1, 10]) {
      const game = Game.create(boardConfig(ladders, 'easy', n), 3, {
        settings: { ...DEFAULT_GAMEPLAY, sweep: 'on' },
      });
      expect(game.hasSweep).toBe(false);
      expect(game.sweepAvailable).toBe(false);
      expect(game.chargeNeeded).toBe(0);
      expect(game.sweep()[0]).toMatchObject({ type: 'blocked', reason: 'no-charge' });
    }
    // And every other ladder keeps it.
    for (const type of ladders.filter((t) => t.id !== 'easy')) {
      expect(Game.create(boardConfig(ladders, type.id, 1), 3).hasSweep, type.id).toBe(true);
    }
  });
});
