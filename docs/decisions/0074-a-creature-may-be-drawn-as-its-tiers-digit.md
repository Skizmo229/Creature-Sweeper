# 0074. A creature may be drawn as its tier's digit

2026-09-28. Status: adopted. Amends 0012's consequence.

## Context
A creature is a die face of its tier, and counting seven pips at a small cell size is the
hardest read on HUGE. Decision 0012 retired a setting that wrote the tier over the glyph on
hover, because it could not share the cursor with the number under a beaten creature.

## Decision
`glyph` is a presentation setting: the pips, the tier as a digit in the tier's colour over the
dark outline every annotation wears, or the pips with the digit in the corner. `drawCreature`
takes a `CreatureLook`, the style and the face, and the clear effects' atlas draws with the same
look through `Settings.victoryLook`. Drawn always, it shares nothing with the cursor; only a
beaten creature is ever drawn, so it tells nothing the pips did not.

## Consequences
A gilded tier's halo rings the digit as it rings the pips. The settings screen's examples and
the field guide's diagrams draw in the style chosen, as they draw in the chosen icon. The pip
count is still what the tutor's captions say ("the beaten 3"), whatever is drawn.
