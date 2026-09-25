# Architecture

How the code is laid out, which way the data flows, and the few structural rules that everything
else depends on. Read `docs/invariants.md` alongside this; the two together are what CLAUDE.md used
to be.

## The map

```
src/engine/     the rules engine: no DOM, no I/O, no timers
  types.ts        Cell, BoardConfig, the event and block-reason unions
  rng.ts          mulberry32; boards are pure functions of (config, seed)
  combat.ts       damage, EXP, mana rewards, the Progression (level/thresholds)
  grid.ts         cells, neighbours() (the one adjacency function), computeNumbers, masks
  shape/          the board shapes: one record per shape, which cells exist and may hold a creature
    rule.ts         ShapeRule, the contract; predicateShape; refuseHexAndWrap
    registry.ts     SHAPES, keyed by every BoardShape; shapeRule()
    fixed.ts        the per-cell predicates: rect, donut, cross, diamond
    cave.ts         the ragged cave generator
    dungeon.ts      the dungeon map: rooms, one-cell hallways, doorways and their pockets
  generate.ts     dealing the creatures: shape, then placement rule, then numbers
  opening.ts      choosing the opening
  notes.ts        pencil marks as a bitmask
  spells.ts       the four spells, their prices, the mana economy, spellKey
  cast.ts         what each spell does, behind the SpellHost interface
  sweep.ts        Sweep's proof: safeCells and its named proofs; the Sudoku harvest
  reach.ts        the crawl rule: withinReach and computeSealed
  placement/      the placement rules: one record per rule, and nobody else names one
    rule.ts         PlacementRule, the contract every rule meets
    registry.ts     RULES, keyed by every Placement; placementRule()
    deal.ts         the shuffle-and-take and the other pieces of a deal the rules share
    uniform.ts      the original: shuffle and take
    sudoku.ts       the Sudoku placement and its guess-free generator
    checker.ts      the checkerboard placement: colour fixes a tier's parity; hiddenCap
    pairs.ts        the pairing placement: non-touching dominoes; ringIsFree
    dominoes.ts     pairs dealt as a full domino set
    packs.ts        non-touching packs of one-of-every-tier; missingFrom
    congo.ts        packs strung into orthogonal lines led by the top tier
  game.ts         the state machine: open, mark, note, sweep, cast, forfeit, fight
  run.ts          Full Run: ten boards, one HP pool
  settings.ts     the gameplay dials, their defaults and directions
  config.ts       reads ladders.json rows into BoardConfig; has each placement rule check its row
src/ui/         the prototype
  app.ts          the router: screens, the cross-screen state, the keyboard, the actions
  dom.ts          el(), the one DOM helper
  mute.ts         the always-present speaker
  screens/        one builder per screen: ladders, boards, howto, backup
  overlays/ask.ts the in-page yes/no question (never window.confirm)
  game/           the game screen: screen.ts (furniture), hud.ts (filling it in), mode.ts
                  (what a click does: tier, pencil, spell), hint.ts, sound.ts, clock.ts,
                  outcome.ts (the clear, loss and run overlays)
  board/          the canvas: view.ts (state, fit, zoom, render order), geometry.ts,
                  digits.ts, paint.ts (cell painters), overlays.ts (silhouette, seams, bonds,
                  highlight), input.ts (pointer, wheel, pinch)
  settings.ts     the presentation settings and the store
  settingsscreen/ the settings form: context, widgets, look, effects, gameplay, screen
  preview.ts      the settings screen's example boards (no rendering, so tests can build them)
  looks.ts        one record per ladder: palette, face, sound pack, clear effect (DOM-free)
  theme.ts        the global colours, the picker's names, creature glyphs
  typefaces.ts    the bundled faces
  progress.ts     the save: clears, best times, unlocks
  savefile.ts     the CS1: backup code
  sfx.ts          synthesised sound packs
  victory.ts      the board-clear effects
  pinch.ts, hexgeom.ts   arithmetic kept DOM-free so tests can reach it
src/sim/        headless measurement, all driving the real engine (see docs/tuning.md)
src/data.ts     Node-only loader for ladders.json; CS_LADDERS points it at a candidate file
src/main.ts     browser entry; window.cs in dev
test/           vitest; test/helpers.ts holds the shared fixtures (the ladder data, the seeds,
                hand-built boards); test/golden/ the sim fingerprints; test/ui/ the
                browser-environment smoke test (happy-dom)
scripts/        golden.mjs (the golden harness), package.mjs (the itch.io zip)
design/         ladders.py (the generator) and test_ladders.py (its own tests, `npm run test:py`),
                data/ (its output), the design reference page
docs/           this folder
```

## Four rules the layout enforces

**The engine is headless and must stay that way.** Over every import in `src/`, `src/engine`
imports nothing outside itself; `src/sim` never imports `src/ui`; `src/ui` never imports
`src/sim`. `npm run typecheck` runs `tsc` twice on purpose: the second pass uses
`tsconfig.engine.json`, which compiles the engine, the sims and the tests with **no DOM library at
all**, so a stray `window` is a build error rather than something discovered when it fails to run
in Node. Anything a test needs to import therefore has to be DOM-free too, which is why
`preview.ts` builds boards and renders nothing, why `pinch.ts` and `hexgeom.ts` are separate from
`boardview.ts`, and why the per-ladder looks are in `looks.ts` rather than `theme.ts`.

**Adjacency lives in exactly one function**: `neighbours()` in `src/engine/grid.ts`. Numbers,
cascades, the opening, Sweep's proofs, Census, the crawl rule and the honest player all read
through it. That is why hex grids, wrapped edges and cut-out shapes each cost almost nothing in the
engine. Anything that *iterates* the grid instead (creature placement, the search-mode empty count,
`safeCells`, the renderer) is where a new board feature actually costs work. A hole (`present:
false`) neighbours nothing in both directions, guarded at the top of `neighbours()`.

**A placement rule or a shape is asked, never named.** Everything that differs between placements is a
member of the rule's `PlacementRule` record: its config check, its deal, what the pencil may
offer, Sweep's proofs, what the renderer draws, and what the instruments need. The generator,
`safeCells`, `noteCandidates`, the renderer, the hint, the honest player and the solver call
`placementRule(config.placement)` and never compare the name, so a new rule reaches all of them
by existing. `RULES` is keyed by the whole `Placement` union, which makes a name without a rule,
or a rule missing a hook, a compile error (decision 0029). Shapes work the same way through
`shapeRule(config.shape)` and `SHAPES` in `src/engine/shape/` (decision 0030).

**Tuning data flows one way**: `design/ladders.py` writes `design/data/ladders.json`, `config.ts`
reads it, and the engine never duplicates a number from it. `ladders.py` does carry its own copy of
the shape predicates, because it must count a shape's cells before it can apportion creatures;
that duplication is guarded by a test that the engine's mask leaves exactly the cell count the
ladder recorded. CI regenerates the JSON and fails on any difference.

## How a board is born

`Game.create(config, seed)`:

1. `generateGrid` makes the cells, then cuts them with the shape (`ShapeRule.build`). Every shape
   but the cave and the dungeon is a per-cell predicate; those two are grown from the seed to an exact cell count that
   the ladder chose (`shapeParam`), because `C_k` needs the quota fixed before the board exists.
   The dungeon also returns which cells are room floor (the only cells a creature may stand on).
2. The placement rule deals the tiers into the spawnable cells (`PlacementRule.deal`). Uniform is
   shuffle-and-take; the checkerboard keeps one pool per colour; pairs and packs pick *where*
   first and deal into those cells; dominoes and packs deal their own tiers because their
   grouping must survive the deal; sudoku fills a solved grid. A placement never changes the
   quantities.
3. `computeNumbers` writes every cell's number through `neighbours()`.
4. The opening rule reveals the first cells, and the clock starts.

Connectivity is asserted, not assumed: the opening reveals one region, so a fragmented board
would leave the rest unreachable.

## How a click flows

`BoardInput` (in `src/ui/board/input.ts`) turns pointer events into the view's four callbacks
(open, mark, hover, and whether a click would land). `App` decides what the click means from its
`EntryMode` (an armed tier, pencil mode, an armed spell) and calls one engine method: `game.open`,
`game.setMark`, `game.toggleNote`, `game.cast` or `game.sweep`. Every engine action returns the
events it caused (`GameEvent[]`: revealed, battle, levelUp, marked, noted, blocked, won, lost,
spell, exercised). `App.apply` hands them to the sound (`game/sound.ts`), the celebration and the
HUD (`game/hud.ts`); the renderer repaints from the grid. The engine holds no clock: the UI
owns elapsed time, and Time Attack reports expiry back through `game.forfeit`.

A Full Run is engine state, not UI state: `FullRun` in `run.ts` owns the ten-board sequence, the
HP pool and the heal, and `App` only ever renders `run.game`, an ordinary `Game`. That is why a
run needed no changes to input, rendering, Sweep, spells or the HUD, and why `npm run sim:run` can
play whole runs headlessly.

## Settings

Two halves that behave completely differently. `src/engine/settings.ts` holds the **gameplay
dials**: they change rules, so they are engine state, and they decide whether a board counts for
a record (`isAtLeastAsHard`: harder records, easier records nothing, unlocks included).
`src/ui/settings.ts` holds the **presentation settings** and the store; none of those touches a
rule. `settingsscreen.ts` is the form, built detached and handed back to `App`.

## Where knowledge lives

| Kind of knowledge | Home |
| --- | --- |
| What a function does and its contract | its docblock |
| Why it is done that way, in a paragraph | beside the code |
| The history: what was tried, what changed, what was asked for | `docs/decisions/` |
| What each mode's rule is, what it proves, what it must never do | `docs/modes.md` |
| What was measured, and the open tuning questions | `docs/tuning.md` and the design reference |
| Presentation rules (fonts, effects, settings galleries) | `docs/ui.md` |
| How to add a spell, a rule, a shape, a ladder, a setting | `docs/extending.md` |
| Vocabulary | `docs/glossary.md` |
| The notes all of the above were condensed from, verbatim and unmaintained | `docs/archive/` |

The design reference (`design/page.template.html`, built to `reference.html` by
`design/build.py`) is where design *findings* are written up in full; `reference.html` is
generated and never hand-edited.

## Dev conveniences

`window.cs` in dev exposes the running `App`: `cs.play('donut', 1)`, `cs.current` (the game),
`cs.sync()`, `cs.cellSize`, `cs.runFull('normal')`, `cs.currentRun`. Stripped from production
builds. Private methods are reachable at runtime, which is how a UI change can be verified from
the console without clicking.

The web build ships to itch.io: `base: './'` in `vite.config.ts` because itch serves from a
per-upload subfolder, and `npm run package` zips `dist/` with `index.html` at the root and refuses
a build with absolute paths.
