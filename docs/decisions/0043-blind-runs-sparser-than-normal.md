# 0043. BLIND runs sparser than NORMAL, on a target of its own

2026-09-26. Status: adopted.

## Context
BLIND ran NORMAL's boards at NORMAL's density (20.6 to 28.0%) with 1 HP and level 0, where every
creature is death and only the tricks that prove a cell empty apply. The Milestone 4 baseline
(`docs/human-tuning-plan.md`, section 9.1) found a grade-4 graded player clearing 4% of the ladder
and 0% of every board from 4 on: a one-mistake game a deducer loses. The plan set no target for
the search ladders and called it a design question. The owner asked for BLIND to be retuned; the
target adopted is a proposal, stated here so it can be moved: a grade-4 player clears about three
quarters of board 1 falling to about a third of board 10, half the battle ladders' top-board
target, because a ladder with no guess budget should stay the hardest, as the original's Blind is.

Density is the only dial: HP is 1 and there is no level. Measured at 40 seeds on candidate files,
three quarters of NORMAL's density clears 90% falling to 13%, three fifths 95% falling to 73%, and
the ramp below is drawn between them.

## Decision
`density .165 .169 .172 .176 .179 .183 .186 .190 .193 .197`. Sizes, tiers (5 rising to 7), HP and
the opening are unchanged.

## Consequences
Grade-4 clear rates of 88, 85, 73, 68, 60, 57, 55, 48, 35 and 28% on boards 1 to 10, forced
guesses 0.3 rising to 1.5 a board, every one of them lethal. The continuation past board 10 climbs
at the ramp's own step toward the 30% search cap, so the scaling boards return to the unwinnable
kind, as decision 0019 accepted for HUGE x EXTREME. HUGE x BLIND was not retuned and still runs
its own schedule. Golden outputs `boards` and `runs` re-recorded.
