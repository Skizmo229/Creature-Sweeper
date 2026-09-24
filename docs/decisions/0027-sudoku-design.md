# 0027. SUDOKU uses digits 0 to 8, generates guess-free, and keeps its rule out of Sweep

2026-09-21. Status: adopted.

## Context
Digits 1 to 9 at 100% density make every pre-revealed cell a pre-killed one, handing the player
level 8 before the first click. A tier 8 at LV1 costs 56 HP against 14 to 20, so a 50/50 is not
hard, it is broken. Wiring the generator's propagator into `safeCells` made Sweep clear every board
in one click; it shipped that way briefly.

## Decision
Tier 0 is a digit, so the nine empty cells are the opening. Boards are generate-and-test against
`clearableWithoutGuessing` and the generator throws below its floor. The ladder is the givens count
alone. Sweep harvests givens (strict) and marks (assisted), and the Sudoku rule is absent from
`safeCells`; pencil notes never regenerate.

## Consequences
Both Sweep buttons are dead on a fresh board, correctly. The board draws a box wash and a heavy box
rule about twice a cell edge, or the boxes are invisible. Fewer givens make boards rarer and their
chains tighter rather than demanding harder techniques; revisit that first if the ladder reads flat.
