/**
 * The shape registry, as executable specifications: every shape the ladder data names has an
 * entry filed under its own id, and every shape's build keeps its contract on the tuned boards:
 * exactly the cells it counts, and nowhere for a creature that is not a cell.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { mulberry32 } from '../src/engine/rng.js';
import { SHAPES, isShape, shapeRule } from '../src/engine/shape/registry.js';
import { ladders, SEEDS } from './helpers.js';

describe('the shape registry', () => {
  it('has a shape for every name the ladder data uses', () => {
    for (const type of ladders) {
      const name = type.shape ?? 'rect';
      expect(isShape(name), `${type.id}: "${name}"`).toBe(true);
    }
  });

  it('files every shape under its own id', () => {
    for (const [key, shape] of Object.entries(SHAPES)) expect(shape.id).toBe(key);
  });

  it('refuses a name it does not have', () => {
    expect(isShape('toString')).toBe(false);
    const type = structuredClone(ladders[0]!);
    type.shape = 'moon';
    expect(() => boardConfig([type], type.id, 1)).toThrow(
      /unknown shape "moon" \(rect \| donut \| cross \| diamond \| pyramid \| gear \| card \| cave \| dungeon\)/,
    );
  });

  it('refuses a seeded shape on hex or on a wrapped board', () => {
    const cave = structuredClone(ladders.find((t) => t.shape === 'cave')!);
    expect(() => boardConfig([{ ...cave, topology: 'hex' }], cave.id, 1)).toThrow(/not hex/);
    expect(() => boardConfig([{ ...cave, wrap: 'both' }], cave.id, 1)).toThrow(/wrapping/);
  });
});

describe('every shape’s build', () => {
  it('leaves exactly the cells it counts, and deals only onto cells that exist', () => {
    const failures: string[] = [];
    for (const type of ladders) {
      for (const row of type.boards) {
        const cfg = boardConfig(ladders, type.id, row.n);
        const shape = shapeRule(cfg.shape);
        const want = shape.cellCount(cfg.shapeParam, cfg.width, cfg.height);
        for (const seed of SEEDS) {
          const { present, spawnable } = shape.build(
            cfg.shapeParam,
            cfg.width,
            cfg.height,
            mulberry32(seed),
          );
          const where = `${type.id}#${row.n} seed ${seed}`;
          const cells = present.flat().filter(Boolean).length;
          if (cells !== want) failures.push(`${where}: ${cells} cells, counted ${want}`);
          if (spawnable.some((line, y) => line.some((s, x) => s && !present[y]![x]))) {
            failures.push(`${where}: a spawnable cell does not exist`);
          }
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
