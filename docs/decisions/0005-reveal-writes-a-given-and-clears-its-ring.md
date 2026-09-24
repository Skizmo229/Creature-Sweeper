# 0005. Reveal writes a given, and clears the empty ground around its target

2026-09-21. Status: adopted.

## Context
Reveal's answer used to be a player mark, erasable by a stray right-click and not bought back.
The ring was asked for as a buff.

## Decision
Reveal marks the target with `given: true`, the same flag a Sudoku clue carries: gold, unerasable,
a fact. It also opens the empty cells touching the target. Those cells pay no exploration mana.

## Consequences
The ring is 45% of the spell (0.65 to 0.94 HP saved a cast) and gives nothing away, since empty
ground was always free to open. It cannot cascade off a creature, because every neighbour of a
tier-N cell carries at least N. A given does NOT strengthen strict Sweep: the proof consults `given`
only on the Sudoku path. On DUNGEON the ring pushes the frontier, which is why Reveal is how you get
into the next room. Reveal now buys twice what Exercise does per mana; pricing it at 100 would
level them, left alone deliberately.
