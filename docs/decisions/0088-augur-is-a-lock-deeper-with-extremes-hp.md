# 0088. AUGUR is a lock deeper, with EXTREME's HP

2026-09-30. Status: adopted. Amends 0056.

## Context
AUGUR shipped at ARCANE's schedule (0056). There the graded player at grade 4 was stuck 0.6 times
a board and cleared every board, with or without spells: at 10 HP no guess could kill, so a spell
that only answers had nothing to settle. The owner asked for a harsher ladder alongside the new
Augur (0087), tuned by measurement.

Measured with the graded player at grade 4 spending mana on the new aim, 40 seeds a board and 80
on boards 6 to 10, 30 September 2026:

| schedule | board 9 | board 10 |
|---|---|---|
| lock 3, then 4 from board 4; HP 10 | 93% | 83% |
| the same, lock 5 on boards 8 to 10 | 93% | 83% |
| lock 4 from board 4; HP 10, 9 from board 5, 8 from board 8 | 88% | 61% |
| the same with HP 7 on boards 9 and 10 | 88% | 60% |

Lock 5 is the same game as lock 4 on five tiers, and HP 7 the same as 8. Without spells the chosen
schedule clears 80% of board 9 and 57% of board 10, with about one guess more on each.

## Decision
AUGUR keeps ARCANE's boards and density and takes lock 3, then 4 from board 4, and EXTREME's HP,
10 falling to 8 from board 8. Board 10 sits at 61%, inside the hard ladders' target of 60 to 70%
for the top boards (decision 0041); board 9 at 88% sits above it, as EXTREME's 73% does.

## Consequences
The blurb says HP falls from 10 to 8. The spells are worth about a guess a top board and four
points of clearing, bought with mana at 50 an Augur; Census, at 30, is the cheap half. If board
9 should bite harder, HP is spent (7 moves nothing), so the lever is lock 4 a board or two earlier
or a denser board 9, which the density ceiling (0056) argues against.
