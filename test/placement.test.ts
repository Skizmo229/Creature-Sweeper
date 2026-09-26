/**
 * The placement registry, as executable specifications: every rule the ladder data names has an
 * entry, every entry answers for the name it is filed under, and every rule's deal keeps its
 * contract on every board of every ladder: exactly the quota, and nothing its fault finder can find.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig, findType } from '../src/engine/config.js';
import { generateGrid } from '../src/engine/generate.js';
import { RULES, isPlacement, placementRule } from '../src/engine/placement/registry.js';
import { mulberry32 } from '../src/engine/rng.js';
import { ladders, PLACEMENT_SEEDS } from './helpers.js';

/** Every board a ladder offers, the continuation included. */
const allBoards = (typeId: string) => {
  const type = findType(ladders, typeId);
  return [...type.boards, ...type.extended].map((row) => boardConfig(ladders, typeId, row.n));
};

describe('the placement registry', () => {
  it('has a rule for every placement the ladder data names', () => {
    for (const type of ladders) {
      const name = type.placement ?? 'uniform';
      expect(isPlacement(name), `${type.id}: "${name}"`).toBe(true);
    }
  });

  it('files every rule under its own id', () => {
    for (const [key, rule] of Object.entries(RULES)) expect(rule.id).toBe(key);
  });

  it('is what the config reads, where the ladder names no opening of its own', () => {
    for (const type of ladders) {
      const cfg = boardConfig(ladders, type.id, 1);
      expect(cfg.opening, type.id).toBe(type.opening ?? RULES[cfg.placement].opening);
    }
  });

  it('refuses a name it does not have', () => {
    expect(isPlacement('toString')).toBe(false);
    const type = structuredClone(ladders[0]!);
    type.placement = 'triads';
    expect(() => boardConfig([type], type.id, 1)).toThrow(
      /unknown placement "triads" \(uniform \| sudoku \| checker \| pairs \| dominoes \| packs \| congo \| patrol\)/,
    );
  });
});

describe('every rule’s deal', () => {
  it('places exactly the quota, and nothing its fault finder can find, on every board', () => {
    // C_k is a sum over `quantity`, so a board that came up two creatures light would carry a top
    // gate one kill out of reach, and would not throw.
    const failures: string[] = [];
    for (const type of ladders) {
      for (const cfg of allBoards(type.id)) {
        const rule = placementRule(cfg.placement);
        for (const seed of PLACEMENT_SEEDS) {
          const grid = generateGrid(cfg, mulberry32(seed));
          const where = `${cfg.typeId}#${cfg.board} seed ${seed}`;
          const counts = new Array<number>(cfg.tiers).fill(0);
          for (const cell of grid.flat())
            if (cell.present && cell.tier > 0) counts[cell.tier - 1]!++;
          if (counts.join() !== cfg.quantity.join()) {
            failures.push(`${where}: dealt [${counts}] for [${cfg.quantity}]`);
          }
          const fault = rule.fault(grid, cfg);
          if (fault !== null) failures.push(`${where}: ${fault}`);
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('has a fault finder that catches the same creatures scattered', () => {
    // So the test above cannot pass on a finder that never finds anything.
    for (const type of ladders) {
      const cfg = boardConfig(ladders, type.id, 1);
      if (cfg.placement === 'uniform') continue;
      const scatter = { ...cfg, placement: 'uniform' as const };
      const caught = PLACEMENT_SEEDS.some((seed) =>
        placementRule(cfg.placement).fault(generateGrid(scatter, mulberry32(seed)), cfg),
      );
      expect(caught, type.id).toBe(true);
    }
  });
});
