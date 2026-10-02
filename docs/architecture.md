# Architecture

How the code is laid out, which way the data flows, and the few structural rules that everything
else depends on. Read `docs/invariants.md` alongside this.

## The map

```
src/engine/     the rules engine: no DOM, no I/O, no timers
  types.ts        Cell, BoardConfig, the event and block-reason unions
  rng.ts          mulberry32; boards are pure functions of (config, seed)
  combat.ts       damage, EXP, mana rewards, the Progression (level/thresholds)
  grid.ts         cells, neighbours() (the one adjacency function), computeNumbers, masks, and
                  the ORTHO and DIAG steps the generators walk
  shape/          the board shapes: one record per shape, which cells exist and may hold a creature
    rule.ts         ShapeRule, the contract; predicateShape; refuseHexAndWrap
    registry.ts     SHAPES, keyed by every BoardShape; shapeRule()
    fixed.ts        the per-cell predicates: rect, donut, cross, diamond, pyramid, gear,
                  card, heart, star, hexagon, circle
    cave.ts         the ragged cave generator
    floorplan.ts    the dungeon's floor plan: rooms, and one-cell hallways between them
    dungeon.ts      the dungeon map: the budget spent exactly, doorways and their pockets
  generate.ts     dealing the creatures: shape, then placement rule, then numbers; dealGrid,
                  which tries the next seed when a rule refuses one
  opening.ts      choosing the opening and dealing it (`dealOpening`)
  layout.ts       boards from drawings in the catalogue's notation (`Game.fromLayout`)
  notes.ts        pencil marks as a bitmask; notesGuard, which reads one by its lowest candidate
  pencil.ts       what the pencil may offer on a cell, and pencilling or rubbing it out
  spells.ts       the five spells, their prices, the mana economy, spellKey
  cast.ts         what each spell does, behind the SpellHost interface
  augur.ts        Augur's answer: hiddenTiers, and augurNow, which reads it off the ring as it
                  stands
  sweep.ts        Sweep's proof: safeCells and its named proofs; the Sudoku harvest
  sweepgate.ts    how the dial gates Sweep: on, off, or charged by the cells opened by hand
  explore.ts      exploration income: the mana for empty ground the player opens
  reach.ts        the crawl rule: withinReach and computeSealed
  patrol.ts       PATROL's walking creatures: routes, the step after every action, route marks
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
    patrol.ts       square routes that never share a cell, laid biggest first
    sprinkles.ts    pairs free to touch, every creature's place shown; shownCap
  fight.ts        a fight: Exercise's borrowed level, the damage, the kill's EXP, won or lost
  game.ts         the state machine: open, mark, note, sweep, cast, forfeit
  run.ts          Full Run: ten boards, one HP pool
  replay.ts       a board as the moves made on it: replaying them, and a board's fingerprint
  settings.ts     the gameplay dials, their defaults and directions
  config.ts       reads ladders.json rows into BoardConfig; has each placement rule check its row
src/ui/         the game in the browser
  app.ts          the router: screens, the cross-screen state, the keyboard, the actions
  teaching.ts     the tutor, the rules card, the field guide and the school's lessons, for app.ts
  dress.ts        the page in the presentation settings: the faces, the text size, the board's slice
  dom.ts          the DOM helpers: el(), link(), and the OverlayCard a modal shows
  words.ts        plural() and easierSentence(): wording the screens and the codes share (DOM-free)
  mute.ts         the always-present speaker
  ladders.ts      the ladder data, bundled into the build (src/data.ts is Node's loader), each
                  ladder's name and the menu's category names
  version.ts      the game's version, read from package.json (decision 0068)
  screens/        one builder per screen: ladders, boards, howto, backup, guide, school, about
  overlays/       ask.ts: the in-page yes/no question (never window.confirm); crash.ts: the card
                  for an error nothing caught; modal.ts: the one modal overlay up at a time, and
                  the ones the menus open
  guide/          the field guide's words, in the catalogue's shape: entries.ts (the tricks, the
                  diagrams, guessing), ladders.ts (each ladder's note)
  school/         the school: lessons.ts (the lessons, as data), run.ts (one being taken)
  game/           the game screen: screen.ts (furniture), hud.ts (filling it in), mode.ts
                  (what a click will do: tier, pencil, spell), actions.ts (what the player's
                  clicks and keys do), hintline.ts (the line under the board), sound.ts, flash.ts
                  (the shake, the rim and the level-up glow), clock.ts, keeper.ts (the board kept
                  as a paused game, move by move, and taken up again), recorder.ts (what the board
                  is costing, tallied move by move: opens, guesses, HP), ending.ts (how a board
                  ends: the record, the overlay, the clear effect), outcome.ts (the clear, loss
                  and run overlays), tutor.ts (the tutor's face: the proof it points at, the hint
                  line's words, the hints asked)
  board/          the canvas: view.ts (state, fit, zoom, render order), geometry.ts,
                  digits.ts, paint.ts (cell painters), overlays.ts (silhouette, seams, bonds,
                  highlight), input.ts (pointer, wheel, pinch)
  presentation.ts  the presentation settings: each one's options, its default and its reader
                  (DOM-free)
  ladderown.ts    a ladder's own presentation settings: which can be, and reading a save's
                  (decision 0070)
  settings.ts     the settings store, and what each presentation setting resolves to on a ladder
  telemetry.ts    the play statistics: what each board cost, their code, and their reading
                  (DOM-free)
  telemetrystore.ts  the play statistics in storage, their own key, never in the save code
  settingsscreen/  the settings form: context, widgets, render, screen, and its sections: look.ts
                  and effects.ts (the Presentation rows: what is drawn, and what plays itself),
                  board.ts (more of the Presentation rows), interface.ts (the page around the
                  board, and fullscreen), sound.ts, gameplay.ts (the dials, the chord, the tutor),
                  presets.ts (the bundles), scope.ts (for every ladder or this one alone);
                  symbols.ts is the custom creature icon's window of symbols, colormixer.ts the
                  sliders that mix a colour from red, green and blue and the form a colour window
                  is built on, customcolor.ts the mark and highlight colour rows and their custom
                  colour window, customtiers.ts the custom creature colours'
                  window, a swatch for each tier, soundcheck.ts the sound check's window and
                  pianoroll.ts its keyboard, sorts.ts the orders the palette and font windows
                  offer
  preview.ts      the settings screen's example boards (no rendering, so tests can build them)
  looks.ts        one record per ladder: palette, face, sound pack, clear effect (DOM-free)
  shapelooks.ts   the shape ladders' records, spread into looks.ts's table; apart only for size
  looktypes.ts    what a look is made of: the pip shapes, the palette, sound packs, clear effects
  theme.ts        the global colours and the picker's names
  creature.ts     drawing a creature: its pips as a die face, its tier as a digit, or both
  pips.ts         the drawn pip shapes: their names, and the path each traces
  tiercolors.ts   the colour of each creature tier and the halo of tiers 6 to 9, and the presets
                  (DOM-free)
  colorspace.ts   a colour's numbers: hex, red, green and blue, and CIELAB for how different two
                  look
  pipsymbols.ts   the symbols a pip can be drawn as: Dingbats and Wingdings 1 to 3, from
                  pipsymbols.json, drawn in the faces in pipfont/ (DOM-free)
  typefaces.ts    the bundled faces, and the kind of face each is
  progress.ts     the save: clears, best times, unlocks
  savefile.ts     the save in storage, its keys and the set-aside copy of one it cannot read; the
                  CS1: backup code and the envelope the play statistics' code shares with it
  paused.ts       the paused games: one per board, one run per ladder, each its own storage key
  sfx.ts          synthesised sound packs
  victory/        the board-clear effects: play.ts runs one, stage.ts is what they share,
                  ambient.ts paints over the board, icons.ts and departures.ts animate its creatures
  pinch.ts, hexgeom.ts   arithmetic kept DOM-free so tests can reach it
src/sim/        headless measurement, all driving the real engine (see docs/tuning.md)
  honest.ts       the honest player: sees what a player sees, deduces locally, guesses or casts
  deduce.ts       what the honest player concludes: constraints, what is safe, where to guess
  solver.ts       the complete deducer, the floor under the honest player's forced guesses
  search.ts       the complete deducer's search: bounds propagation, tier counts, one layout
  autoplay.ts     the omniscient tier-order player that proves the zero-damage guarantee
  graded.ts       the graded player: a person's tricks up to a grade, one pass at a time, and
                  what each board demanded (Milestone 4, docs/human-tuning-plan.md)
  reader.ts       what the graded player can see, the sum arithmetic its tricks share, and the
                  readings the honest player shares with it
  masks.ts        tiers as masks, as the instruments hold a cell's candidates
  tricks.ts       the tricks: one technique per entry of docs/strategies.md, at its grade
  aim.ts          where the graded player casts Augur: the number whose answer likeliest frees a
                  cell
  tricktext.ts    what each trick is called and what it says, for the tutor, the school and the
                  guide
  tutor.ts        the tutor: the next provable move on the board as it stands, and why
  captions.ts     the tutor's captions: each proof in a sentence, with its numbers filled in
  diagrams.ts     the catalogue's diagrams as boards, for its test and the field guide
  scaffold.ts     a dungeon's corridors, doorways and pockets, read off the silhouette
  tables.ts       what the commands share: the seed of each board, averages, a board range
  cli/            one command-line entry per measurement, run on import
src/data.ts     Node-only loader for ladders.json; CS_LADDERS points it at a candidate file
src/main.ts     browser entry; window.cs in dev
test/           vitest. A file directly in test/ is DOM-free and compiled by the second typecheck
                pass, as the engine is; one per rule or module, plus the specs that cut across
                them (invariants, scaling, placement, shape). helpers.ts holds the shared
                fixtures: the ladder data, the seed lists, the boards the tricks are tested on,
                hand-built boards. test/ui/ runs in happy-dom: each file opens with its
                environment line and imports setup.js, and drives the app through driver.ts.
                test/golden/ holds the sim fingerprints.
scripts/        golden.mjs (the golden harness), package.mjs (the itch.io zip), playtest.cmd
                (double-click to build, zip and open the build in the browser), pip_symbols.py
                (cuts the symbol faces in src/ui/pipfont/ from open fonts)
design/         ladder_types.toml (each ladder's schedules), ladders.py (the generator) and
                test_ladders.py (its own tests, `npm run test:py`),
                data/ (its output), and the design reference: page.template.html, built by
                build.py into reference.html, which says so on its first line
docs/           this folder
```

## Four rules the layout enforces

**The engine is headless and must stay that way.** Over every import in `src/`, `src/engine`
imports nothing outside itself; `src/sim` imports nothing from `src/ui` but the play statistics'
reader (`src/ui/telemetry.ts`, DOM-free), which `cli/telemetry.ts` decodes a report with; and
`src/ui` imports from `src/sim` only what teaches (the tutor and the reading it rests on, the trick
text, the catalogue's diagrams), never an instrument. `npm run typecheck` runs `tsc` twice on
purpose: the second pass uses `tsconfig.engine.json`, which compiles the engine, the sims and the
tests outside `test/ui/` with **no DOM library at all**, so a stray `window` is a build error
rather than something discovered when it fails to run in Node. Anything such a test imports
therefore has to be DOM-free too, which is why `preview.ts` builds boards and renders nothing, why
`pinch.ts` and `hexgeom.ts` are separate from `board/view.ts`, and why the per-ladder looks are in
`looks.ts`, apart from the canvas drawing in `creature.ts`.

**Adjacency lives in exactly one function**: `neighbours()` in `src/engine/grid.ts`. Numbers,
cascades, the opening, Sweep's proofs, Census, the crawl rule and the honest player all read
through it. That is why hex grids, wrapped edges and cut-out shapes each cost almost nothing in the
engine. Anything that *iterates* the grid instead (creature placement, the search-mode empty count,
`safeCells`, the renderer) is where a new board feature actually costs work. A hole (`present:
false`) neighbours nothing in both directions, guarded at the top of `neighbours()`.

**A placement rule or a shape is asked, never named.** Everything that differs between placements
is a member of the rule's `PlacementRule` record: its config check, its deal, what the pencil may
offer, Sweep's proofs, what the renderer draws, and what the instruments need. The generator,
`safeCells`, `noteCandidates`, the renderer, the hint, the honest player and the solver call
`placementRule(config.placement)` and never compare the name, so a new rule reaches all of them
by existing. `Placement` is `RULES`'s keys, so a name without a rule cannot exist, and a rule
missing a hook is a compile error (decision 0029). Shapes work the same way through
`shapeRule(config.shape)` and `SHAPES` in `src/engine/shape/` (decision 0030).

**Tuning data flows one way**: `design/ladders.py` reads the schedules in
`design/ladder_types.toml` and writes `design/data/ladders.json`, `config.ts`
reads it, and the engine never duplicates a number from it. `ladders.py` does carry its own copy of
the shape predicates, because it must count a shape's cells before it can apportion creatures;
that duplication is guarded by a test that the engine's mask leaves exactly the cell count the
ladder recorded. CI regenerates the JSON and fails on any difference.

## How a board is born

`Game.create(config, seed)`, through `dealGrid`, which tries the seed after if the placement rule
refuses this one, up to five (decision 0081):

1. `generateGrid` makes the cells, then cuts them with the shape (`ShapeRule.build`). Every shape
   but the cave and the dungeon is a per-cell predicate; those two are grown from the seed to an
   exact cell count that the ladder chose (`shapeParam`), because `C_k` needs the quota fixed
   before the board exists.
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

`Game.fromLayout(truth, shown, options)` is the other way in, for the school's lessons, the field
guide's diagrams and the tests: a board drawn in the catalogue's notation (`docs/strategies.md`),
what is there and what the player sees. Nothing is dealt and no opening is chosen; the config is
counted off the drawing with every threshold at `C_k` exactly, and `layout.ts` refuses a drawing
the game could not be showing, such as a number its neighbours do not add up to or an open 0
beside a covered cell.

## How a click flows

`BoardInput` (in `src/ui/board/input.ts`) turns pointer events into the view's four callbacks
(open, mark, hover, and whether a click would land). `BoardActions` (`game/actions.ts`) decides
what the click, or a key, means from the `EntryMode` (an armed tier, pencil mode, an armed spell)
and makes it a `Move` (`src/engine/replay.ts`): an open, a mark, a note, a sweep, a chord, a cast or
a wait. The move goes through `BoardRecorder` (`game/recorder.ts`), which tallies what the board
is costing for the play statistics, and `BoardKeeper` (`game/keeper.ts`), which keeps it for the
paused game, to `playMove`, which calls the one engine method it names: `game.open`,
`game.setMark`, `game.toggleNote`, `game.sweep`, `game.sweepAt`, `game.cast` or `game.wait`.
Every engine action returns the events it caused (`GameEvent[]`: revealed, battle, levelUp,
marked, noted, blocked, won, lost, spell, exercised, moved), and they come back up the same way.
`App.apply` hands them to the stage's flashes (`game/flash.ts`), the sound (`game/sound.ts`), the
celebration and the HUD (`game/hud.ts`); the renderer repaints from the grid. The engine holds
no clock: the UI owns elapsed time, and when a countdown runs out (Time Attack or a time limit) it
reports that back through `game.forfeit`.

A Full Run is engine state, not UI state: `FullRun` in `run.ts` owns the ten-board sequence, the
HP pool and the heal, and `App` only ever renders `run.game`, an ordinary `Game`. That is why a
run needed no changes to input, rendering, Sweep, spells or the HUD, and why `npm run sim:run` can
play whole runs headlessly.

## Settings

Two halves that behave completely differently. `src/engine/settings.ts` holds the **gameplay
dials**: they change rules, so they are engine state, and they decide whether a board counts for
a record (`isAtLeastAsHard`: harder records, easier records nothing, unlocks included).
`src/ui/presentation.ts` holds the **presentation settings** (what each is, its options, its
default, its reader) and `src/ui/settings.ts` the store and what each resolves to on a ladder;
none of those touches a rule. A ladder can have the look and sound of its board of its own:
`Settings.presentationFor(typeId)` resolves a ladder, and every reader of such a setting goes
through it (decision 0070). `settingsscreen/` is the form, built detached and handed back to `App`.

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
