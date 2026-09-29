# 0078. More looks, and the ladders that wear them

2026-09-28. Status: adopted. Follows 0031 and 0070.

## Context
Thirty-five ladders drew their looks from four sound packs (Thuds on twelve of them), eleven
clear effects (Cascade on five), eleven drawn pip shapes (Dots, Blocks, Gems and Rings on five
each), twenty-five faces and four looks for a beaten creature. On 28 September 2026 the owner
asked whether more of each were wanted, and then for the ones proposed: sound packs and clear
effects first, since a pack is a table of voices and an effect a painter over a framework that
exists; icons that survive at a pip's few pixels; a beaten creature crossed out, and one greyed;
and two faces the set lacked, a pixel face and a typewriter. Colour presets were left alone:
decision 0053 rejected the obvious ones by measurement, and the custom palette covers taste.

## Decision
Five packs (Wood, Pluck, Bubbles, Clockwork, Organ), seven effects (Fireworks over the board;
Flip, Spin, Scatter, Float, March and Swarm animating the creatures), five icons (Bolts, Moons,
Drops, Chevrons, Clubs), three beaten looks (crossed out, dimmed and crossed out, greyed) and two
faces (Press Start 2P, which no ladder wears, and Courier Prime). Each new item that fits a
ladder better than what it wore becomes that ladder's default, with the reason beside it in
`looks.ts` or `shapelooks.ts`:

| ladder | was | now |
| --- | --- | --- |
| DOMINOES | Thuds | Wood |
| CONGA LINE | Chimes | Wood |
| AUGUR | Glass | Pluck |
| VALENTINES | Chimes, Confetti | Pluck, Float |
| PETRI DISH | Glass, Dots | Bubbles, Drops |
| DONUT, SPRINKLE DONUT | Chimes | Bubbles |
| GEAR | Thuds, Wipe out | Clockwork, Spin |
| PATROL | Thuds, Wipe across, Crosses, Black Ops One | Clockwork, March, Chevrons, Courier Prime |
| SUDOKU | Glass | Clockwork |
| DUNGEON | Thuds | Organ |
| ORACLE | Glass, Gems | Organ, Moons |
| EXTREME | Burst, Gems | Scatter, Bolts |
| HUGE x EXTREME | Cascade | Scatter |
| CHECKERBOARD | Wipe across | Flip |
| HIVE, ULTRA HIVE | Pop, Burst | Swarm |
| STAR | Sparkle | Fireworks |
| CARD | Gems | Clubs |

CARD keeps Cascade, the card game everyone has watched finish; SEER keeps BLIND's ring, since a
SEER board is a BLIND board with mana; PYRAMID keeps Thuds, stone on stone. A player's `default`
is a deferral (`presentation.ts`), so a player who never chose sees the new default and one who
chose keeps their choice, and a ladder's own settings (0070) are untouched. No rule, record or
measurement moves. A face no ladder wears carries a blurb for its tile, as the legible face's
"easiest to read" always was, and the font windows' Ladder order ends with a group for such faces.

## Consequences
Thuds are worn by eight ladders instead of twelve, Chimes by six, Glass by four, and no pack by
more than eight; no clear effect is worn by more than four; Gems by two instead of five and Dots by
four, though Blocks and Rings still by five. The shapes were checked on their own palettes at a
16 px cell, as every look was. `pips.ts` holds the drawn shapes as a table of tracers, so a shape
is one entry; `victory/departures.ts` holds the six new icon effects; a pack is still a table in
`sfx.ts`, and none of the new voices peaks above 0.28, under the 0.3 the volume gate (`LIMIT_DB`)
was set against. A save naming a new id reads, in a build from before this, as the ladder's
default, as every reader of a presentation setting falls back. The beaten look's parts moved to
the painter (`beatenParts`, `board/paint.ts`), the one place that reads them, to keep
`presentation.ts` under the size a file may run to; the strike's alpha is named
(`STRIKE_ALPHA`) so the test can tell a strike from a greyed creature's halo.
