# 0063. PATROL offers no Sweep

2026-09-28. Status: adopted. Amends 0040.

## Context
PATROL shipped with Sweep, which opened every cell proven safe as one move (decision 0040). The
ladder's difficulty is keeping up with numbers that change after every move, and the honest player
was never stuck on it; Sweep reads the numbers as they stand and opens everything they prove, so it
plays the one part of the ladder that is hard. The owner asked for Sweep to be disabled on 28
September 2026.

## Decision
PATROL's ladder sets `sweep = false` in `design/ladder_types.toml`, as EASY does, so the board has
no Sweep buttons, `S` and `D` do nothing, and the hint line says there is no Sweep. The engine
still walks the creatures once for a sweep and still refuses to read route marks as claims
(`Game.marksAreClaims`), since the tutor and the simulators prove cells the same way Sweep did.

## Consequences
The simulators never pressed Sweep: their players deduce what Sweep would have opened and open it
a cell at a time, which on PATROL is what they already did (it reads the board afresh after every
move). So no measured figure moves, and the golden outputs are byte-identical. What changes is the
human's work: every proven cell is a click, and a move, and the board changes under them between
clicks. If the ladder turns out too slow rather than too hard, the lever is Sweep back with its
charge gate forced on, rather than off entirely.
