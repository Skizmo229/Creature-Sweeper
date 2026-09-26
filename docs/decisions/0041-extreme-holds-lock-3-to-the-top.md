# 0041. EXTREME holds lock 3 to the top instead of deepening to 4 on boards 9 and 10

2026-09-26. Status: adopted.

## Context
Open question 3 of `docs/tuning.md`: the lock, not HP or density, made the hard ladders' top boards
guess-decided, and the advice on record was one short on EXTREME 9 and 10, left pending a decision.
Milestone 4 gave the decision a human figure. The target adopted for the hard ladders is a grade-4
player of the graded player (`docs/strategies.md`) clearing 60 to 70% of the top boards. Measured at
40 seeds, spell-less, EXTREME cleared 95, 83, 23 and 8% of boards 7 to 10 at grade 4: a cliff
exactly where the lock deepened from 3 to 4.

## Decision
`lock 2 2 2 2 3 3 3 3 3 3`: the top is held at three full-tier gates. Density (26.0 to 34.0%) and
HP (10 falling to 8) are unchanged.

## Consequences
On a candidate file measured before landing, boards 9 and 10 clear 73% and 65% at grade 4 (forced
guesses 4.3 and 4.8 a board, lethal 0.6 and 0.7, from 8.6 and 9.1 with 2.5 and 2.7 lethal);
boards 7 and 8 are untouched. The continuation past board 10 now stays at lock 3, since a flat
dial stays flat. Re-recorded golden outputs: `boards`, `runs` and `lethal-extreme`. The same
lever on ORACLE is decision 0042.
