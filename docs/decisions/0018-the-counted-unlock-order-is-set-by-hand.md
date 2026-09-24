# 0018. The counted unlock order is set by hand, in steps of five from 15 to 80

2026-09-21. Status: adopted.

## Context
The variant ladders do not teach each other, so chaining them made a player grind shapes they had no
interest in; counting boards cleared anywhere lets them arrive from any direction. They opened
easiest-first at first.

## Decision
WRAPAROUND 15, CROSS 20, HIVE 25, DIAMOND 30, PAIRS 35, DOMINOES 40, WORKOUT 45, PACKS 50, DONUT
55, CHECKERBOARD 60, CONGO LINE 65, RAGGED CAVE 70, DUNGEON 75, SUDOKU 80, by request, and it does
not follow difficulty (DUNGEON, second easiest, is last before SUDOKU). Every cleared board counts
once, scaling boards included. WRAPPED CROSS is gated on its two parents; BLIND on three Full Runs
on different types.

## Consequences
Do not "fix" the order back to the ranking. The last three gates need a variant played first, which
is safe because every counted ladder opened is ten more tuned boards; `test/unlocks.test.ts` fails
if any gate is unreachable on tuned boards alone.
