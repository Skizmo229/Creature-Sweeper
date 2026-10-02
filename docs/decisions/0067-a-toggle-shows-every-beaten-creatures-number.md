# 0067. A toggle shows every beaten creature's number at once

2026-09-28. Status: adopted. Amends 0012. Every board key leaves Ctrl, Cmd and Alt to the browser
since 0082.

## Context
Since decision 0012 a beaten creature's number shows only while the cursor is over it. A touch
screen has no hover, so on a phone the number could not be seen at all, and with a mouse the board
is read one beaten creature at a time. On 28 September 2026 the owner asked for a button, on
desktop and on phones, that reveals the number under every beaten creature, and chose a toggle over
a button held down.

## Decision
The game screen's palette carries a toggle beside Entry, labelled with what beaten creatures show
now ("Beaten: Creature" or "Beaten: Number", the way decision 0008 labels Entry), and `U` switches
it. While it is on, every beaten creature is drawn as the number under it; while it is off, hover
works as before. It is offered only where that number is the player's to read
(`offersBeatenNumbers`): not on PAIRS or DOMINOES, whose rule hides it (0012), nor on a search
board, where nothing is beaten before the win uncovers everything. It is a presentation setting,
`beatenNumbers`, kept like the mute and, like it, set from where it is used rather than from a row
on the settings screen.

## Consequences
It shows nothing hover did not already show, so no rule, record or measurement moves. The graded
player's reader already reads every beaten creature's number the placement rule shows
(`numberVisible` in `src/sim/reader.ts`), which is now true on a phone as well, and the golden
outputs are byte-identical. The settings screen's examples and the field guide's diagrams keep
their creatures whatever the toggle says, since a beaten creature is part of what they show. The
lesson overlay writes a number a proof read only where the board is not already showing it,
hovered or toggled, where it used to draw that digit twice. With Ctrl, Cmd or Alt held, `U` is left
to the browser.
