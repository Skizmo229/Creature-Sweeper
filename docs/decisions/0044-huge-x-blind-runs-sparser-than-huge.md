# 0044. HUGE x BLIND runs sparser than HUGE, on the one-mistake ladders' target

2026-09-26. Status: adopted.

## Context
Decision 0043's question on the post-game search ladder. At HUGE's density (20.8 to 27.0%) with
1 HP, level 0 and nine tiers, a grade-4 graded player cleared 28% of board 1, 10% of board 2 and
none from board 3 on. The target is 0043's, still a proposal the owner may move: about three
quarters of board 1 falling to about a third of board 10. The response is steeper at the top than
BLIND's, because the boards grow to 64 by 32: three quarters of the old density clears 83%
falling to 15%, three fifths 98% falling to 73%.

## Decision
`density .160 .164 .168 .171 .175 .179 .183 .186 .190 .194`. Sizes, the nine tiers, the boss
pins (1 rising to 3) and HP are unchanged.

## Consequences
Grade-4 clear rates of 78, 75, 83, 83, 73, 63, 57, 48, 40 and 33% on boards 1 to 10 at 40 seeds,
forced guesses 0.5 rising to 1.4 a board, every one lethal. The continuation past board 10 climbs
at the ramp's own step toward the 30% search cap, as BLIND's does. Golden outputs `boards` and
`runs` re-recorded. Both search ladders now sit on the same stated target; if it moves, both move
with it.
