# 0058. The shapes and the placement ladders keep their schedules

2026-09-27. Status: adopted.

## Context
Milestone 4 (`docs/human-tuning-plan.md`) set every ladder a human target and retuned the hard
ladders and the search ladders onto theirs (decisions 0041 to 0044). The plain ladders were then
measured and left, because a grade-2 graded player clears 98 to 100% of them at any density up to
the 34% ceiling, and only the lock one deeper brings them down, by forcing five to seven guesses a
board: the guess-decided top that 0041 and 0042 had just taken off EXTREME and ORACLE. The owner
chose to leave them rather than buy that kind of hardness.

The shapes (CROSS, WRAPPED CROSS, DIAMOND, RAGGED CAVE, GEAR, CARD, VALENTINES, STAR, PYRAMID,
ULTRA HIVE, PETRI DISH) and the placement ladders (CHECKERBOARD, PAIRS, DOMINOES, PACKS, CONGA
LINE, DUNGEON, PATROL, and WORKOUT beside them) were measured the same way on 27 September 2026,
40 seeds a board on candidate files, the magic ladders spending mana, against a grade-2 target of
90% falling to 70%. Section 9.1 of the plan has the tables. In short:

- At the shipped schedules every one of the nineteen clears 93 to 100% of boards 8 to 10.
- Density to the ceiling (where a ladder is not already at or past it) leaves every shape at 93 to
  100% and only adds forced guesses. PACKS and CONGA LINE at their caps reach 90% and 85% of
  board 10, but at the grade-4 player's expense, under the 95% the placement target holds it to.
- The lock one deeper on boards 8 to 10 reaches the target on six shapes and DUNGEON, at six to
  ten forced guesses a board with one lethal; falls through it on RAGGED CAVE, GEAR, STAR and
  CARD (57 to 70%), whose guesses are dearer; and does nothing on PYRAMID (the face-up base) or on
  any ladder whose placement rule names the tiers (CHECKERBOARD, PAIRS, DOMINOES, CONGA LINE,
  PACKS, all within a third of a guess of where they were).

## Decision
No shape or placement ladder is moved. The ruling on the plain ladders stands for them: the lock
is the only dial that reaches the human target, and it buys a different hardness than the amount
the target asked for. What these ladders cost a person is scanning (5 to 11 moves on offer per
pass on the shapes) and, on the rule ladders, misreading the rule, neither of which the retune's
dials move and both of which telemetry (plan step 4.8) will measure.

## Consequences
Every ladder has now been measured against its Milestone 4 target; the retune step (4.6) is
closed with EXTREME, ORACLE, BLIND and HUGE x BLIND retuned and the rest left. If the owner later
wants a shape to bite at the top, the readings in 9.1 give the lock's effect per shape, and the
four that fall through would need density stepped back with it, as HUGE x EXTREME's retune
(decision 0019) did. The 90% falling to 70% target is the wrong shape of target for a
descending-distribution ladder at a shallow lock, and should be restated on a scanning or slip
measure once telemetry exists. Nothing in the data changed, so no golden output moved.
