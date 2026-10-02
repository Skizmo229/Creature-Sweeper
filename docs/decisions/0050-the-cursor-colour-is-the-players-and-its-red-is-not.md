# 0050. The cursor's colour is the player's, and the red of a click that would do nothing is not

2026-09-27. Status: adopted. The refusal is crossed out as well as red since 0051, so a player who
chooses a red gives up only its colour, and the drawing the consequences below ask for is made.

## Context
The cursor highlight was always drawn in the mark green where a click would land and in
`REFUSAL_COLOR`, a red, where it would not: past the crawl rule's reach or a spell's, and on
a given or a ruled-out note while a tier is armed. A setting was asked for to change its colour,
with presets and a custom colour mixed from red, green and blue.

Measured 27 Sep 2026 against the red and against every palette's covered tile, as colour
difference (CIE76 ΔE, where about 2 is the least noticed side by side), with red–green colour
blindness simulated at full severity (Machado, Oliveira and Fernandes, 2009), and as contrast
ratio:

| colour | ΔE from the red | protanopia | deuteranopia | tile contrast, median | worst |
| --- | --- | --- | --- | --- | --- |
| green `#35e06a` (the default) | 131 | 46 | 11 | 3.1:1 | 1.37:1 (EASY) |
| white `#ffffff` | 81 | 52 | 53 | 5.4:1 | 1.08:1 (SPRINKLE DONUT) |
| yellow `#ffeb3b` | 92 | 78 | 45 | 4.4:1 | 1.13:1 (SPRINKLE DONUT) |
| cyan `#2ee6ff` | 117 | 53 | 72 | 3.6:1 | 1.40:1 (SPRINKLE DONUT) |
| magenta `#ff4dff` | 91 | 86 | 89 | 2.1:1 | 1.05:1 (DONUT) |

So for a deuteranope the default green is barely apart from the red, and no one colour reads on
every tile: the bright ones lose on SPRINKLE DONUT's near-white glaze, the green on EASY's olive.
White, yellow and cyan each out-contrast the green on 32 of the 33 palettes.

## Decision
The setting colours only a click that lands. A click that would do nothing stays red whatever is
chosen, because that is the board refusing, not a matter of taste. The presets are white and
yellow for contrast, cyan for a bright colour apart from the red under deuteranopia, and magenta,
which reads by its hue rather than its brightness and is the furthest from the red under every
vision measured. None is red, and none is violet, the tutor's colour, whose rings are drawn the
same way. The default stays the green the game always had. A custom colour within ΔE 40 of the
red (`NEAR_TAKEN`) is warned about in its window, not refused: pure red is 38 from it, a light
red 37 and a red-orange 35, where orange is 46 and hot pink 45.

## Consequences
A player who chooses a red gives up the refusal on their own boards, knowingly.
`test/ui/highlightcolor.test.ts` holds every preset clear of the red. If the red ever changes,
measure the presets and `NEAR_TAKEN` against it again. The green default is still a poor pair
with the red under deuteranopia; a refusal drawn differently as well as in a different colour
(dashed, say) would settle that for every player, and would be a decision of its own.
