# 0007. The board is outlined as its silhouette, worked out per cell

2026-09-21. Status: adopted.

## Context
A shaped board read as scattered tiles. The obvious trick, stroking every cell under the fills at
twice the rim width, paints the whole grid white because `tracePath` insets each cell by a pixel;
sampling the canvas between two open cells caught it.

## Decision
`drawSilhouette` finds boundary edges per cell against the edge directions and strokes only those.
Its adjacency is deliberately not `neighboursOf`, which wraps; the seam is drawn dashed by
`drawSeams`, per present cell rather than along the bounding box.

## Consequences
On a rectangle it is a box; on a dungeon it is rooms and hallways. WRAPAROUND keeps its left and
right rim. A wrapped cross shows a seam only beside cells that exist.
