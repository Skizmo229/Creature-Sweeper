# 0066. Unlock everything ships with the game

2026-09-28. Status: adopted.

## Context
The list of game types has carried an "Unlock everything" box since the prototype, and the save
still called it a "prototype escape hatch". Ticked, it skips every gate: ladders, boards, Full
Runs and the continuation past board 10. The release audit of 28 September 2026 asked whether a
public release should keep it, hide it in development builds, or remove it. The owner likes it
and keeps it.

## Decision
The box ships as it is, on the list of game types. While it is ticked every ladder, board, Full
Run and scaling board is open; clears, best times and the boards-cleared count are recorded
exactly as without it.

## Consequences
The progression mode is the default, not a requirement: a player who wants one ladder can go
straight to it. Unticking the box gives back the chain the player's own clears have earned,
because every gate is worked out from the record when it is asked (`Progress.isTypeUnlocked` and
its siblings) rather than stored; `test/unlocks.test.ts` holds both halves. A board reached
through the box is the same board as one reached by the chain, so its record means what any other
does.
