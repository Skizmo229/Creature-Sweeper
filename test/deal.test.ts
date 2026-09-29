/**
 * A deal that a seed refuses is tried again from the seed after it, up to a few, before the
 * refusal is let through (decision 0081); a seed that deals is dealt as it always was, and the
 * game keeps the seed it was asked for, so a paused board deals the same board.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { dealGrid, generateGrid } from '../src/engine/generate.js';
import { mulberry32 } from '../src/engine/rng.js';
import type { Grid } from '../src/engine/grid.js';
import { ladders } from './helpers.js';

/** A dealer that refuses the first `times` seeds it is handed, then deals as the real one does. */
function refusing(times: number): typeof generateGrid {
  let left = times;
  return (cfg, rng) => {
    if (left-- > 0) throw new Error('refused: no board from this seed');
    return generateGrid(cfg, rng);
  };
}

/** Where the creatures are, which is what a seed decides. */
const tiers = (grid: Grid): string =>
  grid.map((row) => row.map((c) => (c.present ? c.tier : '#')).join(' ')).join('/');

describe('a seed the placement rule refuses', () => {
  const cfg = boardConfig(ladders, 'normal', 1);

  it('is dealt from the seed after it, and the seed after that', () => {
    expect(tiers(dealGrid(cfg, 7))).not.toBe(tiers(dealGrid(cfg, 8)));
    expect(tiers(dealGrid(cfg, 7, refusing(1)))).toBe(tiers(dealGrid(cfg, 8)));
    expect(tiers(dealGrid(cfg, 7, refusing(4)))).toBe(tiers(dealGrid(cfg, 11)));
  });

  it('is let through once five seeds in a row refuse', () => {
    expect(() => dealGrid(cfg, 7, refusing(5))).toThrow('refused');
  });

  it('deals the same board as a seed that is not refused, and the game keeps its seed', () => {
    const game = Game.create(cfg, 7);
    expect(game.seed).toBe(7);
    expect(tiers(game.grid)).toBe(tiers(dealGrid(cfg, 7)));
    expect(tiers(game.grid)).toBe(tiers(generateGrid(cfg, mulberry32(7))));
  });
});
