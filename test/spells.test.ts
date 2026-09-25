import { describe, expect, it } from 'vitest';
import { paint, testConfig, EMPTY8 } from './helpers.js';
import { Game } from '../src/engine/game.js';
import {
  EXERCISE_LEVELS,
  MANA_PER_EMPTY_CELLS,
  SPELLS,
  SPELL_ORDER,
  orderSpells,
  spellKey,
  spellLabel,
  totalMana,
} from '../src/engine/spells.js';
import { loadLadders } from '../src/data.js';
import { boardConfig, cumulativeExp } from '../src/engine/config.js';
import type { BoardConfig } from '../src/engine/types.js';

function magicConfig(over: Partial<BoardConfig> = {}): BoardConfig {
  return testConfig({
    tiers: 5,
    quantity: [2, 1, 1, 1, 1],
    exp: [4, 20, 60, 200],
    spells: ['reveal', 'census', 'exercise', 'beacon'],
    // Comfortably above the dearest spell, so a test that means to check a
    // rule is never really checking the mana counter.
    startMana: 300,
    ...over,
  });
}

describe('mana', () => {
  it('starts at the board’s allowance and earns tier per kill', () => {
    const game = Game.create(magicConfig({ startMana: 5 }), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    expect(game.mana).toBe(5);
    game.progression.level = 4; // so the fight is free and cannot end the run

    game.open(1, 1);
    // Two sources, both in play: the kill pays its tier, and the cascade round
    // that lone creature pays the exploration trickle for the ground it opened.
    const emptyOpened = game.grid.flat().filter((c) => c.open && c.tier === 0).length;
    expect(game.mana).toBe(5 + 4 + Math.floor(emptyOpened / MANA_PER_EMPTY_CELLS));
  });

  it('trickles while you explore, so spells exist before the first kill', () => {
    const game = Game.create(magicConfig({ startMana: 0 }), 7);
    paint(game, [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.......1',
    ]);
    expect(game.mana).toBe(0);
    game.open(0, 0); // one cascade uncovers most of the board
    const opened = game.grid.flat().filter((c) => c.open && c.tier === 0).length;
    expect(game.mana).toBe(Math.floor(opened / MANA_PER_EMPTY_CELLS));
    expect(game.mana).toBeGreaterThan(0);
  });

  it('pays nothing for ground the board dealt you, or that a spell bought', () => {
    // The auto-opening is not your work.
    const dealt = Game.create(magicConfig({ opening: 'auto', startMana: 0 }), 11);
    expect(dealt.grid.flat().some((c) => c.open)).toBe(true);
    expect(dealt.mana).toBe(0);

    // Neither is a Beacon, which would otherwise refund part of its own cost.
    const bought = Game.create(magicConfig({ startMana: SPELLS.beacon.cost + 18 }), 7);
    paint(bought, [
      '........',
      '........',
      '........',
      '11111111',
      '........',
      '........',
      '........',
      '........',
    ]);
    bought.open(0, 0);
    const before = bought.mana;
    bought.cast('beacon');
    expect(bought.mana).toBe(before - SPELLS.beacon.cost);
  });

  it('gives no trickle to a type without magic', () => {
    const game = Game.create(magicConfig({ spells: [], startMana: 0 }), 7);
    paint(game, EMPTY8);
    game.open(0, 0);
    expect(game.mana).toBe(0);
  });

  it('is linear where EXP is exponential — rich early, poor late', () => {
    const q = [10, 10, 10, 10, 10];
    // mana 10+20+30+40+50 = 150 against exp 10+20+40+80+160 = 310
    expect(totalMana(q)).toBe(150);
    expect(cumulativeExp(q).at(-1)).toBe(310);
    // the tier-1 share of each pool is what makes early spells affordable
    expect(10 / totalMana(q)).toBeGreaterThan(10 / cumulativeExp(q).at(-1)!);
  });
});

describe('Reveal', () => {
  it('opens empty ground', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    const events = game.cast('reveal', 5, 5);
    expect(events.some((e) => e.type === 'spell' && e.detail === 'empty')).toBe(true);
    expect(game.grid[5]![5]!.open).toBe(true);
  });

  it('marks a creature with its true tier, never opening it', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    game.cast('reveal', 1, 1);
    expect(game.grid[1]![1]!.mark).toBe(4);
    expect(game.grid[1]![1]!.open).toBe(false);
    expect(game.hp).toBe(10); // no fight happened
  });

  it('feeds mark-assisted sweep, which is the point', () => {
    const game = Game.create(magicConfig(), 7);
    // (2,2) sees both creatures, so its number is 4 + 1 = 5 — out of reach at LV1.
    paint(game, ['........', '.4.1....', ...EMPTY8.slice(2)]);
    game.open(2, 2);
    expect(game.grid[2]![2]!.num).toBe(5);
    expect(game.safeCells({ useMarks: true })).toHaveLength(0);

    // Revealing the tier-4 leaves a residual of 1, bringing the rest into range.
    game.cast('reveal', 1, 1);
    const after = game.safeCells({ useMarks: true });
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toContain(game.grid[1]![1]); // never the claim itself
  });

  /**
   * A revealed tier is the board talking, not the player guessing, so it
   * carries the same `given` flag a Sudoku clue does — which is what makes it
   * render gold instead of green, and what stops a stray right-click rubbing
   * out information bought with mana that cannot be bought back.
   */
  it('writes a given, not a player mark', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    game.cast('reveal', 1, 1);
    const cell = game.grid[1]![1]!;
    expect(cell.given).toBe(true);

    // And it cannot be taken back off, by either kind of annotation.
    expect(game.setMark(1, 1, 4)).toEqual([{ type: 'blocked', reason: 'given' }]);
    expect(game.toggleNote(1, 1, 2)).toEqual([{ type: 'blocked', reason: 'given' }]);
    expect(cell.mark).toBe(4);
  });

  /**
   * It must not make Sweep stronger, though. The strict proof reads `given`
   * only on the Sudoku path, and no board that carries spells uses it, so a
   * revealed tier still reaches Sweep as mark ASSISTANCE exactly as before.
   */
  it('does not turn strict Sweep into a mark-assisted one', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, ['........', '.4.1....', ...EMPTY8.slice(2)]);
    game.open(2, 2);
    game.cast('reveal', 1, 1);
    expect(game.safeCells({ useMarks: false }), 'a given widened the proof').toHaveLength(0);
    expect(game.safeCells({ useMarks: true }).length).toBeGreaterThan(0);
  });

  /**
   * The ring. A cell with no creature on it is one the player could have
   * opened anyway, so clearing the blank ground around what you just learned
   * about gives away no safety they did not already have — it saves clicks.
   */
  it('clears the empty ground touching what it revealed', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    game.cast('reveal', 1, 1);

    expect(game.grid[1]![1]!.open, 'the creature itself must stay covered').toBe(false);
    for (const n of game.neighboursOf(game.grid[1]![1]!)) {
      expect(n.open, `(${n.x},${n.y}) was left covered`).toBe(true);
    }
  });

  /**
   * And it cannot run away, for a structural reason rather than a limit
   * imposed on it: every neighbour of a tier-N cell carries at least N in its
   * own number, so none of them can be a zero cell, and a cascade needs one.
   *
   * The board here is the strongest case for that claim — one lone creature on
   * an otherwise empty 8x8, so a 55-cell zero-region is sitting directly
   * against the ring. Exactly the eight neighbours open.
   */
  it('never cascades off a creature, however much blank ground is next to it', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, [
      '........',
      '........',
      '........',
      '........',
      '....1...',
      '........',
      '........',
      '........',
    ]);
    const creature = game.grid[4]![4]!;
    expect(game.grid.flat().filter((c) => c.tier === 0 && c.num === 0).length).toBeGreaterThan(40);

    game.cast('reveal', 4, 4);
    const opened = game.grid.flat().filter((c) => c.open);
    expect(opened).toHaveLength(8);
    expect(opened.every((c) => game.neighboursOf(creature).includes(c))).toBe(true);
  });

  /** Revealing empty ground still cascades exactly as it always did. */
  it('still cascades when the cell it opens is a blank one', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '.......1',
    ]);
    game.cast('reveal', 0, 0);
    expect(game.grid.flat().filter((c) => c.open).length).toBeGreaterThan(40);
  });

  /** A neighbour with a creature on it is not blank, and stays covered. */
  it('leaves a neighbouring creature alone', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, ['........', '.42.....', ...EMPTY8.slice(2)]);
    game.cast('reveal', 1, 1);
    expect(game.grid[1]![2]!.open, 'opened the creature next door').toBe(false);
    expect(game.grid[1]![2]!.mark, 'and it should not have been marked either').toBe(0);
  });

  /**
   * Ground you bought is not ground you explored. Paying the trickle on it
   * would refund part of the spell's own price, which is the same reason
   * Beacon's cells and the dealt opening pay nothing.
   */
  it('pays no exploration mana for the ground it opens', () => {
    const game = Game.create(magicConfig({ startMana: SPELLS.reveal.cost + 40 }), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    const before = game.mana;
    game.cast('reveal', 1, 1);
    expect(game.mana).toBe(before - SPELLS.reveal.cost);
  });

  it('refuses an already-open cell without charging', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, EMPTY8);
    game.open(4, 4);
    const mana = game.mana;
    expect(game.cast('reveal', 4, 4)[0]).toMatchObject({ type: 'blocked' });
    expect(game.mana).toBe(mana);
  });
});

describe('Census', () => {
  it('counts creatures where the number sums them', () => {
    const game = Game.create(magicConfig(), 7);
    // Three creatures adjacent to (2,2): tier 1, 1 and 4.
    paint(game, ['........', '.1.1....', '........', '.4......', ...EMPTY8.slice(4)]);
    const mid = game.grid[2]![2]!;
    expect(mid.num).toBe(1 + 1 + 4); // the number is their SUM
    game.cast('census', 2, 2);
    expect(mid.census).toBe(3); // census is their COUNT
    // Together those pin the layout: sum 6 across 3 creatures is 1+1+4.
  });

  it('refuses to charge twice for the same cell', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, EMPTY8);
    game.cast('census', 3, 3);
    const mana = game.mana;
    expect(game.cast('census', 3, 3)[0]).toMatchObject({ type: 'blocked', reason: 'no-effect' });
    expect(game.mana).toBe(mana);
  });
});

describe('Exercise', () => {
  /**
   * Damage is `E * (ceil(E/L) - 1)`, so a level is worth a whole step of that
   * staircase or nothing at all. At LV1 a tier 4 takes four swings and hits
   * back three times for 12; at LV2 it takes two and hits back once for 4.
   */
  it('lends its levels to exactly one fight', () => {
    // Thresholds out of reach, so the level after the fight is the level the
    // spell left behind rather than one the kill paid for.
    const game = Game.create(magicConfig({ hp: 20, exp: [999, 999, 999, 999] }), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    game.cast('exercise');
    expect(game.exerciseCharge).toBe(EXERCISE_LEVELS);

    const events = game.open(1, 1);
    expect(events.some((e) => e.type === 'exercised' && e.spared === 8)).toBe(true);
    expect(game.hp).toBe(20 - 4);
    expect(game.exerciseCharge).toBe(0); // spent
    expect(game.level).toBe(1); // and only lent, never kept
  });

  /** The fight it is bought for: one tier past what you could safely take. */
  it('opens the cell the mark guard would otherwise refuse', () => {
    const game = Game.create(magicConfig({ hp: 20 }), 7);
    paint(game, ['........', '.2......', ...EMPTY8.slice(2)]);
    game.setMark(1, 1, 2);
    expect(game.open(1, 1)[0]).toMatchObject({ type: 'blocked', reason: 'mark-guard' });

    game.cast('exercise');
    expect(game.open(1, 1).some((e) => e.type === 'battle' && e.defeated)).toBe(true);
    expect(game.hp).toBe(20); // LV2 kills a tier 2 outright
  });

  it('still pays full EXP, so it cannot strand a C_k gate', () => {
    const game = Game.create(magicConfig({ hp: 20 }), 7);
    paint(game, ['........', '.4......', ...EMPTY8.slice(2)]);
    game.cast('exercise');
    game.open(1, 1);
    expect(game.ex).toBe(8); // 2^(4-1), undiminished
  });

  it('does not stack', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, EMPTY8);
    game.cast('exercise');
    const mana = game.mana;
    expect(game.cast('exercise')[0]).toMatchObject({ type: 'blocked', reason: 'no-effect' });
    expect(game.mana).toBe(mana);
  });
});

describe('Beacon', () => {
  it('opens an untouched blank region', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, [
      '........',
      '........',
      '........',
      '11111111', // wall splitting the board
      '........',
      '........',
      '........',
      '........',
    ]);
    game.open(0, 0); // take the upper half
    const openBefore = game.grid.flat().filter((c) => c.open).length;
    const events = game.cast('beacon');
    expect(events.some((e) => e.type === 'spell' && e.id === 'beacon')).toBe(true);
    const openAfter = game.grid.flat().filter((c) => c.open).length;
    expect(openAfter).toBeGreaterThan(openBefore);
    // and it never uncovers something alive
    expect(game.grid.flat().some((c) => c.open && c.tier > 0 && c.alive)).toBe(false);
  });

  it('refuses when there is nothing left to open', () => {
    const game = Game.create(magicConfig(), 7);
    paint(game, EMPTY8);
    game.open(0, 0); // one cascade takes the whole board
    const mana = game.mana;
    expect(game.cast('beacon')[0]).toMatchObject({ type: 'blocked', reason: 'no-effect' });
    expect(game.mana).toBe(mana);
  });
});

describe('spell availability', () => {
  it('refuses a spell this type does not offer', () => {
    const game = Game.create(magicConfig({ spells: ['reveal'] }), 7);
    expect(game.cast('exercise')[0]).toMatchObject({ type: 'blocked', reason: 'no-such-spell' });
    expect(game.canCast('exercise')).toBe(false);
  });

  it('refuses when mana is short, and charges exactly the cost otherwise', () => {
    const game = Game.create(magicConfig({ startMana: 5 }), 7);
    paint(game, EMPTY8);
    expect(game.cast('census', 2, 2)[0]).toMatchObject({ type: 'blocked', reason: 'no-mana' });
    game.mana = SPELLS.census.cost;
    game.cast('census', 2, 2);
    expect(game.mana).toBe(0);
  });
});

describe('spell shortcuts', () => {
  /**
   * Keys the board already owns, from `onKey` in src/ui/app.ts. Spell letters
   * are checked after these, so a clash would not break Sweep — it would just
   * mean the spell's own key silently never fires, which is worse than a test
   * failing here.
   */
  const RESERVED = ['s', 'd', 'f'];

  it('gives every spell the letter its name starts with', () => {
    expect(SPELL_ORDER.map((id) => spellKey(id))).toEqual(['c', 'r', 'e', 'b']);
    expect(SPELL_ORDER.map((id) => spellLabel(id))).toEqual([
      '[C]ensus',
      '[R]eveal',
      '[E]xercise',
      '[B]eacon',
    ]);
  });

  /**
   * Cheapest first, and derived from the prices rather than written down: a
   * stored order is a second place the truth lives (decision 0006).
   */
  it('offers spells cheapest first, whatever order the ladder lists them', () => {
    const costs = SPELL_ORDER.map((id) => SPELLS[id].cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));

    // The ladder data's own order is not trusted, so a type cannot be dealt a
    // row that disagrees with its prices.
    expect(orderSpells(['beacon', 'reveal', 'census'])).toEqual(['census', 'reveal', 'beacon']);
    const data = loadLadders();
    for (const type of data.filter((t) => (t.spells ?? []).length > 0)) {
      const offered = boardConfig(data, type.id, 1).spells.map((id) => SPELLS[id].cost);
      expect(offered, `${type.id} offers its spells out of price order`).toEqual(
        [...offered].sort((a, b) => a - b),
      );
    }
  });

  /**
   * Both paper spells would fail this today: Echo starts with the same letter
   * as Exercise, and Scry with the same one as Sweep. That is the point of
   * having it — the clash surfaces when the spell is added, not when a player
   * presses a key and watches the wrong thing happen.
   */
  it('keeps every shortcut distinct, and clear of the board’s own keys', () => {
    const keys = SPELL_ORDER.map((id) => spellKey(id));
    expect(new Set(keys).size, 'two spells want the same letter').toBe(keys.length);
    for (const key of keys) {
      expect(RESERVED, `a spell claims "${key}", which the board already uses`).not.toContain(key);
    }
  });
});

describe('the magic ladders', () => {
  const ladders = loadLadders();
  // Read from the data rather than listed here: magic started as its own
  // branch and has since been handed to the shaped ladders too, so a list in
  // the test would just be a second place to forget.
  const magicTypes = ladders.filter((t) => (t.spells ?? []).length > 0);

  it('has magic ladders to check', () => {
    // Sorted, for the same reason: which ladders carry spells is the claim,
    // not where the menu happens to list them.
    expect(magicTypes.map((t) => t.id).sort()).toEqual([
      'arcane',
      'cave',
      'cross',
      'diamond',
      'donut',
      'dungeon',
      'oracle',
      'workout',
      'wrapped_cross',
    ]);
  });

  it('give every magic type a loadout and a starting pool', () => {
    for (const type of magicTypes) {
      const cfg = boardConfig(ladders, type.id, 1);
      expect(cfg.spells.length, `${type.id} has no spells`).toBeGreaterThan(0);
      expect(cfg.startMana, `${type.id} starts spell-less`).toBeGreaterThan(0);
    }
  });

  /**
   * A board too poor to use the spells it offers is mistuned rather than hard.
   *
   * The prices are meant to bite (decision 0013): you cannot answer
   * everything, so a bar asserting you can afford one of everything would
   * contradict the thing the prices are for. Two claims catch a genuinely
   * broken ladder rather than a deliberately tight one:
   *
   *   the loadout is usable       — the CHEAPEST spell many times over;
   *   nothing on offer is a tease — the DEAREST castable at least once on
   *                                 every board.
   *
   * The measured floors are in `docs/tuning.md`.
   *
   * The pool is the whole one: kills, exploration and the starting hand.
   */
  it('can use its loadout: the cheap spells freely, the dear ones at all', () => {
    for (const type of magicTypes) {
      // What a spell costs on THIS ladder, which is its opening price where a
      // workout rule sets one — WORKOUT's Exercise starts at 30, not 150.
      const cfg = boardConfig(ladders, type.id, 1);
      const costs = cfg.spells.map((s) =>
        s === 'exercise' && cfg.workout ? cfg.workout.base : SPELLS[s].cost,
      );
      const cheapest = Math.min(...costs);
      const dearest = Math.max(...costs);

      for (const board of type.boards) {
        const pool =
          totalMana(board.quantity) +
          (type.start_mana ?? 0) +
          Math.floor(board.empty / MANA_PER_EMPTY_CELLS);

        expect(
          pool / cheapest,
          `${type.id}#${board.n} cannot lean on its cheapest spell`,
        ).toBeGreaterThan(5);
        expect(
          pool / dearest,
          `${type.id}#${board.n} can never cast its dearest spell`,
        ).toBeGreaterThan(1);
      }
    }
  });

  /**
   * And the other half of the same design: buying your way out of EVERY moment
   * a deductive player is cornered must cost a real share of the board.
   *
   * This is the claim the reprice exists to make true, so it is asserted rather
   * than left in a note. The forced-guess counts are the measured means from
   * `npm run sim:spells`; they move slowly, and if a retune moved one far
   * enough to matter here that is worth knowing about.
   */
  it('makes answering every forced guess cost a real share of a board', () => {
    // Measured forced guesses a board, at board 10, per ladder.
    const stuckAtTen: Record<string, number> = {
      arcane: 5.0,
      oracle: 6.0,
      diamond: 1.5,
      donut: 6.0,
      cross: 2.5,
      cave: 5.5,
      dungeon: 3.9,
    };
    for (const type of magicTypes) {
      const stuck = stuckAtTen[type.id];
      if (stuck === undefined) continue;
      const board = type.boards[9]!;
      const pool =
        totalMana(board.quantity) +
        (type.start_mana ?? 0) +
        Math.floor(board.empty / MANA_PER_EMPTY_CELLS);
      const answerEverything = stuck * SPELLS.reveal.cost;

      // DIAMOND is exempt and that is a difficulty fact, not a pricing one: it
      // corners a deductive player 1.5 times a board, so there is barely
      // anything to buy however it is priced.
      if (type.id === 'diamond') continue;
      expect(
        answerEverything / pool,
        `${type.id}#10 can buy its way out of everything`,
      ).toBeGreaterThan(0.3);
    }
  });

  /** The tuned main line is still exactly as it was measured, magic-free. */
  it('leave the main line and the post-game without spells', () => {
    for (const id of ['easy', 'normal', 'extreme', 'huge', 'huge_extreme', 'blind', 'huge_blind']) {
      expect(boardConfig(ladders, id, 1).spells, `${id} grew spells`).toHaveLength(0);
    }
  });
});
