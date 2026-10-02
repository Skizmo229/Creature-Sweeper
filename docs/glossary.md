# Glossary

The vocabulary the game, the code, the tests and the design notes use, one paragraph each, with
the module that owns the idea where one does. Terms are grouped, not alphabetical, because most of them only make sense
next to their neighbours.

## The game

**Cell.** One square (or hexagon) of a board. It holds a tier, a number, and the player's
annotations. `Cell` in `src/engine/types.ts`.

**Creature.** What stands on a cell that is not empty ground: a monster of some tier, fought when
its cell is opened. At or below your level it dies for free; above, it costs HP. Killing it pays
EXP and mana.

**Tier.** A creature's power level, 1 and up; tier 0 is empty ground. A cell's tier is hidden
until the cell is opened.

**Number.** What an opened empty cell shows: the **sum** of its neighbours' tiers, not a count of
creatures. See `docs/invariants.md`, fact 4.

**Ring.** A cell's neighbours: eight round a square cell, six round a hex, fewer at an edge or a
hole. "The ring is free" means every covered cell in it is safe to open at your level.

**Beaten creature.** A creature you have killed. It stays on its cell, drawn dimmed and struck
through by default, and still counts its tier in every number round it. The number under it, the
sum of its own ring, shows while the cursor is over it, except on PAIRS and DOMINOES.

**Level (LV).** The player's level. A fight against a creature of tier at most your level is free:
one round, no damage. Above it, damage follows a staircase, `E * (ceil(E / L) - 1)` for tier `E`
at level `L`. `src/engine/combat.ts`.

**EXP and thresholds.** Killing a creature of tier `E` pays `2^(E - 1)` EXP: 1, 2, 4, 8, 16
(`expForTier` in `src/engine/combat.ts`; mana is the linear one). The thresholds to each level
are per board and come from the ladder data (`exp` in `BoardConfig`). See **tuning identity**.

**HP.** The player's hit points for one board, or one Full Run. A guess budget, not a combat
resource: see `docs/invariants.md`, fact 2.

**Mana.** Spell currency, earned per kill and per empty cell explored. `src/engine/spells.ts`.

**Opening.** The cells revealed before the first move. `'auto'` reveals the zero-region whose
cascade uncovers the most cells; `'none'` reveals nothing; `'empties'` reveals every empty cell
(SUDOKU only); `'base'` deals the bottom two rows face up (PYRAMID); `'islands'` reveals the three
largest zero-regions (PETRI DISH). `findBestOpening` and `findOpenings` in `src/engine/opening.ts`.
The clock starts when the opening is dealt, because reading it is the first thing the player does.

**Cascade.** Opening a cell whose number is 0 opens its neighbours, recursively.

**Mark.** A player's claim that a covered cell holds a given tier. A mark above your level blocks
clicks on that cell (the **mark guard**). Marks feed mark-assisted Sweep by subtraction.

**Note (pencil).** A set of tiers the player has not ruled out for a cell, held as a bitmask
(`Cell.notes`, bit `t` for tier `t`; bit 0 is empty ground). Never a claim. Read in one direction
only: if the lowest candidate is above your level, the cell is guarded. `src/engine/notes.ts`.

**Given.** A mark the board dealt rather than the player wrote: a SUDOKU clue, or the answer to a
Reveal. Drawn gold, unerasable, and a fact rather than a claim. `Cell.given`.

**Census.** The count of creatures among a cell's neighbours, once the Census spell has been cast
on it. `Cell.census`. Sum plus count usually pins a layout.

**Augur.** The tiers of the creatures among a cell's covered neighbours, strongest first, once the
Augur spell has been cast on it: `Cell.augur` as cast, `augurNow` as the ring stands. Every hidden
creature and how strong, never where; at or below your level the ring is free.

**Sweep.** Opens every cell the engine can prove safe. **Strict** Sweep uses only facts (numbers,
open tiers, givens, Census, Augur, the placement proofs). **Assisted** Sweep also trusts the
player's marks. **Charged** Sweep (the default) is rationed: ten hand-opened cells buy one sweep; a
**budget** is so many sweeps a board (decision 0072). A **chord** sweeps one open cell's ring at a
sweep's price (decision 0071). `Game.safeCells`, `Game.sweep`, `Game.sweepAt`.

**Spells.** Census (30 mana, counts a cell's neighbouring creatures), Augur (50, lists the tier of
each one hidden), Reveal (75, tells you a cell's tier as a given and opens the empty ground around
it), Beacon (85, opens the largest untouched zero-region), Exercise (150, lends a level to the next
fight). `src/engine/spells.ts`. WORKOUT prices Exercise by its own rule (`WorkoutRule`).

**Loadout.** The spells a ladder offers, fixed per ladder: ARCANE's is Reveal and Census,
ORACLE's Reveal, Census, Exercise and Beacon, AUGUR's Census and Augur; most ladders have none.

**Search board.** A board won by uncovering every empty cell rather than by killing every
creature (BLIND, HUGE x BLIND, SEER). No level economy; on SEER, exploration is the only mana.

**Patrol / move / route.** On PATROL every creature walks a square route, one cell per **move**
(an open or a Wait), clockwise from its top-left corner; routes never share a cell. A
creature standing on uncovered ground covers it and shows as a ?; a mark there draws a route.
`src/engine/patrol.ts`, `Game.wait`, `Game.moves`.

**Reach / the crawl rule.** On DUNGEON, PETRI DISH, SPRINKLE DONUT and PYRAMID, a cell may only be
opened, or targeted by a spell, within `reach` steps of already-open ground, counted as a walk
through `neighbours()`. Marking and pencilling are exempt. On the one-step ladders a mark touching
open ground counts as open ground too (`marksExtendReach`). `Game.inReach`; the exception is
`Game.sealedIn`.

## Boards and ladders

**Game type / ladder.** One of the named modes (EASY, NORMAL, DUNGEON, ...). Each is a ladder
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

**Shape.** Which cells of the bounding box exist: rect, donut, cross, diamond, pyramid, gear,
card, heart, star, hexagon, circle, cave, dungeon. Cut-away cells are **absent**
(`present: false`), not empty. Parameters are always in cells. `BoardShape`, `shapeParam`; one
`ShapeRule` per shape in `src/engine/shape/`, listed in `registry.ts`.

**Placement.** The rule that decides where creatures stand: uniform, sudoku, checker, pairs,
dominoes, packs, congo, patrol, sprinkles. A placement never changes how many creatures there
are. `Placement`; one `PlacementRule` per rule in `src/engine/placement/`, listed in
`registry.ts`. See `docs/modes.md`.

**Mask.** The boolean grid of which cells exist for a shape; the dungeon also has a **spawnable**
mask (room floor only).

**Continuation / scaling boards.** Boards past 10, generated by continuing each schedule's own
average step. Unlocked by clearing board 10.

**Full Run.** All ten boards of a type back to back on one HP pool with a half-pool heal between
boards; level, EXP and mana reset each board. `src/engine/run.ts`.

**Paused game.** A board, or a Full Run, left to come back to: its seed, its dials and the moves
made on it, replayed on resuming (`src/engine/replay.ts`, `src/ui/paused.ts`). Kept after every
move and deleted when the game ends, so never a checkpoint. One per board, one run per ladder.
Decision 0057.

**Category.** The menu column a ladder is filed under: Normal (the original game's seven modes),
Shape, Magic or Special. `CATEGORIES` in `design/ladders.py`, `category` in the data.

**Unlock gates.** `requires` (types whose board 10 must be cleared) and `requires_boards` (boards
cleared anywhere). `src/ui/progress.ts`.

## On screen

**LV buttons / counters.** The LV palette on the game screen: a button per tier, beside Entry,
Beaten and Sweep. A click on one arms that tier for marking or pencilling. Each shows how many
creatures of its tier are still alive: the counters, which the hidden-counters dial hides.

**Entry mode.** Whether a click with a tier armed, or a number key, marks a cell or pencils it.
The Entry button and `N` switch it; Shift inverts it for one keystroke.

**Beaten toggle.** The Beaten button beside Entry, or `U`: every beaten creature shows the number
under it at once, not only the one under the cursor. It stays as set from board to board, and is
how a touch screen, which has no hover, sees those numbers.

**Tutor / hint.** The tutor shows the next move a trick proves on the board in front of you, and
why, pointing on the board in violet; it opens nothing. Each press of `H` or the [H]int button is
a hint, and a hinted clear sets no best time.

**School / lesson.** Nine short lessons, each on a board drawn so that one trick is the only move,
offered from the ladder list and the rules card and required by nothing. A lesson is played at the
tuned dials and touches no record.

**Catalogue / field guide.** The catalogue is `docs/strategies.md`: every trick a person uses,
graded. The field guide is the catalogue inside the game, in shorter words, opened from the rules
card, the ladder list, or `G` on a board.

**Gameplay dial / presentation setting.** The two kinds of setting. A gameplay dial changes a rule
(HP, damage, mana, prices, how Sweep is gated, the clock), and a dial set easier than the tuned
game records no clear, unlock or best time. A presentation setting changes how the game looks,
sounds or answers the hand, never a rule or a record.

**Time Attack.** A gameplay dial: the clock counts down from your best time on the board, or a
share of it you choose, and reaching zero loses the board.

**Look.** What a ladder's boards wear by default: a palette (with its pip shape, how a creature is
drawn), a face (the board's typeface), a sound pack and a clear effect. The player can override any
part, for every ladder or for one alone.

**Tile / example / standard example.** On the settings screen each option is a tile, a button,
and what is drawn on it is an example: a real board in that option. The standard example is the
board the icon, palette, board font and strike galleries share, dealt so that it shows every digit
and every colour a palette paints. Its thumbnails are also called the board preview icons.

**Record / best time / fingerprint.** What the save keeps of a board: whether it was cleared, the
best time, and, until a best time exists, the fewest hints a hinted clear took. A record carries
the board's fingerprint, a hash of the tuning it was dealt from, so a clear made before a retune
stands but its time is not set against the new board.

**Play statistics.** What each board cost, kept on the device: attempts and how they ended, opens
and guesses, sweeps, casts, hints, HP lost, seconds, and what dealt each death. They leave it only
as a `CST1:` code the player copies from the backup screen into a play-test report.

**Backup code.** The whole save, progress and settings, as a `CS1:` code from **Back up / restore
save** on the list of game types. Pasting one back restores it.

## People

**The owner.** The maintainer, Skizmo229, who decides what the game is. The plans and the
decision records call them the owner.

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

**Graded player.** `src/sim/graded.ts`: the player that plays with a person's tricks up to a
chosen **grade**, one pass at a time, and reports what a board demanded: the hardest grade
needed, how often each grade was needed, the moves on offer when it had to look, and its guesses.
The instrument Milestone 4 retunes the ladders against (`docs/human-tuning-plan.md`).

**Grade.** How much a trick asks a person to hold in the head at once: 0 a glance, 1 one number,
2 two numbers, 3 a supposition followed a step or two, 4 counting the board; the complete deducer
is grade 5. `docs/strategies.md`.

**Trick.** One technique of the graded player, `src/sim/tricks.ts`, one per entry of the
catalogue, with an id such as `residual-ring` or `what-if`.

**Clear rate.** Share of boards a player finishes. Guesses and clear rate disagree on ladders
where a forced guess is cheap (DUNGEON's doorways, CHECKERBOARD's parity, DONUT's rims).

**Golden output.** The recorded text of the fixed-seed simulator runs in `test/golden/` (listed
in `scripts/golden.mjs`), diffed by `npm run sim:golden:check`. A refactor leaves it
byte-identical.

**Candidate file.** A `ladders.json` written from a modified `ladders.py`, pointed at with
`CS_LADDERS=path`, so a retune is measured before it replaces the real data.
