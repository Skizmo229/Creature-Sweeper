/**
 * The graded player in `src/sim/graded.ts`, held to the things that would make its measurements
 * worthless if they failed silently: it reads only what a person can see, and nothing it calls
 * safe, names, or rules out is wrong, on every kind of board there is.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { mulberry32 } from '../src/engine/rng.js';
import { shapeRule } from '../src/engine/shape/registry.js';
import { placementRule } from '../src/engine/placement/registry.js';
import { type GradedRun, play } from '../src/sim/graded.js';
import { everyTier, readBoard } from '../src/sim/reader.js';
import { dungeonScaffold } from '../src/sim/scaffold.js';
import { solve } from '../src/sim/solver.js';
import { TRICKS, TRICK_IDS, type TrickId, type View, noMoves } from '../src/sim/tricks.js';
import { ladders } from './helpers.js';

/** Every kind of board the tricks read differently: each rule, each topology, each shape, level 0. */
const KINDS = [
  'normal',
  'extreme',
  'oracle',
  'huge',
  'hive',
  'wraparound',
  'donut',
  'cross',
  'wrapped_cross',
  'diamond',
  'cave',
  'dungeon',
  'checker',
  'pairs',
  'dominoes',
  'packs',
  'congo',
  'workout',
  'blind',
  'patrol',
  'pyramid',
  'petri',
  'gear',
];

const wrongIn = (run: GradedRun): number => run.unsound + run.trickDamage + run.rescueDamage;

describe('the graded player', () => {
  it('never opens, names or rules out a cell wrongly, on every kind of board', () => {
    const wrong: string[] = [];
    let fired = 0;
    let cleared = 0;
    for (const id of KINDS) {
      for (const board of [2, 6, 10]) {
        const cfg = boardConfig(ladders, id, board);
        // Once spell-less, and once spending where the ladder has spells to spend.
        const spells = cfg.spells.length > 0;
        const game = Game.create(cfg, 0xbeef + board);
        const run = play(game, { grade: 4, spells });
        if (spells) {
          const dry = play(Game.create(cfg, 0xbeef + board), { grade: 4 });
          if (wrongIn(dry)) wrong.push(`${id} #${board} spell-less: ${dry.unsound} wrong`);
        }
        if (wrongIn(run)) {
          const by = TRICK_IDS.filter((t) => run.unsoundBy[t] > 0).join(', ');
          wrong.push(`${id} #${board}: ${run.unsound} wrong (${by}), ${run.trickDamage} HP`);
        }
        fired += TRICK_IDS.reduce((a, t) => a + run.fires[t], 0);
        if (run.cleared) cleared++;
      }
    }
    expect(wrong).toEqual([]);
    // It has to have done something, or this test is exercising nothing.
    expect(fired).toBeGreaterThan(1000);
    expect(cleared).toBeGreaterThan(KINDS.length);
  });

  it('uses every trick somewhere, and each grade concludes what the one below could not', () => {
    // Measured 25 September 2026: which tricks conclude a cell on which boards at grade 4. A
    // read that mostly narrows the pencil (partner-number) counts by its pencil work; the line's
    // ends, which the cheaper reads nearly always pre-empt, has a test of its own below.
    const fires = Object.fromEntries(TRICK_IDS.map((t) => [t, 0])) as Record<TrickId, number>;
    const pencils = Object.fromEntries(TRICK_IDS.map((t) => [t, 0])) as Record<TrickId, number>;
    const stuckAt = [0, 0, 0, 0, 0];
    for (const id of KINDS) {
      for (const board of [2, 6, 10]) {
        for (const [seed, peek] of [
          [0xbeef + board, false],
          [0xbeef + board + 1000, id === 'pairs'],
        ] as const) {
          const cfg = boardConfig(ladders, id, board);
          const spells = cfg.spells.length > 0;
          const run = play(Game.create(cfg, seed), { grade: 4, peek, spells });
          for (const t of TRICK_IDS) {
            fires[t] += run.fires[t];
            pencils[t] += run.pencils[t];
          }
        }
      }
    }
    const silent = TRICK_IDS.filter((t) => fires[t] + pencils[t] === 0);
    expect(silent).toEqual(['line-reach']);
    const concluded = TRICK_IDS.filter((t) => fires[t] > 0);
    expect(concluded).toEqual(expect.arrayContaining(['subtract', 'overlap', 'bounds', 'what-if']));
    expect(concluded).toEqual(expect.arrayContaining(['accounted', 'last-of-tier', 'corridor']));

    for (const grade of [1, 2, 3, 4] as const) {
      for (const id of ['extreme', 'oracle', 'donut', 'cave']) {
        for (const board of [6, 10]) {
          const run = play(Game.create(boardConfig(ladders, id, board), 0xbeef + board), { grade });
          stuckAt[grade] += run.stuckPoints;
        }
      }
    }
    // A stronger player is cornered less over the sample, though not on every seed, since a
    // different first guess sends the games apart.
    expect(stuckAt[4]).toBeLessThanOrEqual(stuckAt[1]);
    expect(stuckAt[2]).toBeLessThanOrEqual(stuckAt[1]);
  });

  it('reads a hidden number only when told to, and nothing changes elsewhere', () => {
    const digest = (run: GradedRun): string =>
      JSON.stringify([run.cleared, run.hpLost, run.stuckPoints, run.guesses, run.fires]);
    let differed = 0;
    for (const board of [4, 8]) {
      const cfg = boardConfig(ladders, 'pairs', board);
      const seed = 0xbeef + board;
      const shown = play(Game.create(cfg, seed), { grade: 2, peek: true });
      const hidden = play(Game.create(cfg, seed), { grade: 2 });
      expect(hidden.fires['partner-number'] + hidden.pencils['partner-number']).toBe(0);
      if (digest(shown) !== digest(hidden)) differed++;
    }
    expect(differed).toBeGreaterThan(0);
    for (const id of ['normal', 'checker', 'packs']) {
      const cfg = boardConfig(ladders, id, 5);
      const shown = play(Game.create(cfg, 0x5eed), { grade: 4, peek: true });
      const hidden = play(Game.create(cfg, 0x5eed), { grade: 4 });
      expect(digest(hidden), id).toBe(digest(shown));
    }
  });

  it('reads the corridors off the silhouette and never names room floor', () => {
    let named = 0;
    let empty = 0;
    const wrong: string[] = [];
    for (let board = 1; board <= 10; board++) {
      for (const s of [0, 1, 2]) {
        const cfg = boardConfig(ladders, 'dungeon', board);
        const seed = 0xd00d + board * 101 + s;
        const map = shapeRule('dungeon').build(
          cfg.shapeParam,
          cfg.width,
          cfg.height,
          mulberry32(seed),
        );
        const scaffold = dungeonScaffold(Game.create(cfg, seed));
        for (const cell of scaffold) {
          named++;
          if (map.spawnable[cell.y]![cell.x])
            wrong.push(`#${board} seed ${seed} (${cell.x},${cell.y})`);
        }
        for (let y = 0; y < cfg.height; y++) {
          for (let x = 0; x < cfg.width; x++) {
            if (map.present[y]![x] && !map.spawnable[y]![x]) empty++;
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    // About half of the map's empty scaffold is found (measured 51% over 2,000 boards on
    // 25 September 2026): the hallways on a loop and their doorways are the ones missed.
    expect(named / empty).toBeGreaterThan(0.4);
    expect(dungeonScaffold(Game.create(boardConfig(ladders, 'normal', 1), 1)).size).toBe(0);
    expect(dungeonScaffold(Game.create(boardConfig(ladders, 'cave', 1), 1)).size).toBe(0);
  });

  it('takes the complete deducer as its ceiling without harm', () => {
    let rescued = 0;
    for (const id of ['extreme', 'oracle', 'checker']) {
      for (const board of [6, 10]) {
        const game = Game.create(boardConfig(ladders, id, board), 0xbeef + board);
        const run = play(game, { grade: 2, rescue: (g) => solve(g, { budget: 5000 }).safe });
        expect(wrongIn(run), `${id} #${board}`).toBe(0);
        rescued += run.rescued;
      }
    }
    expect(rescued).toBeGreaterThan(0);
  });

  it("opens what a line's ends prove empty, once the board shows a line", () => {
    // The read is rare in play because the cheaper reads usually get there first, so it is
    // asked directly: a CONGA LINE board opened at random until the rule proves something.
    const cfg = boardConfig(ladders, 'congo', 6);
    const rule = placementRule(cfg.placement);
    let asked = 0;
    let found = 0;
    for (const seed of [0x5eed, 0x5eed + 1, 0x5eed + 2]) {
      const game = Game.create(cfg, seed);
      const rng = mulberry32(seed);
      while (game.status === 'playing') {
        const free = game.grid.flat().filter((c) => c.present && !c.open && c.tier <= game.level);
        if (!free.length) break;
        const pick = free[Math.floor(rng() * free.length)]!;
        game.open(pick.x, pick.y);
        const proven = [...rule.emptied(game)].filter((c) => !c.open && c.mark === 0);
        if (!proven.length) continue;
        asked++;
        const view: View = {
          game,
          reading: readBoard(game, false),
          level: game.level,
          peek: false,
          domain: () => everyTier(cfg.tiers),
          scaffold: new Set(),
        };
        const moves = noMoves();
        TRICKS['line-reach'].apply(view, moves);
        for (const c of proven) {
          expect(moves.open.has(c), `(${c.x},${c.y})`).toBe(true);
          expect(c.tier).toBe(0);
          found++;
        }
      }
    }
    expect(asked).toBeGreaterThan(0);
    expect(found).toBeGreaterThan(0);
  });
});
