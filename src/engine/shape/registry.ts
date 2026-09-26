/**
 * Every board shape, by the name the ladder data uses. `BoardShape` is this record's keys, so a
 * shape is added by adding its line here and a name without a shape cannot exist;
 * `test/shape.test.ts` checks every name in `ladders.json` is here.
 */

import type { ShapeRule } from './rule.js';
import {
  CARD_SHAPE,
  CROSS_SHAPE,
  DIAMOND_SHAPE,
  DONUT_SHAPE,
  GEAR_SHAPE,
  HEART_SHAPE,
  HEXAGON_SHAPE,
  PYRAMID_SHAPE,
  RECT_SHAPE,
  STAR_SHAPE,
} from './fixed.js';
import { CAVE_SHAPE } from './cave.js';
import { DUNGEON_SHAPE } from './dungeon.js';

export const SHAPES = {
  rect: RECT_SHAPE,
  donut: DONUT_SHAPE,
  cross: CROSS_SHAPE,
  diamond: DIAMOND_SHAPE,
  pyramid: PYRAMID_SHAPE,
  gear: GEAR_SHAPE,
  card: CARD_SHAPE,
  heart: HEART_SHAPE,
  star: STAR_SHAPE,
  hexagon: HEXAGON_SHAPE,
  cave: CAVE_SHAPE,
  dungeon: DUNGEON_SHAPE,
} as const satisfies Readonly<Record<string, ShapeRule>>;

/** Which cells of the bounding box exist: a key of `SHAPES` (see `docs/modes.md`). */
export type BoardShape = keyof typeof SHAPES;

/** The shape a board is cut by. */
export function shapeRule(shape: BoardShape): ShapeRule {
  return SHAPES[shape];
}

/** Is this ladder-data name a shape the engine has? */
export function isShape(name: string): name is BoardShape {
  return Object.hasOwn(SHAPES, name);
}
