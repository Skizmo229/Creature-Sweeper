# 0052. The long pickers sort by ladder, by name, and by how the option looks

2026-09-27. Status: adopted.

## Context
The owner asked for sorting options in the windows with many options: the board palette (33
tiles) and the board and interface fonts (25 each). The palette window showed its tiles in the
order the `LOOKS` table happens to be written, which is not the ladder list's (SPRINKLE DONUT sat
between PATROL and HIVE), and nothing but a ladder's name said which one a tile was.

A colour order needs a colour to sort by and a way round the wheel. Measured 27 Sep 2026 on the
33 palettes:

- The covered tile is most of a board before it is played and most of every thumbnail. Every
  floor is dark (the lightest, SPRINKLE DONUT's dough, is CIELAB lightness 22), and a borrowed
  palette's accent is never worn, since the menus keep the ladder's own.
- In HSL, SPRINKLE DONUT's near-white glaze (`#fbf5ee`) is 62% saturated with a hue of 32°, so
  it would sort among the oranges beside HIVE and DONUT. In CIELAB its chroma is 4.
- CIELAB chroma splits the tiles cleanly: the four greys are 8 or less (BLIND 0, SPRINKLE DONUT
  4, HUGE x BLIND 5, GEAR 8), and every tile with a colour is 13 or more (PACKS 13, PATROL 14,
  CHECKER 15, DOMINOES 18). CIELAB hue then runs round the rest in an order that reads as a
  wheel: VALENTINES's rose, CARD's red, the oranges, browns and sands, EASY's yellow, PATROL's
  olive, the greens, the teals, the blues, the violets, and DIAMOND's purple last.

## Decision
The palette window has a row of sort buttons under its title: Ladder (the default), under the
ladder list's four column heads and in its order; Name; and Colour, by the covered tile's CIELAB
hue from 0°, with tiles below chroma 10 (`GREY_CHROMA`) after every colour, lightest first. A
sort moves the tiles already drawn. Each window reopens in the order it last showed, for the
session, as the symbol window reopens on its set; the order is not saved. The icon window, twelve
tiles that fit a row or two, has no sorts.

## Consequences
A new ladder's palette sorts itself into every order; a new category needs a heading in
`CATEGORY_NAMES`, which the ladder list needs anyway. If a tile's chroma is ever moved to near 10,
it may fall on either side of the greys; measure it. `test/ui/pickers.test.ts` holds the orders
to showing every option exactly once, and pins where the greys go.
