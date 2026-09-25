# 0034. The example board shows every digit and every colour a palette paints

2026-09-25. Status: adopted. Replaces the choice, in the working notes of 24 Sep 2026, to leave the
gallery thumbnails at 4x3.

## Context
The icon, palette, board font and strike galleries share one example board, and the glow after a
fight is shown on it. It was 4x3 at 26px with two beaten creatures, kept that small on purpose
because the icon gallery's question is the pip shape (`docs/archive/working-notes-2026-09-24.md`).
It wrote four digits, 3, 4, 5 and 8, so a face was judged on four of its ten. It never showed a
palette's `hot`: a board uses that colour only for the number under a hovered beaten creature
(0012), so the separation 0032 is about, `hot` against `ink`, was the one thing a palette tile could
not show. The owner asked for every digit from 0 to 9 and the complete board palette.

## Decision
The example is 5x4, with seven creatures of five tiers. It beats the three strongest, opens floor
only where the number shows a digit not yet on show, and marks one tile. It is dealt by rejection
from the fixed seed until all ten digits are in the ink with a quarter of the board still covered.
A thumbnail holds the cursor over the weakest beaten creature, with the highlight off, so its
number is drawn in `hot` and the two with the most pips keep their glyphs.

## Consequences
Thumbnails are 130x104 rather than 104x78, and the tiles with nothing drawn in them follow
(`--chip-w`, `--chip-h`). About one deal in 140 passes. The first is the 102nd: it writes 2 to 9
and 10, each digit once, with a `hot` 6 one row below an ink 6 (measured 25 Sep 2026). A change to
the generator moves the example rather than breaking it, and `test/preview.test.ts` holds each
promise. A palette's `accent` is not on the example because a board never paints it; a borrowed
palette's accent reaches only the clear effects, whose own demo shows it. The example must stay on
a placement whose hover shows the number; on the pairing placements it does not.
