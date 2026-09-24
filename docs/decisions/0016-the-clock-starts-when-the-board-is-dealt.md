# 0016. The clock starts when the board is dealt, not on the first move

2026-09-21. Status: adopted.

## Context
Keyed off the first player action, the clock stood still through the work the dealt opening had
just set up, so every time was missing however long the player spent reading the board.

## Decision
`startedAt` is set the moment `Game.create` returns, on every ladder including the two whose
opening reveals nothing. `Game.started` no longer drives it (and was later removed, 0001).

## Consequences
"The clock starts when the board appears" is one rule; "except there" would be two. Time Attack
races the player's own best only, and reports expiry through `game.forfeit` because the engine owns
no clock.
