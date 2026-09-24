# 0020. The shaped magic ladders sit on ARCANE's forced-guess curve

2026-09-21. Status: adopted.

## Context
DONUT, CROSS, DIAMOND and RAGGED CAVE carry ARCANE's loadout on densities derived for a spell-less
board. Measured with the honest player at 60 seeds a board, DONUT was already harder than ARCANE
and RAGGED CAVE already on its curve; CROSS and DIAMOND were far gentler.

## Decision
CROSS moved 2.5 density points up, DIAMOND 4, WRAPPED CROSS with CROSS to keep its 1.2-point
relationship. The curve matched is forced guesses, not clear rate, as in every retune.

## Consequences
A ladder meant to be as deadly as ARCANE rather than as puzzling would match the clear rate and
land elsewhere. The complete deducer agreed on both movers. The mana economy needed no change.
