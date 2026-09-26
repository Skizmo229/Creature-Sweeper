# 0013. Spell prices are 30 / 75 / 150 / 300, and starting mana is 75

2026-09-21. Status: adopted. Beacon's price superseded by 0037.

## Context
At 25 / 10 / 50 / 100, buying your way out of every moment a deductive player is cornered cost 1 to
32% of a board's pool, so no ladder could run out of mana by playing well. "Share of the pool spent"
had said prices bit on DUNGEON only, and it was the wrong measure.

## Decision
Triple the table, keep it one global table (income and demand already carry the variation between
ladders), and set starting mana to "one Reveal exactly".

## Consequences
Buying out every stuck point is 40 to 86% of the pool on late boards and 2 to 30% early. Casting on
DUNGEON fell from 2.4 Reveals a board to 1.4 while the share that unlocked something rose to 87%.
Exercise is out of reach on DUNGEON's first boards. Anything that changes Reveal's price has to move
starting mana too.
