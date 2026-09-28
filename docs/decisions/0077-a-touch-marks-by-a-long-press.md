# 0077. A touch marks by a long press, half a second by default

2026-09-28. Status: adopted.

## Context
A right-click cycles a covered cell's mark, and a touch screen has no right-click, so on a phone
the LV buttons were the only way to mark: a tier chosen there, then a tap. The release audit of
28 September 2026 had already found touch second-class (no hover, since answered by 0067).

## Decision
A finger held still on a covered cell for `longPress` milliseconds does what a right-click does,
and its lift opens nothing, as a drag's does not; a finger that wanders past six pixels, lifts
early or is joined by a second does not. Half a second by default, long enough that a slow tap
still opens, and 0 for never. What the right-click does is itself a setting (`rightClick`):
cycle up as ever, cycle down, cycle through the tiers still on the counters, or clear.

## Consequences
The default is on, against the batch's rule that a default keeps the game as it was, because as
it was a phone could not mark by gesture at all. A long press is not a move: what it makes is
the mark move a right-click makes, so nothing new is kept or replayed. The timer lives in
`BoardInput`, which is the one place in the renderer that keeps time.
