# 0001. Code with no caller is removed, not kept for later

2026-09-24. Status: adopted.

## Context

The codebase kept a number of functions, fields and commented-out blocks deliberately, each with
a comment explaining that it was not dead code waiting to be wired up but a distinction worth
preserving, or a feature parked for a comeback. A reviewer reading the code cold could not tell
those from ordinary leftovers, and every one of them was a place to wonder whether it mattered.
The Milestone 3 review (`docs/refactoring-plan.md`, section 3.5) listed them; `knip` now finds
them mechanically.

## Decision

Anything with no caller is removed. Git history keeps the code; this record keeps the reasons the
original comments gave, so the distinction each one guarded survives without the code.

Removed in the commit that adopts this record:

- **`highestNote` (`src/engine/notes.ts`).** The strongest tier in a pencil mask. It had no caller
  *on purpose*: reading notes permissively ("every candidate is within my level, so the cell is
  safe") shipped briefly and was wrong, because a note means "the tiers I have not ruled out",
  not a claim about the cell. Sweep must only ever read notes conservatively, through
  `lowestNote`. Removing the function makes the permissive reading something to write, not
  something to reach for. See `docs/invariants.md` when it exists; until then, the `notes` field
  docblock in `src/engine/types.ts`.
- **`withNote`, `withoutNote`, `noteCount`, `soleNote` (`src/engine/notes.ts`).** Set helpers
  nothing used. `toggleNote` is the one write path.
- **`Game.started` (`src/engine/game.ts`).** "Has the player acted on this board at all", kept
  because only the engine can answer it. It must never be what starts the clock: the clock starts
  when the board is dealt, because the dealt opening is board information the player reads first.
  If a feature needs the distinction, re-derive it in the engine and keep that rule.
- **`hoverDefeated`, `HoverDefeated`, `HOVER_DEFEATED_NAMES`, `isPipShape`, `drawTierBadge`, and
  the commented-out settings row and draw branches** (`src/ui/settings.ts`, `boardview.ts`,
  `settingsscreen.ts`, `app.ts`). The "hovering a creature you have beaten" setting, disabled
  when hover began showing the number under a beaten creature instead. Its saved value stays in
  old saves as an unread key, which the settings reader ignores; no migration is needed. If it
  comes back, the design it encoded was: draw the level in the tier's own colour so it can never
  be misread as the cell's number, and let one option restyle the hovered glyph's pip shape.
- **`seedFromString` (`src/engine/rng.ts`), `hasFullRun` (`run.ts`), `fullRunHp` and
  `allBoards` (`config.ts`), `neighbourCount` (`board.ts`), `mixHex` (`src/ui/theme.ts`).**
  Utilities with no caller.
- **`src/engine/index.ts`.** A barrel nobody imported; every consumer imports engine modules
  directly, which is also what the dependency graph in the plan measures.

## Consequences

`knip` runs in `npm run check` and fails on any export with no consumer, so the list cannot grow
back silently. The cost is that a future feature which wants one of these re-adds it from history
rather than finding it in place; the reasons above are what it needs to re-add it correctly.
