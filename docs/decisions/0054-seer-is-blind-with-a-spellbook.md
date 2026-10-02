# 0054. SEER is BLIND with a spellbook, denser, on BLIND's target

2026-09-27. Status: adopted.

## Context
The owner asked for game types that focus on magic. Every spell is information, protection or
movement, and none removes a creature, so a search board can carry spells without a special case:
the engine already pays exploration mana on a search board (it is the only income there) and
`Game.cast` runs the search win check. The reference page had noted as much ("BLIND could take
spells without any special case"). What was missing was a ladder that did it, and a density for
it, since a search board with a bought certainty in hand is gentler than one without.

Measured with the graded player at grade 4 spending mana (`sim:human --spells`, 40 seeds a board,
27 September 2026), boards 1 and 10 cleared:

| Density | Board 1 | Board 10 | Note |
| --- | ---: | ---: | --- |
| BLIND's own (16.5 to 19.7%), spell-less | 88% | 28% | BLIND's measured curve (decision 0043) |
| BLIND's own, with spells | 98% | 80% | too gentle: the spells buy every guess |
| BLIND + 3 points | 80% | 13% | |
| BLIND + 5 points | 43% | 5% | |
| BLIND + 7 points | 10% | 0% | |
| BLIND + 1 rising to + 2.5 | 93% | 20% | |
| BLIND + 0.5 rising to + 2 | 93% | 28% | |
| 19.8 to 21.6% | 73% | 33% | |
| 19.4 to 21.4% | 80% | 30% | adopted |

The cliff is steep: three points move board 1 from 98% to 80% and board 10 from 80% to 13%. The
target is BLIND's own (decision 0043): about three quarters of board 1 falling to a third of board
10. Meeting it needs a flatter climb than BLIND's, 2.0 points over the ladder against 3.2, because
exploration is the only income and it grows with the board: board 1 funds about 100 mana on top of
the starting 75, board 10 about 185, so the top boards afford more casts than the first.

## Decision
SEER: BLIND's sizes, tiers (5 rising to 7), 1 HP and level 0, with Reveal, Census and Beacon and
75 starting mana, at `density .194 .196 .198 .201 .203 .205 .207 .210 .212 .214`. It sits in the
Magic column, counted, at 35 boards cleared, after DUNGEON. Exercise is left out: a level lent at
level 0 would make a tier 1 a free kill on a board whose creatures are never fought.

## Consequences
Grade-4 clear rates with spells of 80, 80, 73, 60, 57, 55, 57, 53, 40 and 30% on boards 1 to 10,
forced guesses 0.4 rising to 1.4 a board, every one lethal. A player meets the one-mistake game
with a net at 35 boards, before BLIND takes it away at 70; if the owner would rather it waited for
BLIND, it is a `requires` entry in `UNLOCKS` instead of a place in the column. The affordability
test now counts a search ladder's pool honestly (kills pay nothing there): SEER's board 1 pool buys
Census 5.8 times and Beacon twice. `sim:spells` no longer skips search ladders, and a golden run
`spells-seer` fingerprints the honest player there. Golden outputs `boards`, `runs` and the new
`spells-seer` re-recorded; the continuation past board 10 climbs toward the 30% search cap.

**Recounted, 2 October 2026.** With the graded player's casts at a stuck point coming back after a
guess or a rescue, board 9 clears 43% rather than 40%. Boards 6 to 8 measured 60, 65 and 48% the
same day before that fix, against the 55, 57 and 53% above: a drift from changes made between 27
September and then, not traced.
