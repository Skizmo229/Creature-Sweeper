# 0030. Board shapes are records in a registry, like placement rules

2026-09-24. Status: adopted.

## Context
The refactoring plan made a shape registry conditional on the placement registry (0029) proving
its worth; the owner chose to go ahead once it merged. Shape was dispatched by a `switch` in
`isPresent`, a name check for the two seeded shapes in `presentCellCount` and `buildShape`, a
`CARVED` list in `config.ts` (hex and wrap refusals, and which parameter a shape reads), and a
rectangle short-cut in `generateGrid`. A new seeded shape missed from `CARVED` would have read the
type's `shape_param` instead of the row's cell count and been mistuned, silently.

## Decision
Every shape is a `ShapeRule` record (`src/engine/shape/rule.ts`): `seeded`, `validate`,
`cellCount`, `build`. `SHAPES` in `registry.ts` is keyed by the whole `BoardShape` union. The four
per-cell predicates share `predicateShape` in `fixed.ts`; the cave and the dungeon keep their
modules and end them with their records. `generateGrid` cuts every board, the rectangle included,
through its shape.

## Consequences
A shape name without a record is a compile error, and `test/shape.test.ts` holds every shape's
build to its own count. `ladders.py` still carries its own copy of the predicates (phase 6); the
test that the engine's count matches the ladder's still guards the two copies. The two placement
rules that need a rectangle (checkerboard, Sudoku) still compare the type's shape to `'rect'`,
which is the default rather than a classification.
