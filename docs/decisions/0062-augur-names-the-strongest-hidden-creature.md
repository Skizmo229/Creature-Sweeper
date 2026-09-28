# 0062. Augur names the strongest hidden creature

2026-09-28. Status: adopted. Amends 0055.

## Context
Augur answered with the strongest tier among all of a cell's neighbours, open ones included
(decision 0055), whose consequences named the strongest *hidden* neighbour as the sharper answer
if the spell should bite harder. An open neighbour is already on the board, so counting it adds
nothing the player can use, and a beaten creature stronger than everything still covered hides
the bound the player cast for. The owner asked for the hidden answer on 27 September 2026.

Measured 28 September 2026, the graded player at grade 4 with spells on AUGUR's boards 4 to 10,
30 seeds each, reading both answers at every cast: 181 casts, the two answers never differed, and
4 were at or below the level either way; every golden output is byte-identical. A beaten creature
is almost always within the level, so it never set an answer above it that the hidden ones did
not.

## Decision
Augur's answer is the strongest tier among the cell's covered neighbours, 0 if there is none
(`strongestHidden` in `src/engine/cast.ts`, which the simulators' look-ahead in `augurOracle` also
calls). It is kept at the moment of the cast and stays true as the ring opens, since opening only
takes cells away.

## Consequences
The answer is the fact its blurb states, and marked cells count as hidden, since a mark is the
player's claim rather than the board's. The spell is still worth next to nothing as played; the
levers left are the count-and-ceiling trick neither instrument has, or an answer that says more
(the strongest and how many of it), not the price.
