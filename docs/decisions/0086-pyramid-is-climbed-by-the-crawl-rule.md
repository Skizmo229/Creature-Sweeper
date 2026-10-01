# 0086. PYRAMID is climbed by the crawl rule

2026-09-30. Status: adopted. Amends 0038.

## Context
PYRAMID's face-up base unzips the board a row at a time from its stepped edge, so it ships as a
ladder decided by deduction (decision 0038). On 30 September 2026 the owner asked to try PETRI
DISH's growth rule on it, every opened cell touching uncovered ground, to see whether it would make
the pyramid bite.

Measured with the graded player, 40 seeds a board, 30 September 2026: at one step with marks
extending it, at one step without, and at two steps, every figure was identical to the ladder
without the rule. Every cell the base proves already touches open ground, so the rule never refuses
a move the player would make, and on a board without a forced guess it has nothing else to refuse.
What did move the board was less of the base: dealing only the middle fifth of the bottom row face
up put it on ARCANE's curve (the honest player stuck 16.9 times over the ladder against ARCANE's
22.3; the graded player needing a grade-2 trick on 43 to 98% of boards against ARCANE's 30 to 95%),
and with that base the crawl rule again changed nothing.

The owner chose the crawl rule with the whole base, for the climb it gives the ladder.

## Decision
PYRAMID sets `reach = 1` and `reach_marks = true`, PETRI DISH's rule: a cell may be opened, or a
spell aimed at it, only where it touches uncovered ground, and a mark touching uncovered ground
counts as uncovered. A single step needs the marks (`readReach` refuses it without), and the base's
givens are marks the board wrote, so the climb starts from the whole base. The schedule is
unchanged.

## Consequences
PYRAMID stays a deduction ladder; no measure moved and the golden outputs do not carry it. The
blurb, the field guide's note, the catalogue's section 7 and the glossary say the pyramid is
climbed. If it should bite, the measured lever is a smaller base (a doorway in the bottom row),
which is a change to the `'base'` opening, not to the schedule.
