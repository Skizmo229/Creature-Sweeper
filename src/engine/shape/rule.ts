/**
 * The contract every board shape meets.
 *
 * A shape decides which cells of the bounding box exist and which of those a creature may stand
 * on. Removing cells removes neighbours, which makes every shape easier than a rectangle
 * (docs/invariants.md, fact 4). Each shape is a record here, `registry.ts` lists them, and a reader
 * asks the shape rather than comparing its name (decision 0030).
 */

import type { BoardShape } from '../types.js';
import type { Rng } from '../rng.js';
import { type Mask, blankMask, countPresent } from '../grid.js';

/** A ladder type as a shape's config check sees it, spelled as the ladder data spells it. */
export interface ShapeType {
  readonly typeId: string;
  readonly topology: string | undefined;
  readonly wrap: string | undefined;
}

export interface ShapeRule {
  readonly id: BoardShape;
  /**
   * Grown from the seed to an exact cell count rather than cut by a per-cell predicate. The
   * parameter of a seeded shape is that count, the row's `cells`, because C_k needs the quota fixed
   * before the board exists; every other shape's parameter is the type's `shape_param`, in cells.
   */
  readonly seeded: boolean;
  /** Refuse a ladder type this shape cannot live on, throwing a message that names the type. */
  validate(type: ShapeType): void;
  /** How many cells the shape leaves in a `w` x `h` box. `ladders.py` must agree. */
  cellCount(param: number, w: number, h: number): number;
  /**
   * Which cells exist, and which of those a creature may be dealt into. The two are the same mask
   * on every shape but the dungeon, whose hallways and doorways are ground a creature never
   * stands on.
   */
  build(param: number, w: number, h: number, rng: Rng): { present: Mask; spawnable: Mask };
}

/**
 * A shape that is a per-cell predicate of the bounding box: no seed, and the same silhouette on
 * every board of that size.
 */
export function predicateShape(
  id: BoardShape,
  present: (param: number, w: number, h: number, x: number, y: number) => boolean,
): ShapeRule {
  const maskOf = (param: number, w: number, h: number): Mask => {
    const mask = blankMask(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) mask[y]![x] = present(param, w, h, x, y);
    return mask;
  };
  return {
    id,
    seeded: false,
    validate: () => {},
    cellCount: (param, w, h) => countPresent(maskOf(param, w, h), w, h),
    build: (param, w, h) => {
      const mask = maskOf(param, w, h);
      return { present: mask, spawnable: mask };
    },
  };
}

/**
 * A seeded mask carries two constraints the predicate shapes do not. It is laid out and checked
 * with square adjacency, so on a hex board its "connected" region could be in pieces under the
 * six-way rule; and it always leaves a margin of absent cells around the bounding box, so joining
 * those edges would join two holes. Both would be silent, so both are refused.
 */
export function refuseHexAndWrap(id: BoardShape): (type: ShapeType) => void {
  return (type) => {
    if (type.topology === 'hex') {
      throw new Error(`${type.typeId}: ${id} is carved with eight-way adjacency, not hex`);
    }
    if (type.wrap && type.wrap !== 'none') {
      throw new Error(`${type.typeId}: ${id} leaves an absent margin, so wrapping joins nothing`);
    }
  };
}
