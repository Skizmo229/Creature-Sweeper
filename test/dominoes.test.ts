/**
 * The domino placement, as executable specifications.
 *
 * The first test is the one that matters. A flat quantity is necessary for a
 * domino set and nowhere near sufficient — a dealer that put the [3|5] tile
 * down twice and left out the [2|6] would produce exactly the same tier counts
 * and be the wrong mode. So the set is checked as a set of TILES, read back off
 * the finished board the way a player would read it.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType, type LadderType } from '../src/engine/config.js';
import {
  dealTiles,
  dominoCreatures,
  dominoFault,
  dominoQuantity,
  dominoSet,
  setsIn,
  type Tile,
} from '../src/engine/dominoes.js';
import { isPaired } from '../src/engine/pairs.js';
import { mulberry32 } from '../src/engine/rng.js';
import { Game } from '../src/engine/game.js';
import { autoplayTierOrder } from '../src/sim/autoplay.js';
import { ladders, PLACEMENT_SEEDS as SEEDS, UNGATED_SWEEP } from './helpers.js';

const dominoes = findType(ladders, 'dominoes');

const allRows = (type: LadderType) => [...type.boards, ...type.extended];

/**
 * The tiles on a finished board, read off it: every creature and the one
 * creature beside it, each pair counted once.
 */
function tilesOn(game: Game): Tile[] {
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (const cell of game.grid.flat()) {
    if (!cell.present || cell.tier === 0) continue;
    const partner = game.neighboursOf(cell).find((n) => n.tier > 0)!;
    const key = [cell, partner]
      .map((c) => `${c.x},${c.y}`)
      .sort()
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([cell.tier, partner.tier]);
  }
  return out;
}

describe('a full domino set', () => {
  it('holds every pairing exactly once per set, and nothing else', () => {
    expect(dominoFault(dominoSet(6), 6, 1)).toBeNull();
    // Double-six: the classic 28 tiles, less the seven that carry a blank.
    expect(dominoSet(6)).toHaveLength(21);
    expect(dominoSet(8, 3)).toHaveLength(36 * 3);
  });

  it('carries every tier exactly T+1 times — flat by construction', () => {
    for (const T of [4, 5, 6, 7, 8]) {
      for (const sets of [1, 2, 6]) {
        const counts = new Map<number, number>();
        for (const [a, b] of dominoSet(T, sets)) {
          counts.set(a, (counts.get(a) ?? 0) + 1);
          counts.set(b, (counts.get(b) ?? 0) + 1);
        }
        for (let t = 1; t <= T; t++) expect(counts.get(t)).toBe((T + 1) * sets);
        expect(dominoQuantity(T, sets)).toEqual(new Array(T).fill((T + 1) * sets));
        expect(dominoCreatures(T, sets)).toBe(T * (T + 1) * sets);
      }
    }
  });

  it('has no blanks — a tile with a 0 end would have no creature there', () => {
    for (const [a, b] of dominoSet(8, 2)) {
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(1);
    }
  });

  it('recovers the set count from a quantity, and refuses one that is not a set', () => {
    expect(setsIn(6, dominoQuantity(6, 3))).toBe(3);
    expect(setsIn(6, [7, 7, 7, 7, 7, 8])).toBeNull(); // not flat
    expect(setsIn(6, [6, 6, 6, 6, 6, 6])).toBeNull(); // flat, but not a multiple of 7
    expect(setsIn(6, [7, 7, 7])).toBeNull(); // wrong length
  });
});

describe('the dealer', () => {
  it('puts both ends of a tile on the two halves of one domino', () => {
    // `choosePairs` returns partner-adjacent cells; the deal has to respect it.
    const pairs = [...Array(dominoCreatures(5)).keys()];
    const dealt = dealTiles(pairs, 5, 1, mulberry32(7));
    const tiles: Tile[] = [];
    for (let i = 0; i < pairs.length; i += 2) tiles.push([dealt.get(i)!, dealt.get(i + 1)!]);
    expect(dominoFault(tiles, 5, 1)).toBeNull();
  });

  it('refuses a pair list that is not the set’s size', () => {
    expect(() => dealTiles([0, 1, 2, 3], 5, 1, mulberry32(1))).toThrow(/tiles want/);
  });
});

describe('the ladder', () => {
  it('asks for a whole number of sets on every board, continuation included', () => {
    for (const row of allRows(dominoes)) {
      expect(setsIn(row.tiers, row.quantity), `DOMINOES#${row.n}`).not.toBeNull();
    }
  });

  it('stays inside the packing ceiling it inherits from PAIRS', () => {
    for (const row of allRows(dominoes)) {
      expect(row.monsters / row.cells, `DOMINOES#${row.n}`).toBeLessThanOrEqual(0.26);
    }
  });

  it('deals exactly six tiers on every board, continuation included', () => {
    // A double-six set on every board is the ladder's identity, not a starting
    // point it grows out of: the difficulty comes from copies of the set and
    // from density, never from adding tiers. A schedule edit that brought a
    // tier ramp back would still generate and still be tuned correctly, and
    // would quietly be a different mode.
    for (const row of allRows(dominoes)) {
      expect(row.tiers, `DOMINOES#${row.n}`).toBe(6);
      expect(row.quantity, `DOMINOES#${row.n}`).toHaveLength(6);
    }
  });

  it('never lets the tier count fall', () => {
    // A board with fewer tiers than the one before would carry a smaller C_k,
    // and the previous board's thresholds would have nothing to be met with.
    const rows = allRows(dominoes);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.tiers).toBeGreaterThanOrEqual(rows[i - 1]!.tiers);
    }
  });
});

describe('the board', () => {
  it('deals the full set on every board and every seed — read back off the grid', () => {
    for (const row of allRows(dominoes)) {
      const cfg = boardConfig(ladders, 'dominoes', row.n);
      const sets = setsIn(cfg.tiers, cfg.quantity)!;
      for (const seed of SEEDS) {
        const fault = dominoFault(tilesOn(Game.create(cfg, seed)), cfg.tiers, sets);
        expect(fault, `DOMINOES#${row.n} seed ${seed}`).toBeNull();
      }
    }
  });

  it('keeps the pairing rule: every creature has exactly one creature beside it', () => {
    for (const row of allRows(dominoes)) {
      const cfg = boardConfig(ladders, 'dominoes', row.n);
      for (const seed of SEEDS) {
        const game = Game.create(cfg, seed);
        for (const cell of game.grid.flat()) {
          if (cell.tier === 0) continue;
          const mates = game.neighboursOf(cell).filter((n) => n.tier > 0);
          expect(mates, `DOMINOES#${row.n} seed ${seed}`).toHaveLength(1);
        }
      }
    }
  });

  it('gives a creature its partner’s tier as its number', () => {
    // The number IS the partner's tier. It used to start flipped on every
    // pairing board, so a kill showed the fact and a click uncovered the art;
    // that preset is gone, by request, and so is showing it on hover — a lone
    // digit over a creature read as its own level. The engine still holds it,
    // and Sweep's partner proof and the pencil's candidates still read it.
    const game = Game.create(boardConfig(ladders, 'dominoes', 5), SEEDS[0]!);
    for (const cell of game.grid.flat()) {
      if (cell.tier === 0) continue;
      expect(cell.num).toBe(game.neighboursOf(cell).find((n) => n.tier > 0)!.tier);
    }
  });
});

describe('it inherits every pairing proof', () => {
  it('counts as a paired board, so Sweep and the renderer both know the rule', () => {
    // Every reader of the pairing rule asks `isPaired`. A domino board that
    // answered no would lose both Sweep proofs and the bonds, silently.
    expect(isPaired('dominoes')).toBe(true);
    expect(isPaired('uniform')).toBe(false);
  });

  it('never costs HP to sweep, and never carries a board on its own', () => {
    for (const row of dominoes.boards) {
      for (const seed of SEEDS) {
        const game = Game.create(boardConfig(ladders, 'dominoes', row.n), seed, UNGATED_SWEEP);
        for (let i = 0; i < 30; i++) game.sweep({ useMarks: false });
        expect(game.hp, `DOMINOES#${row.n} seed ${seed}`).toBe(game.maxHp);
        expect(game.status).toBe('playing');
      }
    }
  });

  it('clears every board without taking a point of damage', () => {
    // A flat curve is a harsh curve, but the zero-damage guarantee is a
    // statement about C_k, and C_k is a sum over a quantity this rule fixes.
    for (const row of dominoes.boards) {
      for (const seed of SEEDS) {
        const game = Game.create(boardConfig(ladders, 'dominoes', row.n), seed, UNGATED_SWEEP);
        expect(autoplayTierOrder(game).cleared, `DOMINOES#${row.n} seed ${seed}`).toBe(true);
        expect(game.hp).toBe(game.maxHp);
      }
    }
  });
});

describe('the boundary', () => {
  const bend = (quantity: number[]): LadderType => ({
    ...dominoes,
    id: 'bent',
    extended: [],
    boards: [{ ...dominoes.boards[0]!, quantity, tiers: quantity.length }],
  });

  it('refuses a quantity that is flat but not a set', () => {
    expect(() => boardConfig([bend([4, 4, 4, 4])], 'bent', 1)).toThrow(/domino sets/);
  });

  it('refuses a quantity that is a set in total but not in shape', () => {
    expect(() => boardConfig([bend([4, 5, 5, 6])], 'bent', 1)).toThrow(/domino sets/);
  });
});
