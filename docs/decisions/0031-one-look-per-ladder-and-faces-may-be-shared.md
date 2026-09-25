# 0031. Each ladder's look is one record, and two ladders may share a face

2026-09-24. Status: adopted. Settles issue #5; replaces the one-face-each consequence of 0021.

## Context
A ladder's presentation lived in three tables keyed by its id: the palette in `THEMES` and the
sound and clear effect in `TYPE_IDENTITY` (both `theme.ts`), and the face in `TYPE_FONTS`
(`typefaces.ts`). `test/fonts.test.ts` demanded a face of its own for every ladder, and 24 of the
25 bundled faces were already worn, so a new ladder also meant a new font file, an `@font-face`
and a licence line (issue #5). The refactoring plan's phase 3 asked for one record per ladder and
for the unique-face rule to be decided rather than discovered.

## Decision
`LOOKS` in `src/ui/looks.ts` holds one `LadderLook` per ladder: palette, face, sound pack, clear
effect, each with its reason beside it. The module is DOM-free so the tests can reach it. The
owner decided every ladder names a bundled face, and two may share one: the faces are a set of
looks to choose from, not a registry of identities.

## Consequences
A new ladder is one `LOOKS` entry and needs no new font. `test/fonts.test.ts` checks every ladder
has a look and names a bundled face, and that the legible face stays the player's; it no longer
checks that faces are unique or that every face is worn. The settings screen names a shared face
after the first ladder, in ladder order, that wears it. An id with no look wears NORMAL's.
