# 0010. The pencil refuses what the placement rule refuses, and nothing that takes deduction

2026-09-21. Status: adopted.

## Context
A candidate the board has already ruled out (an odd tier on a light square, a non-partner beside a
beaten PAIRS creature, a tier the neighbouring pack has shown, tier 0 on SUDOKU) is noise in the
palette. An auto-candidates convenience, though, would turn Sweep back into a solve button.

## Decision
`Game.noteCandidates` is the whole list, enforced in `toggleNote` so click and keyboard agree, and
it refuses only *adding* a note. The solver reads its domains through the same function. It must
never grow a Sudoku row/column/box rule or anything else that is the player's deduction to make.
Marks are deliberately not gated the same way; that is left open.

## Consequences
The test that matters is that it never refuses the tier a cell really holds
(`test/candidates.test.ts`). The palette strikes through refused tiers for the hovered cell.
