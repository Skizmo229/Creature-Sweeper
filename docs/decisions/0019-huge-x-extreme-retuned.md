# 0019. HUGE x EXTREME holds lock 7 on boards 7 to 10 and steps density back to pay for it

2026-09-21. Status: adopted.

## Context
Board 10 was unwinnable: at lock 8, density had to fall to 26% (below board 1's) to reach even 30%
for a perfect player. The ladder is deep everywhere, so the lock alone cannot rescue it.

## Decision
`lock 5 5 5 6 6 6 7 7 7 7`, density stepping back at board 7 (`.278 .279 .280 .281`). The blurb
says "every level-up past the first". EXTREME and ORACLE were left as they are, pending the lock
decision in `docs/tuning.md`.

## Consequences
Perfect player 75 to 60% on boards 5 to 10 (was 70 to 0), honest player 10% on board 10. The
continuation now runs 24 boards past 10 and its lock climbs back to 8 by board 13, so the scaling
boards are the unwinnable kind again: optional content as hard as it can be.
