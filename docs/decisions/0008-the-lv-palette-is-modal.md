# 0008. Pencil mode arms a tier, is labelled by the mode it is in, and governs the keyboard

2026-09-21. Status: adopted.

## Context
A bare "Notes" toggle looked like a button that did nothing, because one click armed nothing; with
the mode on and no tier, clicks fell through to `game.open`, which can end a run. A digit key always
marked and only Shift pencilled, so switching modes changed clicks but not typing.

## Decision
The toggle reads `Entry: Mark` / `Entry: Pencil`; entering pencil arms tier 1 and hands it back on
exit unless the player chose a tier; pencil mode never falls through to opening; the hint line is
rebuilt on every `refresh()`; digits follow `notesMode` and Shift inverts it for one keystroke. An
armed tier and an armed spell clear each other (issue #3).

## Consequences
Any new input path has to read `notesMode` or it drifts the same way. The tier-0 pencil is hidden
on SUDOKU, where no covered cell can be empty.
