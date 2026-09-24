# 0006. The spell row is ordered by price and shortcuts derive from names

2026-09-21. Status: adopted.

## Context
Reveal and Census shipped in the order they were written, which put the dearer spell first, and a
stored order or key is a second place the truth lives.

## Decision
`orderSpells` sorts by cost at the config boundary; `spellKey` takes the name's first letter and the
button shows it in brackets. A test asserts the keys stay distinct and clear of the board's own.

## Consequences
Two spells cannot want the same letter: Echo already collides with Exercise and Scry with Sweep. The
UI checks the board's keys first, so a spell can never shadow Sweep or zoom, but `N` (entry mode) is
not in the test's list.
