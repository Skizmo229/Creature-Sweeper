# 0076. The mark colour is the player's, from measured presets or their own

2026-09-28. Status: adopted. Follows 0050 and 0053.

## Context
A mark was the green of the original, and so were the pencil notes, the seam of a wrapped board
and, by default, the cursor highlight (0050). The other annotations each have a colour of their
own (0032): a given's gold, a Census's blue, an Augur's cream, the tutor's violet and the red of
a refused click. A player asking for another mark colour would be choosing against all five.

## Decision
`markColor` is a presentation setting: the green, three presets, or any colour from the custom
window. The presets were measured on 28 September 2026 by the method of 0050 against the five
annotation colours, and each stands at least `NEAR_TAKEN` from every one: lime is 57 from the
nearest, magenta 49 and blue 42, where white sits 23 from the cream, yellow 26 from the gold and
cyan 17 from the blue, so those three are not offered. The custom window, generalised to take
its legend and the colours it warns near from the setting that opens it, says which of the five
a mixed colour comes close to. The pencil note is the mark colour dimmed, the seam wears it, and
the highlight follows it until it has a colour of its own.

## Consequences
The highlight row's default tile says "the mark colour" once that is not the green. A mark
colour near a palette's `hot` is not warned about, as the green itself is 21 from CROSS's; the
mark's dark outline is what carries it on any tile. The measurement is in the constant's
docblock and `test/ui/markcolor.test.ts` holds the presets to the threshold.
