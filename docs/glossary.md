# Glossary

The vocabulary the code, the tests and the design notes use, one paragraph each, with the module
that owns the idea. Terms are grouped, not alphabetical, because most of them only make sense
next to their neighbours.

## The game

**Cell.** One square (or hexagon) of a board. It holds a tier, a number, and the player's
annotations. `Cell` in `src/engine/types.ts`.

**Tier.** A creature's power level, 1 and up; tier 0 is empty ground. A cell's tier is hidden
until the cell is opened.

**Number.** What an opened empty cell shows: the **sum** of its neighbours' tiers, not a count of
creatures. See `docs/invariants.md`, fact 4.

**Level (LV).** The player's level. A fight against a creature of tier at most your level is free:
one round, no damage. Above it, damage follows a staircase, `E * (ceil(E / L) - 1)` for tier `E`
at level `L`. `src/engine/combat.ts`.

**EXP and thresholds.** Killing a creature pays its tier in EXP. The thresholds to each level are
per board and come from the ladder data (`exp` in `BoardConfig`). See **tuning identity**.

**HP.** The player's hit points for one board, or one Full Run. A guess budget, not a combat
resource: see `docs/invariants.md`, fact 2.

**Mana.** Spell currency, earned per kill and per empty cell explored. `src/engine/spells.ts`.

**Opening.** The cells revealed before the first move. `'auto'` reveals the zero-region whose
cascade uncovers the most cells; `'none'` reveals nothing; `'empties'` reveals every empty cell
(SUDOKU only). `findBestOpening` in `src/engine/opening.ts`. The clock starts when the opening is
dealt, because reading it is the first thing the player does.

**Cascade.** Opening a cell whose number is 0 opens its neighbours, recursively.

**Mark.** A player's claim that a covered cell holds a given tier. A mark above your level blocks
clicks on that cell (the **mark guard**). Marks feed mark-assisted Sweep by subtraction.

**Pencil mark / note.** A set of tiers the player has not ruled out for a cell, held as a bitmask
(`Cell.notes`, bit `t` for tier `t`; bit 0 is empty ground). Never a claim. Read in one direction
only: if the lowest candidate is above your level, the cell is guarded. `src/engine/notes.ts`.

**Given.** A mark the board dealt rather than the player wrote: a SUDOKU clue, or the answer to a
Reveal. Drawn gold, unerasable, and a fact rather than a claim. `Cell.given`.

**Census.** The count of creatures among a cell's neighbours, once the Census spell has been cast
on it. `Cell.census`. Sum plus count usually pins a layout.

**Sweep.** Opens every cell the engine can prove safe. **Strict** Sweep uses only facts (numbers,
open tiers, givens, Census, the placement proofs). **Assisted** Sweep also trusts the player's
marks. **Charged** Sweep (the default) is rationed: ten hand-opened cells buy one sweep.
`Game.safeCells`, `Game.sweep`.

**Spells.** Census (30 mana, counts a cell's creature neighbours), Reveal (75, tells you a cell's
tier as a given and opens the empty ground around it), Exercise (150, lends a level to the next
fight), Beacon (300, opens the largest untouched zero-region). `src/engine/spells.ts`. WORKOUT
prices Exercise by its own rule (`WorkoutRule`).

**Search board.** A board won by uncovering every empty cell rather than by killing every
creature (BLIND, HUGE x BLIND). No level economy.

**Reach / the crawl rule.** On DUNGEON, a cell may only be opened, or targeted by a spell, within
`reach` steps of already-open ground, counted as a walk through `neighbours()`. Marking and
pencilling are exempt. `Game.inReach`; the exception is `Game.sealedIn`.

## Boards and ladders

**Game type / ladder.** One of the 24 named modes (EASY, NORMAL, DUNGEON, ...). Each is a ladder
of ten tuned boards plus a **continuation** (boards 11 to N, held in `extended`, never in
`boards`). `LadderType` in `src/engine/config.ts`.

**Board.** One position on a ladder: a `BoardConfig` (size, tiers, quantities, HP, thresholds,
shape, topology, wrap, placement, spells...) plus a seed. Boards are pure functions of (config,
seed).

**Schedule.** A ladder's per-board values for one dial (density, lock, HP, size, alpha0...),
written as ten-element lists in `design/ladder_types.toml`.

**Density.** Creatures divided by present cells. 34% is the battle ceiling the game treats as
the point a board stops being a puzzle; a few ladders sit past it for stated reasons.

**Distribution / archetype.** How the creature budget is split across tiers: `descending`
(commoner low tiers) or `flat`. `quantity` in `BoardConfig`, index 0 is tier 1.

**Lock depth.** How many of a board's top thresholds equal `C_k` exactly. See **tuning
identity**.

**`C_k`.** The total EXP available from every creature of tier at most `k`. `cumulativeExp`.

**Tuning identity.** The upper thresholds equal `C_k` exactly. `docs/invariants.md`, fact 1.

**Zero-damage guarantee.** Every board is clearable without losing HP. `docs/invariants.md`,
fact 2.

**`alpha0`.** The scale of the first, unlocked threshold as a share of `C_1`; the schedule that
decides how fast the early levels come.

**Topology.** Square (eight neighbours) or hex (six). `Topology`.

**Wrap.** Which edges join: none, horizontal (a cylinder) or both (a torus). `Wrap`.

**Shape.** Which cells of the bounding box exist: rect, donut, cross, diamond, cave, dungeon.
Cut-away cells are **absent** (`present: false`), not empty. Parameters are always in cells.
`BoardShape`, `shapeParam`; one `ShapeRule` per shape in `src/engine/shape/`, listed in
`registry.ts`.

**Placement.** The rule that decides where creatures stand: uniform, sudoku, checker, pairs,
dominoes, packs, congo. A placement never changes how many creatures there are. `Placement`;
one `PlacementRule` per rule in `src/engine/placement/`, listed in `registry.ts`. See
`docs/modes.md`.

**Mask.** The boolean grid of which cells exist for a shape; the dungeon also has a **spawnable**
mask (room floor only).

**Continuation / scaling boards.** Boards past 10, generated by continuing each schedule's own
average step. Unlocked by clearing board 10.

**Full Run.** All ten boards of a type back to back on one HP pool with a half-pool heal between
boards; level, EXP and mana reset each board. `src/engine/run.ts`.

**Unlock gates.** `requires` (types whose board 10 must be cleared), `requires_boards` (boards
cleared anywhere), `requires_runs` (Full Runs completed on distinct types). `src/ui/progress.ts`.

## Measurement

**Tier-order player.** The omniscient player in `src/sim/autoplay.ts` that kills every creature in
tier order; the instrument for the zero-damage guarantee. On DUNGEON it walks.

**Honest player.** The player in `src/sim/honest.ts` that sees only what a player sees, deduces
locally (Sweep's bound, exact tiers, subtraction of overlapping numbers, the placement rules) and
guesses when it runs out. The instrument for spell value and for retunes.

**Complete deducer / the solver.** `src/sim/solver.ts`: a bounds-propagating search that finds
every covered cell that every layout consistent with the screen makes safe. A measuring instrument,
not a generator. Its budget is a node count, so it is deterministic.

**Stuck point / forced guess.** A moment where a player has no move it can prove safe. The honest
player's count is an upper bound; the solver's is the floor.

**Clear rate.** Share of boards a player finishes. Guesses and clear rate disagree on ladders
where a forced guess is cheap (DUNGEON's doorways, CHECKERBOARD's parity, DONUT's rims).

**Golden output.** The recorded text of fourteen fixed-seed simulator runs in `test/golden/`,
diffed by `npm run sim:golden:check`. A refactor leaves it byte-identical.

**Candidate file.** A `ladders.json` written from a modified `ladders.py`, pointed at with
`CS_LADDERS=path`, so a retune is measured before it replaces the real data.
