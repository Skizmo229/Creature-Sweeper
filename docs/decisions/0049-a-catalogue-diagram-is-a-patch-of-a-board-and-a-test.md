# 0049. A catalogue diagram is a patch of a board, and a test

2026-09-27. Status: adopted.

## Context
Milestone 5 turns the catalogue's diagrams (`docs/strategies.md`) into tests and into the field
guide's pictures, both built with `Game.fromLayout` (docs/teaching-plan.md, section 5.2). Built
as whole boards, six of the seven were refused: they drew `.`, an open cell showing 0, beside a
creature or beside a covered cell, which the numbers or a cascade forbid. Redrawn truthfully as
whole boards, most still could not say what their text said. On a drawn board every threshold is
`C_k`, so the level is at least the weakest tier alive: a 3x3 with only a tier 2 on it is a level-2
board, a beaten 3 at level 2 needs more than 4 EXP of weak creatures somewhere, and nothing is
ever above the level unless something weaker is alive too. A search for whole boards that met
each diagram's claim found them only with numbers like 18 and 22 around the point being made.

## Decision
A diagram is a patch of a five-tier board, and the catalogue's legend says so: nothing beyond the
patch touches its numbers, and the rest of the board holds a creature of every tier and enough
weak ones to be at the level the text gives, unless a counter is shown. `src/sim/diagrams.ts`
builds exactly that: the patch as drawn, a column of holes, and the rest beside it, covered.
Every diagram must still be a board the game could show (its numbers true, no open 0 beside a
covered cell), and `test/strategies.test.ts` holds one press of the tutor on it to the trick the
diagram sits under, at that trick's grade, concluding exactly the cells its table entry says.

## Consequences
Diagrams stay small enough to read and are exact about what they claim. Where the rest of the
board is the point (the last of a tier: every other covered cell is at most a 4), the table says
what the trick concludes there too. The field guide draws the patch alone and lays the lesson from
the whole board over it, cropping anything off the patch. Redrawing to fit found three errors
besides the dots, recorded in the commit that redrew them: the 1-2-1's `1` was taken by the raw
ring at any level, the residual ring's beaten 3 showed on hover a number the raw ring took first,
and the first example under "Suppose, then follow it" was Bounds with gaps from the counters. If
diagrams are ever made whole boards again, expect the level to rise with them.
