# 0053. A creature's colours are the player's, from measured presets or their own

2026-09-27. Status: adopted.

## Context
A tier's colour was fixed: five hues, the first four worn again by tiers 6 to 9 inside a gold halo,
the same on every ladder (pip SHAPE is a ladder's, pip COLOUR a tier's). It colours the creatures,
the HUD's level number, the LV buttons, the tutor's named cell and the clear effects. A setting
was asked for, with presets and a colour of the player's own for each tier.

Measured 27 Sep 2026 by the method of 0050: CIE76 ΔE, with protanopia, deuteranopia and
tritanopia simulated at full severity (Machado, Oliveira and Fernandes, 2009) in linear RGB. The
pairs measured are those the halo does not already tell apart (1 to 5 among themselves, 6 to 9
among themselves), since the halo parts the rest. "Faintest" is the least contrast a beaten
creature's glyph, drawn at `BEATEN_ALPHA`, has with any of the 33 ladders' floors; "halo" is the
closest the halo comes to a tier it rings, under any of the four visions.

| palette | normal | protanopia | deuteranopia | tritanopia | faintest | halo |
| --- | --- | --- | --- | --- | --- | --- |
| the game's own | 40 (3/4) | 20 (2/4) | 16 (3/4) | 12 (1/2) | 2.37:1 | 4.5 (tier 8) |
| Distinct | 66 | 41 | 38 | 38 | 2.41:1 | 19.6 |
| Nine colours | 59 | 38 | 36 | 38 | 2.38:1 | 35.9 |
| Plain | 0 | 0 | 0 | 0 | 4.92:1 | 33.5 |
| vivid (rejected) | 87 | 24 | 7 (1/5) | 23 | 2.43:1 | 13.4 |
| pastel (rejected) | 24 | 9 | 13 | 10 | 3.24:1 | 5.1 |
| heat ramp (rejected) | 20 | 2 (1/2) | 7 | 7 | 1.75:1 | 4.1 |

Distinct's five colours were found by search: every colour of sRGB in steps of 15 no fainter on
any floor than the game's own faintest, the five furthest apart under all four visions at once
(greedy exchange from thirty random starts). Nine colours keeps those five for tiers 1 to 5 and
searches four more, each as far as it can be from every other tier under normal vision and from
the gold halo and the other three under every vision: every pair of its nine is at least 35.3
apart for normal vision. The rejected sets were tried by hand: a set searched for normal vision
alone came out twice as far apart as the game's own but lost sky from magenta under
deuteranopia; pastels are soft by being close; and a ramp, cool to hot, puts neighbouring tiers
2 apart under protanopia and its coolest tier under the faintest bar.

## Decision
The setting offers the game's own colours (the default, unchanged), Distinct, Nine colours and
Plain, and a palette of the player's own. Distinct is further apart than the game's own under
every vision measured, for everyone, and is offered as the colour-blind choice; Nine colours gives
every tier its own colour, so a 6 is told from a 1 without the halo; Plain is white, the pips'
count alone, for a player who finds the colour noise. Every preset keeps the gold halo, the game's
mark of a high tier, which is at least 19.6 from every tier it rings in each of them. The player's
own palette sets each of the nine tiers and the halo, from any preset as a start, and is kept while
a preset is chosen so it can be gone back to. The setting is global, like the highlight colour: no
ladder has colours of its own for its tiers.

## Consequences
`test/ui/tiercolors.test.ts` holds each preset to its claim: Distinct and Nine colours at least 35
apart where they promise it, under every vision, and every preset no fainter on any floor than the
game's own. If a ladder's floor, `BEATEN_ALPHA` or the halo's colour changes, measure them again.
The player's own colours are not checked: two alike, or one lost on the floor, is theirs to see in
the example; a warning measured like 0050's would be a decision of its own. The game's own gold
halo is 4.5 from tier 8's yellow (6 for normal vision), so tier 8's halo hardly shows; its eight
pips still say it is not a 3, and changing the default is the owner's call. The comment on the
default's hues quotes a protanopia figure (ΔE 6.4, yellow against green) that this method does not
reproduce (it measures that pair 31 apart); its model is not recorded.
