# 0023. Board-clear effects: two families, pre-rendered glyphs, measured time

2026-09-22. Status: adopted.

## Context
The icon effects animate the board's own creatures, which needs the renderer's cooperation; drawing
4,500 pip paths a frame on a 553-creature board would be a slideshow; a fixed step per frame made
tumbling creatures hang and vanish on a throttled tab.

## Decision
Ambient effects (confetti, burst, ripple, sparkle) know nothing about the board. Icon effects
(tumble, cascade, pop, burn, three wipes) take the glyph positions from `VictorySource`, the board
stops drawing them and they are handed back when the effect ends or is cut short. Glyphs are
pre-rendered per tier at twice the cell size. Physics effects step by measured time clamped to
1/20 s. Effects draw on their own layer and every screen change stops them.

## Consequences
0.6 to 1.2 ms a frame median on the largest board. Sprites include covered creatures, for the
search boards; an icon effect with no sprites falls back to confetti. Cascade fades the element
because its trail is the effect.
