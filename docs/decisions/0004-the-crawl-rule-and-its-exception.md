# 0004. The crawl rule has one stated exception rather than a rarer failure

2026-09-21. Status: adopted.

## Context
`reach: 2` limits where the player may open or cast, counted as a walk through `neighbours()`.
Measured over 2,280 boards, five ended with the frontier walled in by creatures above the player's
level, all on the opening move. Reach 3 to 6 each came back clean over the same boards, which was
the tempting fix.

## Decision
Keep reach 2 and state the exception: the dungeon never forces a fight you cannot win for free.
`sealedIn()` lifts the radius when nothing within reach can be opened at your level. It reads
`level` alone, not `level + exerciseCharge`, because the question is whether the board has sealed
you. Marking and pencilling are exempt from reach.

## Consequences
0 of 5,700 boards sealed with the valve. One board in five hundred that quietly cannot be finished
is worse than a stated exception, because the player cannot tell which one they are on. Any future
rule about *where* the player may act has to answer the same question. Everything headless had to
learn to walk (`autoplayTierOrder`, the honest player).
