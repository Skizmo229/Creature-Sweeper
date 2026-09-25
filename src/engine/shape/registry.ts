/**
 * Every board shape, by the name the ladder data uses. Keyed by the whole `BoardShape` union, so
 * a name without a shape is a compile error; `test/shape.test.ts` checks every name in
 * `ladders.json` is here.
 */

import type { BoardShape } from '../types.js';
import type { ShapeRule } from './rule.js';
import { CROSS_SHAPE, DIAMOND_SHAPE, DONUT_SHAPE, RECT_SHAPE } from './fixed.js';
import { CAVE_SHAPE } from './cave.js';
import { DUNGEON_SHAPE } from './dungeon.js';

export const SHAPES: Readonly<Record<BoardShape, ShapeRule>> = {
  rect: RECT_SHAPE,
  donut: DONUT_SHAPE,
  cross: CROSS_SHAPE,
  diamond: DIAMOND_SHAPE,
  cave: CAVE_SHAPE,
  dungeon: DUNGEON_SHAPE,
};

/** The shape a board is cut by. */
export function shapeRule(shape: BoardShape): ShapeRule {
  return SHAPES[shape];
}

/** Is this ladder-data name a shape the engine has? */
export function isShape(name: string): name is BoardShape {
  return Object.hasOwn(SHAPES, name);
}
