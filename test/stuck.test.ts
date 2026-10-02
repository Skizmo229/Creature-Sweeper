/**
 * What the honest and the graded player count as a stuck point (`StuckPoint` in
 * `src/sim/honest.ts`): one for every time the player ran out of moves, however many casts it
 * tried there before a move settled it. Spell-less, every stuck point ends in a guess or a
 * rescue, so the count is what the ladders were tuned against either way.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { play as playGraded } from '../src/sim/graded.js';
import { CASTS_AT_A_STUCK_POINT, play as playHonest } from '../src/sim/honest.js';
import { ladders } from './helpers.js';

const BOARDS = [6, 8, 10];
const SEEDS = [0x5eed, 0x5eed + 1];

/** An EXTREME board whose every spell casts and tells nothing, so every stuck point spends. */
function castsInVain(board: number, seed: number): Game {
  const game = Game.create(boardConfig(ladders, 'extreme', board), seed);
  game.canCast = () => game.status === 'playing';
  game.cast = () => [];
  return game;
}

describe('a stuck point', () => {
  it('counts once for the honest player, however many casts it tries there', () => {
    let guesses = 0;
    for (const board of BOARDS) {
      for (const seed of SEEDS) {
        const run = playHonest(castsInVain(board, seed), 'reveal', 'reveal');
        // A cast that tells nothing settles nothing, so each stuck point is the whole budget
        // spent and then a guess.
        expect(run.casts, `#${board}`).toBe(CASTS_AT_A_STUCK_POINT * run.guesses);
        expect(run.stuckPoints, `#${board}`).toBe(run.guesses);
        guesses += run.guesses;
      }
    }
    expect(guesses).toBeGreaterThan(10);
  });

  it('counts once for the graded player, however many casts it tries there', () => {
    let total = 0;
    for (const board of BOARDS) {
      for (const seed of SEEDS) {
        // The deducer is asked once a stuck point, once the casts have been tried.
        let asked = 0;
        const rescue = (): [] => {
          asked++;
          return [];
        };
        const run = playGraded(castsInVain(board, seed), { grade: 2, spells: true, rescue });
        expect(run.stuckPoints, `#${board}`).toBe(asked);
        total += asked;
      }
    }
    expect(total).toBeGreaterThan(10);
  });
});
