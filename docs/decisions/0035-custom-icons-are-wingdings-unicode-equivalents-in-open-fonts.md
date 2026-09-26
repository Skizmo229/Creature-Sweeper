# 0035. Custom icons are Wingdings' Unicode equivalents, drawn in open fonts

2026-09-25. Status: adopted.

## Context
The owner asked for a Custom option under Creature icons: a window to pick the pip from all of
Dingbats, Wingdings, Wingdings 2 and Wingdings 3. The Wingdings fonts are Microsoft's and cannot
ship in a freeware build, and the chrome may assume no glyph it does not bundle (`docs/ui.md`).
Since Unicode 7.0 every Wingdings character has a Unicode equivalent, and Dingbats is the Unicode
block of that name. The table of equivalents was taken from the Wikipedia articles' charts
(September 2026); every name there matched Python's Unicode database. Of the 783 distinct code
points, Noto Sans Symbols 2 draws 691, Noto Sans Symbols 75 more, the monochrome Noto Emoji 12 and
Noto Sans 4, all SIL OFL 1.1.

## Decision
The pip can be a symbol, stored in `icons` as its code point (`U+2764`), beside the seven drawn
shapes. The symbols are drawn from those four fonts, each cut down to the symbols it supplies and
declared as one family with a unicode-range per face, so no symbol has two faces and none falls
through to a system font. Two are left out: Wingdings' Windows logo (0xFF), which has no code point
and is a trademark, and Wingdings 2's circled reverse solidus (0x58, U+29B8), which none of the
four draws. That leaves 782.

## Consequences
The table (`src/ui/pipsymbols.json`) is the source; `scripts/pip_symbols.py` rebuilds the faces
from it, and fails if any symbol is in none of the sources. Adding a symbol, or U+29B8 once an open
face with it is bundled (Noto Sans Math has it), means an entry in the table and a rebuild.
`test/pipsymbols.test.ts` holds the table, the faces and the licences together. A save naming a
symbol reads, in a build from before this, as an unknown pip, which `drawCreature` draws as dots.
