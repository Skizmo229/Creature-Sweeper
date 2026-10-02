# 0051. A click that would do nothing is crossed out, not only red

2026-09-27. Status: adopted.

## Context
The cursor boxed every cell it lit: in the player's highlight colour where a click would land,
in `REFUSAL_COLOR`, a red, where it would not (past the crawl rule's reach or a spell's, or
a given or a ruled-out note while a tier is armed). So the refusal was said by colour alone.
Decision 0050 measured the default green only ΔE 11 from that red under deuteranopia, and left a
refusal drawn differently for a decision of its own. The red was itself the second drawing: the
first dimmed the green, and on DUNGEON's violet that read as a highlight gone slightly out of
focus.

Colour vision is not the only gap. Measured 27 Sep 2026, as contrast ratio against the covered
tile the cursor is drawn on: the red is under 2:1 on 22 of the 33 palettes (median 1.83:1, lowest
1.08:1 on DONUT), where the green runs from 1.37:1 (EASY) to 4.89:1. In grayscale a red box on
most boards is barely there, for any viewer.

Seven drawings were compared in headless Chrome, each on DUNGEON's square cells and HIVE's hexes
at 8 (`MIN_CELL`), 12, 16, 26 and 40 px, with the ring lit at the edge of reach and the centre
cell both landing and refused, in colour and in grayscale, and the last of them on eight palettes
and under deuteranopia and protanopia (Machado, Oliveira and Fernandes, 2009, full severity):

| drawing of a refused cell | at 8 px | in the way of |
| --- | --- | --- |
| the red box alone (as it was) | ring invisible in grayscale | |
| a dashed box | four dots; the ring a smear | the wrap seams, and the tutor's narrowed cell, a dashed ring at the same inset and width |
| a cross inside the box | a solid square; the ring unchanged | |
| a slash or hatching inside the box | the same | the strike-through of a beaten creature, one diagonal |
| the box and a cross to the tile's corners | squares read; a hex is a solid blob | |
| a cross to the tile's corners, no box | a cross on both grids | |
| the same over a dark outline | a cross on both grids, in grayscale on DONUT too | |

Everything inside the box drowns at the smallest cells: the box is inset 2 px and drawn 2 px
wide, so at 8 px there is no inside left. A different inset was not drawn, for the same reason:
the insets in use, 2 for the cell and 3 for its ring, are already what tells the two apart, and
one pixel either way is lost at 8 px. A fill was not tried: a washed cell is the tutor's "safe to
open".

## Decision
A cell a click would not land on is crossed out instead of boxed: two diagonals from corner to
corner of its tile, stopping on the tile's own outline (on a hex, where a line at 45 degrees
meets its sides), in the red, over the dark outline a mark wears (`ANNOTATION_OUTLINE`, a pixel
either side). A cell that lands is boxed as before. Over its outline the red measures at least
3.88:1 against every palette's tile (median 5.66:1); the ring is drawn at 40% as it always was.

## Consequences
The refusal reads by its shape: under red–green colour blindness, in grayscale, on DONUT's tile,
and for a player whose chosen highlight is a red, who now gives up only its colour (0050). The
hint on a crawl board says the cursor crosses out what is out of reach, not that it goes red.

A cross runs through the middle of the cell, where a mark or pencil notes are written. It is thin,
there only while the cursor is, and at 40% on the ring, but a note read on a refused cell is read
through it.

Nothing else on a covered tile is a thin diagonal. The strike-through is a single faint diagonal
on open floor, where a creature's pips are drawn too, and a sprinkle (SPRINKLE DONUT, which has a
crawl rule) is thick, rounded and lies across two cells; checked in headless Chrome on its board.
The dash stays free for the seams and the tutor.

`test/ui/refusal.test.ts` holds the cross against the box, the player who picks the red, the
cross's ends on the tile's outline at `MIN_CELL`, 12, 26 and 48 px on both grids, that it is never
dashed, and DUNGEON's edge of reach through the game's own `clickLands`. If the highlight's width,
the tile's inset or `MIN_CELL` changes, look at the cross at the smallest cell again.
