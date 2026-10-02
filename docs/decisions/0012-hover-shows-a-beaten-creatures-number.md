# 0012. Hovering a beaten creature shows its number; the hover-level setting was retired

2026-09-22. Status: adopted. See 0001 for the code removal; the pencil no longer reads the hidden
number (0061); a toggle shows every beaten creature's number at once since 0067; a creature may be
drawn as its tier's digit since 0074.

## Context
A beaten creature's number used to be a click toggle held on the cell (`showNum`), preset on the
pairing boards. A separate setting could write the creature's level over its glyph in the tier's
own colour.

## Decision
The number shows while the cursor is over a beaten creature, everywhere but PAIRS and DOMINOES
(by request: a lone digit read as the creature's own level). The toggle, its event and the preset
are gone; the level-on-hover setting cannot share the cursor and was disabled, then removed.

## Consequences
The number is a picture of where the cursor is, not state. Touch has no hover, so on a phone the
number is unreachable. Sweep's partner proof and the pencil still read a number the player no
longer sees on the two pairing boards, so those ladders play harder than their tuning says.
