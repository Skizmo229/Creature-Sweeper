# 0018. The counted unlock order is set by hand, in steps of five from 15 to 80

2026-09-21. Status: schedule superseded by 0036 (25 September 2026); counting boards stands.

## Context
The variant ladders do not teach each other, so chaining them made a player grind shapes they had no
interest in; counting boards cleared anywhere lets them arrive from any direction. They opened
easiest-first at first, and DOMINOES and PACKS were gated on clearing PAIRS until they joined the
count.

The easiest-first order was the honest player's, measured on 21 September 2026 with
`npm run sim:spells`: spell-less, so every ladder met the same player, 30 seeds a board, the mean
clear rate over the tuned ten. The shaped ladders carry spells in play, which only makes them
gentler than this; HIVE and PAIRS are within the noise of each other; SUDOKU cannot be measured on
this scale, being guess-free by construction.

    WRAPAROUND 99.0   DUNGEON 97.7      CHECKERBOARD 97.4   DIAMOND 95.5
    CROSS 94.0        CONGA LINE 92.8   HIVE 92.7           PAIRS 92.1
    RAGGED CAVE 89.0  DONUT 84.9

## Decision
WRAPAROUND 15, CROSS 20, HIVE 25, DIAMOND 30, PAIRS 35, DOMINOES 40, WORKOUT 45, PACKS 50, DONUT
55, CHECKERBOARD 60, CONGA LINE 65, RAGGED CAVE 70, DUNGEON 75, SUDOKU 80, by request, and it does
not follow difficulty (DUNGEON, second easiest, is last before SUDOKU). Every cleared board counts
once, scaling boards included. WRAPPED CROSS is gated on its two parents; BLIND on three Full Runs
on different types.

## Consequences
Do not "fix" the order back to the ranking. The last three gates need a variant played first, which
is safe because every counted ladder opened is ten more tuned boards; `test/unlocks.test.ts` fails
if any gate is unreachable on tuned boards alone.
