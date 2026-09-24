# 0021. Every ladder has a bundled typeface, and the title wears Griffy

2026-09-22. Status: adopted.

## Context
Five system stacks could not give twenty-four distinct looks, and Georgia had old-style figures
that made numbers jump on the board.

## Decision
Twenty-four Latin woff2 faces from Google Fonts in `src/ui/fonts/`, plus Atkinson Hyperlegible
Next for anyone who wants the easiest one, plus Griffy for the title alone (reached only by a
forced face). A face must have lining figures. Each carries the weight the board draws at; digits
are sized to measured height and centred on measured ink; the interface uses
`font-size-adjust: ex-height 0.52` with per-face corrections for OS/2 tables that lie.

## Consequences
Adding a face means the file, `@font-face`, the board weight and the licence line, all checked by
`test/fonts.test.ts`, which also demands a unique face per ladder (issue #5). No glyph in the
chrome can be assumed: words and inline SVG, not symbol characters. Old saves' retired font ids are
migrated on read.
