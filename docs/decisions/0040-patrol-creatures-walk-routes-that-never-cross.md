# 0040. PATROL: creatures walk square routes that never cross, one cell a move

2026-09-25. Status: adopted.

## Context
The owner asked for a ladder whose creatures move: a tier-t creature walks right, down, left and
up t cells each, back to where it started, the routes never crossing, the biggest placed first,
and a Wait button that counts as an action. Asked the open questions, the owner chose: one cell
per action (not a whole side at a time); a creature on uncovered ground shown as a "?"; an action
is an open, a Sweep or a Wait, and marking and pencilling are free; Wait free while it is tested;
NORMAL's settings; a full ladder; every creature starting on its route's top-left corner and all
walking clockwise. Asked about marks, the owner chose marks that draw a creature's whole route,
with the clicked cell as the route's top-left corner.

Routes that never share a cell cannot carry NORMAL's density. Each creature holds 4t cells for
good, NORMAL's tier mix averages about nine a creature, and 21 to 27% would need more route than
the board has cells. Measured, crossing routes whose creatures never meet reach NORMAL's densities
every time, but then a creature can walk over a beaten one, which the engine cannot hold without
beaten creatures leaving the numbers. Asked, the owner kept routes that never cross.

## Decision
A placement rule, `patrol`, lays the routes biggest first, each tier from a shuffled list of every
corner it could have, and restarts the whole deal if a tier runs out; it packs 8.5% reliably
(`PATROL_MAX_DENSITY`). `PlacementRule.patrols` tells `Game` to walk them: after every action each
living creature takes a step (`src/engine/patrol.ts`) and the numbers are summed again. A creature
on uncovered ground covers the cell while it stands there (`Cell.occupied`), so every existing rule
and proof reads it as unknown with nothing taught; clicking it fights it. A mark is a route and
not a claim, so Sweep reads no marks on the ladder (`Game.marksAreClaims`). The ladder takes
NORMAL's boards, tiers, HP and gates on a density ramp of 6.5 to 8.5%.

The honest player is taught what a player would do: it reads the board afresh after every move
(it opens one proven cell at a time, and rubs out what it named, which was true a move ago), and it
waits out a stuck point, up to one lap of the longest route, before it gambles.

## Consequences
At these densities the opening uncovers most of the board (409 of 480 cells on board 1) and most
creatures walk in plain sight. The honest player was never stuck and cleared every board, with or
without waiting (60 seeds, 25 September 2026; NORMAL: 2.0 stuck over the ladder, 99% cleared).
What makes PATROL hard is keeping up with numbers that change every move, which no instrument here
measures, so its difficulty is for playtesting to settle. The levers, if it plays too easy, are a
smaller opening than the largest blank area, fewer revealing numbers (hiding creatures on
uncovered ground), or crossing routes with beaten creatures taken out of the numbers. Nothing here
removes a creature or skips its EXP, and the tier-order player clears every board without damage.
