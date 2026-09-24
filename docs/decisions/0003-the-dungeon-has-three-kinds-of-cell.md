# 0003. The dungeon has three kinds of cell, and a doorway carries a pocket

2026-09-21. Status: adopted.

## Context
Built from 2x2 blocks at first, the dungeon played as a minefield with corridors drawn on it, and a
fixed room size meant a bigger board simply held more rooms, an untuned difficulty ramp under the
one being tuned. The cell you stepped onto after a doorway was still a blind commitment.

## Decision
Rooms hold creatures; hallways are one cell wide and always empty; the room cell a hallway arrives
at (the door) is empty, and so are the room cells orthogonally beside a door that are themselves
against a wall (the pocket, measured with ORTHO for "beside a door" and the full ring for "against
a wall", because taking the ring on both cannot generate). `ROOM_COUNT` is pinned at seven and the
room side derives from the cell budget. Hallways are thinned after the fact and pinched plans are
thrown away. `MIN_SPAWN_SHARE` moved from 0.78 to 0.55 when the pocket made 0.78 unreachable, and
the invariant moved to the density a room actually plays at.

## Consequences
Measured, the pocket made the board easier to play (98% of board 10 cleared against 83%) and the
schedule was re-derived to 12.8 to 26.4%. The classification cannot be recovered from the grid, so
`dungeonMap` returns it. Rooms play denser than the nominal density: check the felt density, not
the quoted one, when touching the schedule.
