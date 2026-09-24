/**
 * The placement registry, as executable specifications: every rule the ladder data names has an
 * entry, and every entry answers for the name it is filed under.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { RULES, isPlacement } from '../src/engine/placement/registry.js';
import { ladders } from './helpers.js';

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

  it('is what the config reads', () => {
    for (const type of ladders) {
      const cfg = boardConfig(ladders, type.id, 1);
      expect(cfg.opening, type.id).toBe(RULES[cfg.placement].opening);
    }
  });

  it('refuses a name it does not have', () => {
    expect(isPlacement('toString')).toBe(false);
    const type = structuredClone(ladders[0]!);
    type.placement = 'triads';
    expect(() => boardConfig([type], type.id, 1)).toThrow(
      /unknown placement "triads" \(uniform \| sudoku \| checker \| pairs \| dominoes \| packs \| congo\)/,
    );
  });
});
