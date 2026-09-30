/**
 * A board as the moves made on it (`src/engine/replay.ts`, decision 0057): the same moves on the
 * same seed reach the same board, on every ladder, and a paused run takes up where it stopped.
 * A paused board is only as good as this, and a replay that drifted would hand the player a
 * different board under the old one's name, so it is checked on every ladder rather than trusted.
 */

import { describe, expect, it } from 'vitest';
import { findType } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import {
  type Move,
  boardDigest,
  decodeMove,
  encodeMove,
  playMove,
  replayMoves,
} from '../src/engine/replay.js';
import { type Rng, mulberry32 } from '../src/engine/rng.js';
import { FullRun } from '../src/engine/run.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';
import { SEEDS, boardsOf, ladders } from './helpers.js';

/** How many moves the random player makes on each board. */
const MOVES = 120;

/** Everything a board is, as text, for comparing two of them outright. */
const stateOf = (game: Game): string =>
  JSON.stringify({
    grid: game.grid,
    status: game.status,
    hp: game.hp,
    level: game.level,
    ex: game.ex,
    mana: game.mana,
    remaining: game.remaining,
    marksPlaced: game.marksPlaced,
    exercise: [game.exerciseCharge, game.exerciseSurcharge],
    charge: game.charge,
    moves: game.moves,
    sealed: game.sealedIn(),
  });

const pickOf = <T>(rng: Rng, items: readonly T[]): T | undefined =>
  items[Math.floor(rng() * items.length)];

/**
 * The digest as 0.9.1 and every build before it took it, copied here so that version 1 can never
 * drift from what the games paused by them hold (decision 0084).
 */
function digestOf091(game: Game): string {
  const cells = game.grid
    .flat()
    .map(
      (c) =>
        `${c.tier},${c.num},${+c.open},${+c.alive},${+c.occupied},${+c.present},` +
        `${c.mark},${+c.given},${c.notes}`,
    );
  const standing = [
    game.status,
    game.hp,
    game.maxHp,
    game.level,
    game.ex,
    game.mana,
    game.exerciseCharge,
    game.exerciseSurcharge,
    game.charge,
    game.moves,
  ];
  const text = `${JSON.stringify(game.config)}|${standing.join(',')}|${cells.join(';')}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * A move of every kind the player has, mostly ones that get somewhere: free kills and empty ground
 * within reach, with marks, notes, sweeps, spells, waits and the odd blind click among them.
 */
function randomMove(game: Game, rng: Rng): Move {
  const cells = game.grid.flat().filter((c) => c.present);
  const covered = cells.filter((c) => !c.open);
  const cell = pickOf(rng, covered.length ? covered : cells)!;
  const { x, y } = cell;
  const r = rng();
  if (r < 0.45) {
    const free = covered.filter((c) => c.tier <= game.level && game.inReach(c) && c.mark === 0);
    const pick = pickOf(rng, free) ?? cell;
    return { kind: 'open', x: pick.x, y: pick.y };
  }
  if (r < 0.47) return { kind: 'open', x, y };
  if (r < 0.62) return { kind: 'mark', x, y, mark: Math.floor(rng() * (game.config.tiers + 1)) };
  if (r < 0.77) return { kind: 'note', x, y, tier: Math.floor(rng() * (game.config.tiers + 1)) };
  if (r < 0.84) return { kind: 'sweep', useMarks: rng() < 0.5 };
  if (r < 0.88) {
    const open =
      pickOf(
        rng,
        cells.filter((c) => c.open),
      ) ?? cell;
    return { kind: 'chord', x: open.x, y: open.y, useMarks: rng() < 0.5 };
  }
  const spell = pickOf(rng, game.spells);
  if (r < 0.95 && spell) return { kind: 'cast', id: spell, x, y };
  return { kind: 'wait' };
}

/** Play the random player on a board, returning its moves and what each one did. */
function playRandomly(game: Game, seed: number): { moves: Move[]; events: string[] } {
  const rng = mulberry32(seed);
  const moves: Move[] = [];
  const events: string[] = [];
  for (let i = 0; i < MOVES && game.status === 'playing'; i++) {
    const move = randomMove(game, rng);
    moves.push(move);
    events.push(JSON.stringify(playMove(game, move)));
  }
  return { moves, events };
}

describe('a board replayed from its moves', () => {
  for (const type of ladders) {
    const boards = boardsOf(type.id);
    const picks = [boards[0]!, boards[boards.length - 1]!];
    it(`is the same board on ${type.id}, first and last, move for move`, () => {
      for (const config of picks) {
        for (const seed of SEEDS) {
          const played = Game.create(config, seed);
          const { moves, events } = playRandomly(played, seed ^ 0x9e37);
          const replayed = Game.create(config, seed);
          moves.forEach((move, i) => {
            expect(JSON.stringify(playMove(replayed, move))).toBe(events[i]);
          });
          expect(stateOf(replayed)).toBe(stateOf(played));
          expect(boardDigest(replayed)).toBe(boardDigest(played));
          expect(boardDigest(played, 1)).toBe(digestOf091(played));
        }
      }
    });
  }

  it('comes back through storage unchanged', () => {
    const game = Game.create(boardsOf('arcane')[4]!, SEEDS[0]!);
    const { moves } = playRandomly(game, 1);
    const stored = JSON.parse(JSON.stringify(moves.map(encodeMove))) as unknown[];
    expect(stored.map(decodeMove)).toEqual(moves);
    const again = Game.create(boardsOf('arcane')[4]!, SEEDS[0]!);
    replayMoves(again, moves);
    expect(boardDigest(again)).toBe(boardDigest(game));
  });

  it('refuses anything stored that is not a move', () => {
    const junk: unknown[] = [
      null,
      'o',
      ['o', 1],
      ['o', 1, 2.5],
      ['m', 1, 2],
      ['s', 2],
      ['r', 1, 2],
      ['r', 1, 2, 2],
      ['c', 'banish'],
      ['c', 'reveal', 1],
      ['w', 0],
      ['x', 1, 2],
      { kind: 'open', x: 1, y: 2 },
    ];
    for (const code of junk) expect(decodeMove(code)).toBeNull();
  });

  it('fingerprints a different board, and a different standing, differently', () => {
    const config = boardsOf('normal')[2]!;
    const a = Game.create(config, SEEDS[0]!);
    expect(boardDigest(Game.create(config, SEEDS[0]!))).toBe(boardDigest(a));
    expect(boardDigest(Game.create(config, SEEDS[1]!))).not.toBe(boardDigest(a));
    expect(boardDigest(Game.create({ ...config, hp: config.hp + 1 }, SEEDS[0]!))).not.toBe(
      boardDigest(a),
    );
    const before = boardDigest(a);
    const covered = a.grid.flat().find((c) => c.present && !c.open)!;
    a.toggleNote(covered.x, covered.y, 0);
    expect(boardDigest(a)).not.toBe(before);
  });

  /**
   * What version 1 missed, each changed as an update to a rule would change it: the same board and
   * the same moves, and one answer different. Version 2 sees each; version 1 is kept only to check
   * a game paused under it.
   */
  it('fingerprints what the spells said, a sprinkle’s partner and the sweeps left, from version 2', () => {
    const changes = (game: Game, change: () => void): void => {
      const [first, full] = [boardDigest(game, 1), boardDigest(game)];
      change();
      expect(boardDigest(game, 1)).toBe(first);
      expect(boardDigest(game)).not.toBe(full);
    };

    const augur = Game.create(boardsOf('augur')[0]!, SEEDS[0]!);
    const ring = augur.grid
      .flat()
      .find((c) => c.open && augur.neighboursOf(c).some((n) => !n.open))!;
    augur.cast('census', ring.x, ring.y);
    augur.cast('augur', ring.x, ring.y);
    expect(ring.census).not.toBeNull();
    expect(ring.augur).not.toBeNull();
    changes(augur, () => (ring.census = ring.census! + 1));
    changes(augur, () => (ring.augur = ring.augur! + 1));

    const sprinkles = Game.create(boardsOf('sprinkle_donut')[0]!, SEEDS[0]!);
    const half = sprinkles.grid.flat().find((c) => c.partner)!;
    changes(sprinkles, () => (half.partner = { x: half.x, y: half.y }));

    const budget = (sweepBudget: number): Game =>
      Game.create(boardsOf('normal')[2]!, SEEDS[0]!, {
        settings: { ...DEFAULT_GAMEPLAY, sweep: 'budget', sweepBudget },
      });
    expect(boardDigest(budget(3), 1)).toBe(boardDigest(budget(5), 1));
    expect(boardDigest(budget(3))).not.toBe(boardDigest(budget(5)));
  });
});

describe('a Full Run resumed', () => {
  it('takes up the board it stopped on, with the HP it carried in', () => {
    const run = FullRun.start(ladders, 'normal', SEEDS[0]!);
    for (let board = 1; board <= 3; board++) {
      expect(autoplayTierOrder(run.game).cleared).toBe(true);
      run.advance();
    }
    const { moves } = playRandomly(run.game, 7);
    const resumed = FullRun.resume(ladders, 'normal', run.seed, run.legs);
    replayMoves(resumed.game, moves);
    expect(resumed.boardIndex).toBe(4);
    expect(resumed.legs).toEqual(run.legs);
    expect(resumed.hp).toBe(run.hp);
    expect(boardDigest(resumed.game)).toBe(boardDigest(run.game));
  });

  it('with no legs is a run on board 1', () => {
    const resumed = FullRun.resume(ladders, 'easy', SEEDS[1]!, []);
    expect(resumed.boardIndex).toBe(1);
    expect(boardDigest(resumed.game)).toBe(
      boardDigest(FullRun.start(ladders, 'easy', SEEDS[1]!).game),
    );
  });

  it('refuses legs the run could not have had', () => {
    const run = FullRun.start(ladders, 'normal', SEEDS[0]!);
    autoplayTierOrder(run.game);
    const leg = run.advance();
    const resume = (legs: typeof run.legs) => () =>
      FullRun.resume(ladders, 'normal', run.seed, legs);
    expect(resume([leg])).not.toThrow();
    expect(resume([{ ...leg, board: 2 }])).toThrow();
    expect(resume([{ ...leg, healed: leg.healed + 1, hpAfter: leg.hpAfter + 1 }])).toThrow();
    expect(resume([{ ...leg, hpAtClear: 0 }])).toThrow();
    const last = findType(ladders, 'normal').boards.length;
    const all = Array.from({ length: last }, (_, i) => ({ ...leg, board: i + 1 }));
    expect(resume(all)).toThrow();
  });
});
