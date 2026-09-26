# 0036. Each step of five opens one ladder per menu category

2026-09-25. Status: adopted. Replaces the schedule in 0018; its reasons for counting boards stand.

## Context
The counted schedule opened one variant every five boards from 15 to 80, one long queue, and the
menu was one flat list. The owner asked for the menu to be grouped into four categories (Normal,
the original game's modes; Shape; Magic; Special) and for each step to open one ladder of each
category that has one left, so a player chooses what kind of thing to play next.

## Decision
`CATEGORIES` in `design/ladders.py` files every ladder and orders each column; the schedule is
derived from it. From 15 boards, every five opens the next counted ladder in each column:

    15  HUGE        WRAPAROUND     ARCANE    HIVE
    20  EXTREME     WRAPPED CROSS  WORKOUT   PAIRS
    25              CROSS          ORACLE    DOMINOES
    30              DIAMOND        DUNGEON   PACKS
    35              DONUT                    CHECKERBOARD
    40              RAGGED CAVE              CONGA LINE
    45                                       SUDOKU
    50  BLIND

By request: HUGE and EXTREME leave the chain off NORMAL; ARCANE and ORACLE leave their chain;
WRAPPED CROSS drops its two parents and opens before CROSS; DUNGEON is Magic and HIVE Special;
BLIND trades three Full Runs for a board count, one step past the rest. Only EASY -> NORMAL and
the two combined Normal ladders (HUGE x EXTREME, HUGE x BLIND) keep type gates. The Full Run gate
had no other user and was removed with it.

## Consequences
HUGE can open before NORMAL is cleared, and WRAPPED CROSS before either ladder it combines; both
were accepted. The type gates alone offer 20 boards, past the first step, and every step opens at
least ten boards for the five it asks, so no save can be stranded; `test/unlocks.test.ts` walks it.
A new ladder is a place in a column, and moves every ladder after it in that column by a step.
