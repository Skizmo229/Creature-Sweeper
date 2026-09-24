# 0011. Every reader of a rule family asks isPaired or isPacked

2026-09-21. Status: adopted; to be superseded by the placement registry (refactoring plan, phase 3).

## Context
DOMINOES is a pairing board and CONGO LINE is a pack board. Five separate `=== 'pairs'` checks would
have been five places to hand a domino board none of the mode's deduction, silently. The same
failure took WRAPPED CROSS out of the unlock graph, which drew only ladders it had a position for.

## Decision
`isPaired` and `isPacked` are the single answers; the generator, both Sweep proofs, the honest
player and the renderer ask them.

## Consequences
"Anything classifying ladders by X" is a recurring bug class; a registry with a typed interface
turns each instance into a compile error, which is the plan's phase 3.
