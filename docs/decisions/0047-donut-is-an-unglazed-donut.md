# 0047. DONUT looks like an unglazed donut

2026-09-26. Status: adopted.

## Context
DONUT wore strawberry frosting, raspberry tiles with a rose `hot`, since it traded palettes with
HIVE (decision 0032). When SPRINKLE DONUT arrived as an iced donut with sprinkles (decision 0046),
the owner asked for DONUT to look like an unglazed one, and chose from three drawn options (golden
cake, pale dough, dark fried) on the same board.

## Decision
DONUT's tiles are golden cake crust (`#c98d4e`, edge `#95602c`) over dark fried dough
(`#2a190c`), with cream `ink` (`#f5dfc0`) and a raspberry `hot` (`#ff5577`). Its face, pip, sound
and clear effect are unchanged.

## Consequences
DONUT carries Reveal, so `hot` stays clear of the gold givens are drawn in: 118 RGB units from
`GIVEN_COLOR`, 156 from `ink`, and 5.5:1 on the floor. HIVE's honey palette is untouched.
