# 0056. AUGUR ships at ARCANE's schedule, because density cannot move it

2026-09-27. Status: adopted. A lock deeper, with EXTREME's HP, since 0088.

## Context
AUGUR is ARCANE's boards with Census and Augur only: the two spells that answer a question and
never open or name a cell, so every guess stays the player's. It needed a schedule. ARCANE's own
runs 26.5 to 34.5%, at the 34% battle ceiling past which a board stops being a puzzle
(`docs/tuning.md`), and was tuned against the honest player.

Measured 27 September 2026 with the graded player spending mana (`sim:human --spells`, 40 seeds a
board): on ARCANE, grades 2 to 4 clear 100% of every board; on AUGUR at ARCANE's schedule, grade 2
clears 100% of every board too, grade 1 78% of board 10, and forced guesses at grade 4 run 0.1
rising to 2.9 a board, none lethal. The human-curve target for a battle ladder (a grade-2 player at
90% falling to 70%, `docs/human-tuning-plan.md` section 7) is out of reach by density, as it is
for every plain ladder (section 9.1): the ceiling is already here.

## Decision
AUGUR takes ARCANE's sizes, tiers, density, HP, lock and alpha unchanged, with `spells = ["census",
"augur"]` and 75 starting mana, counted in the Magic column at 40 boards cleared, after SEER.

## Consequences
A grade-2 player who spends nothing clears it as ARCANE is cleared; the spells are for the pinning
a person does with sum, count and strongest, which the instruments do not model (decision 0055).
If the ladder should bite, the lever is the lock (decision 0041's for EXTREME), not density. Its
look is parchment and bronze with a deep teal `hot`, and it wears ORACLE's face, the other reader
of signs (decision 0031 allows the share). Golden outputs `boards` and `runs` re-recorded for the
new ladder, and a golden run `spells-augur` fingerprints the honest player on it.

**Note, 2 October 2026.** The forced guesses above are the graded player's stuck column with
spells, which then counted a stuck point again for every cast that settled nothing there, so
counted once they would be lower. They cannot be measured again: AUGUR's schedule (0088) and
Augur's answer (0087) have changed since.
