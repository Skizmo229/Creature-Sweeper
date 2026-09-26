# 0045. DONUT is round, a six-cell ring six points denser

2026-09-26. Status: adopted.

## Context
The owner asked for DONUT to look like a donut: a round outline and a round hole in place of a
rectangular frame round a rectangular hole. A circle fills only a square box, so the wide boxes
(30 by 16 to 40 by 21) had to go. The owner first chose a seven-cell ring from drawings, for its
proportions, holding the cell count near the old 360 to 510 in boxes 23 to 30 square.

Measured with the graded player at grade 2, 40 seeds a board, spell-less, the round ring plays much
easier than the square one at the same densities, and a thicker ring is easier still:

| ring | box | density | grade 2 clear, ladder | board 10 |
| --- | --- | --- | ---: | ---: |
| square, 5 cells (before) | 30x16 to 40x21 | 23.0 to 30.2% | 95% | 80% |
| round, 7 cells | 23 to 30 | 23.0 to 30.2% | 100% | 100% |
| round, 7 cells | 23 to 30 | 30.0 to 37.2% | 98% | 98% |
| round, 5 cells | 28 to 37 | 23.0 to 30.2% | 98% | 93% |
| round, 5 cells | 28 to 37 | 25.0 to 32.2% | 95% | 80% |
| round, 6 cells | 28 to 37 | 25.0 to 32.2% | 99% | 93% |
| round, 6 cells | 28 to 37 | 27.0 to 34.2% | 97% | 88% |
| round, 6 cells | 28 to 37 | 28.0 to 35.2% | 96% | 93% |
| round, 6 cells | 28 to 37 | 29.0 to 36.2% | 94% | 80% |

No density at or under the 34% ceiling brings a seven-cell ring back, so the owner took the
five-cell ring, then asked for the hole a little smaller and the ring thicker: six cells in the
same boxes, which six points of density bring back to the square ring's figures.

## Decision
`DONUT_SHAPE` is the circle's disc less a hole `param` cells narrower in radius. DONUT has
`shape_param = 6`, runs in boxes 28 to 37 square (408 to 596 cells), six density points above its
old schedule (29.0 to 36.2%, past the 34% ceiling from board 8, as PETRI DISH is), and caps its
continuation at 45 by 45, as GEAR and PETRI DISH do.

## Consequences
The graded player's DONUT row holds: 94% over the ladder and 80% of board 10 at grades 2 and 4, 2.2
stuck points a board against 1.9. The honest player disagrees, and more than it did for the
five-cell ring: 60 seeds, it clears 68% over the ladder and 47% of board 10 (7.0 forced guesses
there, as the spells test has it), against 83%, 65% and 7.6 before; its guesses on the dense top
boards cost more HP. One point less density leaves it at 73% and 53% while the graded player goes
to 96% and 93%, so no schedule satisfies both, and the graded player is the instrument the human
targets are set in (docs/human-tuning-plan.md). The continuation stops at board 17 (45 by 45, 736
cells) where the wide boxes ran to board 32; the 2,048-cell cap allows no larger square. Golden
output `boards` re-recorded. A retune toward the shapes' human target (plan section 7) starts
from here.
