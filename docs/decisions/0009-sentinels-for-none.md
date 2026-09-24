# 0009. markMode is -1 for "none", and a notes mask of 0 means "no notes"

2026-09-21. Status: adopted.

## Context
Tier 0 became a real palette choice when pencil marks arrived ("this might be empty ground" is the
candidate that makes a set safe at LV1), so 0 could no longer mean "nothing selected". An empty
note mask read as a bound would say a cell is both provably safe and certainly fatal.

## Decision
`markMode` is -1 for none. Every reader of `notes` checks `hasNotes` first; `lowestNote` returns
-1 rather than a sentinel that would pass a comparison.

## Consequences
Anything testing `if (this.markMode)` is wrong in a way that silently arms the empty-ground pencil.
