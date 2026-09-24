# 0002. The ragged cave is grown to an exact cell count, never trimmed

2026-09-21. Status: adopted.

## Context
A cave cannot be counted ahead of time like a per-cell shape, and `C_k` needs the creature quota
fixed before the board exists. The first generator trimmed a noise field down to a count; every
trimming order had a signature (thinnest-first shaved protrusions, most-connected-first filled bays,
oldest-first left threads), it could not guarantee a minimum width, and it left stray islands in 13
of 40 boards.

## Decision
The count is *chosen* per board in `ladders.py`'s `cells` schedule and carried in `shapeParam`; the
generator lays whole 2x2 squares and never removes one, refuses corner-to-corner touches, punches
caverns before growing (keeping one only if the cave still fits round it), grows into about 8% more
room than it needs, and uses a superellipse rim (power 2.6) with wobble harmonics.

## Consequences
No one-cell passage can exist or appear. A mask a few cells light would not throw, only mistune
the board on that seed, so the test `leaves exactly the cell count the ladder was tuned against` is
the alarm. Connectivity is asserted, not assumed.
