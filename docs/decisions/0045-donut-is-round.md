# 0045. DONUT is round, a five-cell ring two points denser

2026-09-26. Status: adopted.

## Context
The owner asked for DONUT to look like a donut: a round outline and a round hole in place of a
rectangular frame round a rectangular hole. A circle fills only a square box, so the wide boxes
(30 by 16 to 40 by 21) had to go. The owner first chose a seven-cell ring from drawings, for its
proportions, holding the cell count near the old 360 to 510 in boxes 23 to 30 square.

Measured with the graded player at grade 2, 40 seeds a board, spell-less, the round ring plays much
easier than the square one at the same densities, and a thicker ring is easier still:

| ring | density | grade 2 clear, ladder | board 10 |
| --- | --- | ---: | ---: |
| square, 5 cells (before) | 23.0 to 30.2% | 95% | 80% |
| round, 7 cells | 23.0 to 30.2% | 100% | 100% |
| round, 7 cells | 30.0 to 37.2% | 98% | 98% |
| round, 6 cells | 27.0 to 34.2% | 99% | 95% |
| round, 5 cells | 23.0 to 30.2% | 98% | 93% |
| round, 5 cells | 25.0 to 32.2% | 95% | 80% |

No density at or under the 34% ceiling brings a seven-cell ring back, so the owner chose the
five-cell ring, which keeps today's difficulty for a thinner, bagel-like look.

## Decision
`DONUT_SHAPE` is the circle's disc less a hole `param` cells narrower in radius. DONUT keeps
`shape_param = 5`, runs in boxes 28 to 37 square (360 to 508 cells), two density points above its
old schedule, and caps its continuation at 45 by 45, as GEAR and PETRI DISH do.

## Consequences
The graded player's DONUT row barely moves: 95% over the ladder and 80% of board 10 at grades 2
and 4, 1.8 stuck points a board against 1.9. The honest player, 60 seeds, clears 81% over the
ladder and 58% of board 10 at 7.0 forced guesses there, against 83%, 65% and 7.6 before (the
spells test's board-10 figure moves to 7.0). The continuation stops at board 18 (45 by 45, 624
cells) where the wide boxes ran to board 32; the 2,048-cell cap allows no larger square. Golden
output `boards` re-recorded; `runs` is unchanged. A retune toward the shapes' human target (plan
section 7) starts from here.
