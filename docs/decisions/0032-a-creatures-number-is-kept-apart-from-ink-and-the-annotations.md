# 0032. A beaten creature's number is kept apart from `ink` and from the annotation colours

2026-09-20. Status: adopted. Recorded 2026-09-24, when the history moved out of the palette
comments.

## Context
A palette's `hot` draws the number on a beaten creature's cell, `ink` the ordinary numbers on open
ground. Several palettes shipped with a `hot` so pale it read as the same colour as `ink`, measured
as RGB distance: ORACLE's light violet `#c08bff` at 75 units, PAIRS's pale orange `#ffb07a` at 85,
SUDOKU's light violet at 74, BLIND's pale blue `#9fd8ff` at 78. Gold was not a fix everywhere:
Reveal writes givens in `GIVEN_COLOR` on every magic ladder, and Sudoku draws every clue in it.

## Decision
`hot` must be told apart from `ink`, not only from the floor, and never sit near `GIVEN_COLOR` on a
ladder that draws givens. The fixes, with their distances from `ink`:

- ORACLE: rose, 181 from `ink`, 124 clear of the gold (amber would have landed 58 off it) and
  clear of Census's cyan; 5.8:1 on the floor, the contrast NORMAL and HUGE x EXTREME have.
- PAIRS: amber, 139 from `ink`, and better against the floor (11.3:1 against 10.1). A beaten
  creature's number is its partner's tier there, though hover does not show it on pairing boards
  (0012); the palette is also worn on other ladders as a player setting.
- HIVE and DONUT traded palettes, by request: honey amber for the hive (114 from `ink`; HIVE has
  no spells, so amber is safe), strawberry frosting for DONUT, whose old amber sat 27 from the gold
  and whose rose is 108 clear of it and 97 from its `ink`. Each kept its own pip.
- SUDOKU: magenta, 126 from `ink` and 160 clear of the gold (amber would be 21 from it), 6.7:1.
- BLIND: saturated azure `#3fb8f0`, 176 from its near-white `ink`, where only saturation separates;
  kept bright (7.7:1) because its boards are among the largest and draw the smallest cells. It
  matters on a ladder that never beats a creature because a palette is a player setting.

## Consequences
The shipped minimum separation is 93 RGB units (`docs/ui.md`). A new palette should check `hot`
against its own `ink` and, if its ladder has magic or givens, against `GIVEN_COLOR`.
