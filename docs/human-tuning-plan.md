# Milestone 4: tuning for the human player

Every difficulty figure in this repository comes from two machine players. They settle whether a
board *can* be cleared and how often a perfect or a careful deducer is cornered, and they have
never been wrong about that. What they cannot say is how hard a board is for a person, because a
person does not solve the way they do. This milestone builds an instrument that plays the way
people play, in graded steps of skill, measures every ladder with it, retunes the ladders against
what it finds, and turns the techniques it uses into a catalogue the game can teach.

Started 25 September 2026. The catalogue is `docs/strategies.md`; the instrument is the graded
player in `src/sim/graded.ts` (`npm run sim:human`). Status of each step is in section 9.

## 1. The problem

The honest player (`src/sim/honest.ts`) and the complete deducer (`src/sim/solver.ts`) were built
to answer "is this board fair", and for that they are right to be exhaustive. Measured against a
person they are wrong in both directions, and the errors do not cancel:

- **They never scan.** The honest player rebuilds every constraint on the board on every pass and
  subtracts every nested pair of numbers at once. A person looks where they last acted, finds the
  one move that is there, and misses the 1-2-1 on the far side of the board. On a 1,682-cell
  HUGE board the difference between "a move exists" and "I found it" is most of the game.
- **They never pay for arithmetic.** A 9 over three cells has ten decompositions on a five-tier
  board; the instruments read it as a residual and move on. A person reading "is anything behind
  this above my level" pays for the small residuals and not for the large ones, and the sum rule
  is exactly what a Minesweeper player gets wrong first (`src/ui/screens/howto.ts`).
- **They never forget, and never remember.** The honest player writes only exact marks, so a
  bound like "4 or 5, come back at level 4" is thrown away between passes; a person pencils it
  and returns. The same player never misreads a dead creature's tier and never trusts a wrong
  mark, which the mamono community names as its fatal error.
- **They do not count.** The honest player never reads the per-tier counters the HUD shows, which
  is the endgame technique people fall back on ("one tier 5 left and it has to be there"). The
  solver counts perfectly, which no person does.
- **They read what a person cannot see.** Both instruments and Sweep's partner proof read a
  beaten creature's number on PAIRS and DOMINOES, where it is not drawn (decision 0012; the pencil
  stopped reading it in 0061), so those two ladders play harder than their tuning says; the
  placement-rule ladders as a whole were tuned against a reader of their rules weaker than a
  strong person, so they play easier (`docs/tuning.md`, open question 4).
- **They guess without fear.** `bestGuess` minimises the worst case one step ahead and never
  looks at HP, at whether the worst case kills, at what the guess would reveal, or at whether
  two more free kills would make the cell free.

The consequence is stated in `docs/tuning.md` as open question 1: the ladders have never been
played. Playtesting will come; this milestone builds the instrument that stands in for it and
stays useful after it, because a model that reproduces what players do can be run 40 times a
board on a candidate schedule and a playtest cannot.

## 2. What "hard for a person" will mean

Other puzzle communities have already found that a single number does not do it. Sudoku's
Explainer rating (the hardest technique on the cheapest solving path) correlates with human solve
times at r = 0.70 to 0.86 over a whole portal but only 0.28 to 0.55 on the puzzles solvable by
simple techniques, where people still differ by a factor of two; there, the count of moves
*available* at each step is the best single predictor, because scanning is the work. HoDoKu's
summed technique cost tracks time better than the hardest step alone but lets twenty easy steps
outweigh one hard one, so it floors the sum at the hardest step's band. A 2026 nonogram study
found that a SAT solver's search effort does not correlate with reported difficulty at all, while
guessing, ambiguity and load do. (Sources at the end of `docs/strategies.md`.)

So the graded player records four things per board and seed, and the retune decides which to
match per ladder rather than collapsing them:

1. **The hardest grade the board demanded**: the highest technique grade that was the lowest one
   yielding a move at some point in the game. A board that a grade-1 player clears without a
   guess is a grade-1 board.
2. **How often each grade was needed**: the number of passes on which grade g was the lowest
   grade with a move, so "one hard step" and "forty easy ones" stay distinguishable.
3. **Moves available when you had to look**: at every pass above the glance grade, how many
   moves that grade offered. Few means scanning; one means a needle.
4. **The guess measures**, at each grade: stuck points (nothing at this grade or below), guesses
   taken, guesses whose worst case could kill, HP lost, deaths, clear rate.

The grades are the catalogue's grades (`docs/strategies.md`): 0 glance, 1 one number, 2 two
numbers, 3 what-if, 4 counting, with the complete deducer as grade 5, the ceiling nobody reaches.
A player of grade g uses every technique at or below g. Grade 1 is a novice who has learned the
sum rule; grade 2 is a competent Minesweeper player who has learned it; grade 4 is an expert.

## 3. The instrument: the graded player

`src/sim/graded.ts`, with what it sees in `src/sim/reader.ts` and its techniques in
`src/sim/tricks.ts`. A sibling of the honest player, not a parameterisation of it, for two
reasons: the honest player's readers treat marks as facts and read hidden numbers by design, and
most of the golden runs play it, so leaving it untouched keeps them byte-identical.

### What it reads

Only what is on screen, stated per field rather than assumed. An open empty cell's number; an
open creature's tier; a beaten creature's number **only where the rule draws it on hover**
(`placementRule(config.placement).display.hoverShowsNumber`, false on PAIRS and DOMINOES), with
a `seesHiddenNumbers` switch to measure what hiding it costs; the per-tier counters
(`game.counterFor`); level, HP, mana and the spell list; the crawl rule through `game.inReach`;
the placement rule's own readings through its hooks (`cap`, `emptied`, `missingFrom`, `groups`),
each assigned a grade because they are full-strength techniques, not free knowledge; the
silhouette (`present`), from which it infers a dungeon's corridors the way a person does. It
never reads a covered cell's `tier`, `num` or `alive`, never calls `noteCandidates` on a rule
whose number it may not see, never calls `sealedIn`'s internals, and never touches the map's
`hall` or `spawnable` masks. Everything it opens as safe is checked against the real tier by the
tests, on every ladder that has a rule (section 5).

### The grades and their techniques

Each technique is a function of the visible state that returns moves: cells proven safe to open,
cells named with an exact tier (marked), or candidate sets narrowed (the pencil, held in the
instrument rather than in `Cell.notes`, which the engine reads as a guard and must never be read
as a bound; `docs/invariants.md`). The ids are the catalogue's.

| Grade | Technique | What it concludes | Where |
| --- | --- | --- | --- |
| 0 | `raw-ring` | an open number at or under your level frees every covered neighbour | all |
| 0 | `named-kill` | a cell marked at or under your level is a free kill | all |
| 0 | `met-partner` | a creature beside a creature has met its partner; the rest of its ring is empty | pairs, dominoes |
| 0 | `corridor` | a one-wide passage and the room cell it arrives at are empty | dungeon |
| 0 | `sprinkles` | where every creature is drawn, a plain cell is empty and a sprinkle is a creature | sprinkle donut |
| 1 | `residual-ring` | subtract the tiers you can see; a remainder at or under your level frees the ring, a remainder of 0 empties it | all |
| 1 | `last-cell` | a number with one covered neighbour left has named it | all |
| 1 | `counters` | a tier whose counter reads 0 is gone; when every tier left is at or under your level, everything is free | all |
| 1 | `lone-dark` | the one covered dark square under an even remainder is empty | checkerboard |
| 1 | `partner-number` | a beaten creature's number is its partner's tier: read beside a lone creature | pairs, dominoes, only when the number is visible |
| 2 | `subtract` | one number's covered cells inside another's: the difference is a number of its own (the 1-2-1 family) | all |
| 2 | `overlap` | two numbers that share cells: the cells one sees alone are bounded by the other | all |
| 2 | `bounds` | what one number allows each of its cells (a 9 over two cells is 4 and 5) | all |
| 2 | `colour-cap` | what a square's colour caps it at under a remainder | checkerboard |
| 2 | `pack-gap` | a covered cell beside a pack holds one of the tiers it has not shown, or nothing; a pack missing one tier with one covered cell beside it names it | packs, conga line |
| 3 | `what-if` | suppose a cell is a 5: follow the numbers two steps; a contradiction rules it out | all |
| 3 | `line-reach` | a line only continues from its ends; everything its missing members cannot walk to is empty | conga line |
| 4 | `accounted` | the counters say how much tier is left; a set of numbers that accounts for all of it empties every other cell | all |
| 4 | `last-of-tier` | the last creature of the top tier must sit where a number forces it, so nowhere else | all |
| 5 | the complete deducer | everything that follows from the screen | all |

Two reads that are cheap for the instrument are graded above zero on purpose. Subtracting a
beaten creature's tier is grade 1 because a person has to look at the glyph and do the sum; the
raw number at or under your level is the grade-0 version and the first trick in the catalogue.
The counters are grade 1 because they are on the HUD rather than the board. Within a grade the
tricks run in the catalogue's order and the first to conclude a cell takes the credit. One trick
of the catalogue has no technique of its own: a finished pack's ring is what `residual-ring`
opens, because every member's number then leaves a remainder of 0, and a technique for it
concluded nothing in 150 games (measured 25 September 2026), so the catalogue says so instead.
Counting the sprinkles has none either: where the board draws every creature the reader counts
them under each number, and the Census bound (`census-ring`, grade 1) reads the count.

### The loop

One pass at a time, lowest grade first. On each pass the player gathers every move that grade 0
offers; if there are none, grade 1; and so on up to its own grade. It records which grade
yielded and how many moves it offered, then applies all of them, because once a person has found
a read they take everything of that kind in sight, and re-reads the board. A level-up ends a pass
early, because the cheapest techniques change meaning with the level. When no grade yields, the
player is stuck: it records a stuck point and guesses.

Every move that opens a cell is filtered by the crawl rule, as the honest player's are
(`honest.ts`), and by the player's own marks (a mark above level is a lock it wrote itself). The
candidate sets narrow and never widen, and a set that narrows to one tier names the cell; a set
whose largest tier is at or under the level frees it. When the player's own grade includes a
technique that would read a hidden number on a pairing board, the technique is skipped rather
than the number peeked, which is what makes the `seesHiddenNumbers` switch a measurement.

### Guessing

A person guessing weighs what the guess could cost against what it would tell them, and the
staircase makes that sharp: one tier over the level costs exactly that tier, two over is a cliff
(`docs/strategies.md`, section 1). The graded player, when stuck:

1. Considers every covered, unmarked cell it may click. For each it knows a **ceiling**: the
   smallest remainder among the visible numbers touching it, capped by the colour or the pack
   beside it and by the highest tier whose counter is not zero. A cell no number touches has the
   highest live tier as its ceiling and the counters' average tier per covered cell as its
   expectation, which is what a person estimates from the HUD.
2. Prefers a cell whose worst case cannot kill at its current HP, then the lowest ceiling, then
   the lowest expectation, then the cell with more numbers touching it (a guess that resolves
   more). Ties are broken by a draw from the run's seed, not by grid order, so that the
   instrument's attention is not secretly the row-major scan of the grid.
3. Records whether the worst case could have killed, and what it cost.

Deferral (leaving a 4-or-5 cell alone because two more free kills will make it free) and the
spending policies are not in the first version; both are listed in section 10. The first version
is spell-less on every ladder, like the forced-guess curves every retune so far has matched.

### Search ladders

BLIND and HUGE x BLIND are played at level 0, where "at or under your level" is never true and
every creature is death. The same techniques apply where they prove a cell *empty* (a remainder
of 0, a subtraction to 0, the counters accounting for everything) and never where they prove it
*low*. No instrument has played those ladders with a deducer before; their figures are a
single-mistake game and are reported as clear rate alone.

### Determinism and cost

Boards are pure functions of (config, seed) and the player's only draw is the guess tie-break,
seeded from the board seed, so a run is reproducible and can be a golden output. Measured on
25 September 2026, the honest player costs 4 to 85 ms a board and the solver 1 to 20 ms a call
(`src/sim/cli/forced.ts`); the graded player runs several passes a move and lands within an
order of magnitude of that, so 40 seeds over ten boards is under a minute a ladder at grade 4.

## 4. Where it plugs in

`play(game, options)` returns a `Run` like the honest player's, extended with the four measures;
the CLI `src/sim/cli/human.ts` iterates `type.boards` and prints a table per ladder, board by
board, at grades 1 to 4 side by side, and every-ladder rows at one grade; `--profile` prints how
often each technique fired. The solver can be attached as the ceiling through the same `rescue`
hook `forced.ts` uses, which is how "forced at any grade" is reported beside "forced at this
grade". Two golden runs fix the printout: `human-normal`, and `human-oracle` with `--profile`.
`docs/tuning.md`'s instrument table and the README's commands list gain the row.

## 5. Validation

Nothing about a person is in the tests, only the instrument's honesty. What is asserted:

- **Soundness.** On every ladder with a rule, a hex grid and a torus, a cell the player opens as
  safe holds a tier at or under the level at that moment, and a cell it names holds that tier.
  `rescueDamage`'s equivalent (HP lost on a cell a technique called safe) must be zero.
- **Non-vacuity.** Each technique fires somewhere on a real board, and each grade clears
  something the grade below could not, or the test is exercising nothing.
- **Visibility.** The `seesHiddenNumbers` switch changes the figures on PAIRS and on no other
  ladder, which proves the predicate is asked rather than the name.
- **The corridor inference** equals the dungeon map's hallways, doors and pockets on every seed
  it is checked on; a cell it calls empty is never spawnable.
- **Monotonicity.** Adding a grade never adds a stuck point on the same seed.
- **The ceiling.** With the solver attached, the player's stuck points match `forced.ts`'s
  complete-deducer column on the same seeds.

Beyond the tests, four anchors for the shape of the curves, none sufficient alone:

1. **Minesweeper itself.** A `search` board of one tier at 30x16 with 99 creatures *is* Expert
   Minesweeper: numbers are counts, every creature is death, marks are flags. Published
   technique ladders span a 30-fold win rate on it (single-point 0.5%, coupled subsets 33%), 84%
   of boards force at least one guess, and 88% of a board is cleared before the first one. The
   graded player's grades 1, 2 and 4 should land in that order and near those figures.
2. **The original's own stars.** hojamaka rates Easy 1, Normal 2, Huge 3, Extreme 3, Blind 5,
   and marks Huge x Extreme and Huge x Blind not recommended: five ordinal points for the ladders
   that mirror them.
3. **Self-consistency.** Grade 2 subsumes the honest player's arithmetic, so on every ladder but
   the two pairing ones its stuck points should be at or below the honest player's; grade 5 is
   the solver.
4. **Telemetry**, once the game is played (section 8).

## 6. The measurements

Every ladder but SUDOKU (guess-free by construction, and its techniques are Sudoku's) and the
search ladders (reported on their own), 40 seeds a board, grades 1 to 4, spell-less, numbers
hidden where the game hides them. The baseline table goes in section 9 as it is recorded, dated,
and the design reference gets a section once the retune has something to compare against.

What the table is expected to show, and what each outcome would mean:

- A ladder whose grade-2 clear rate is far below its grade-4 one is a ladder that rewards the
  hard techniques; that is the point of the placement ladders and a fault on NORMAL.
- A board whose hardest grade is 3 or 4 on most seeds is a board most players will guess on
  without knowing a deduction existed; on the early boards of any ladder that is a retune.
- A ladder where moves available per pass is low throughout is a scanning ladder (HUGE, the
  shapes with long rims); size, not density, is its lever.
- Where the grade-4 player is cornered about as often as the honest player and clears less, the
  guess model is the difference, and the guess measures say whether it is the lethality.

## 7. The retune, for a human curve

The method is `docs/tuning.md`'s, with the reference curve replaced:

1. **Name the player and the measure each ladder is tuned for.** Proposed, to be decided with
   the owner once the baseline is in: EASY, a grade-1 player clears every board with no forced
   guess; NORMAL, WRAPAROUND, HIVE and the shapes, a grade-2 player clears 90% falling to 70%
   over the ten with the hardest grade needed at most 2 on boards 1 to 5; the placement ladders,
   the same at grade 2 *with their rule's grade-1 reads*, and a grade-4 player clearing 95%
   throughout, since understanding the rule is their reward; EXTREME, ORACLE and the HUGE
   ladders, a grade-4 player at 60 to 70% on the top boards, which is where the lock decision
   (`docs/tuning.md`, open question 3) is finally made on a human figure.
2. **Build a candidate file** (`design/ladders.py` in memory, `build()`, written outside
   `design/data`), point the player at it with `CS_LADDERS`, measure at 40 seeds, compare. The
   vitest suite reads the same loader, so the structural tests run against the candidate too.
3. **Mind the walls.** Per-tier creature counts must not fall from one board to the next or
   `monotone` and two tests fail; the mana affordability floors are set by DUNGEON board 1;
   `test/spells.test.ts` pins the honest player's stuck counts at board 10 on six magic ladders
   and has to be re-measured with any of them; the auto-opening must stay at nine cells, which
   binds PAIRS and DOMINOES first.
4. **Land it**: edit the TOML, regenerate, diff byte for byte against the candidate measured,
   `npm run test:py`, re-record the goldens the ladder appears in and say so in the commit, and
   write a decision record in 0019's shape with the schedule quoted and the before and after.

The dials and what each moves are unchanged (`docs/tuning.md`); what is new is that a ladder can
now be moved on a scanning measure (size) or a technique measure (density, lock) and the
instrument says which one the ladder is failing on.

## 8. Teaching, and telemetry

The catalogue is written for two readers at once, and section 10 of it says which trick each
technique id is. Three routes into the game, in the order they are worth doing:

1. **A per-ladder tip on the board screen.** The `blurb` field of `design/ladder_types.toml` is
   already the only technique text that ships (CHECKERBOARD's, PAIRS's, PACKS's, CONGA LINE's and
   DUNGEON's each state their trick); a `tip` field beside it flows through `ladders.py`, the
   JSON and `LadderType` to the board list and the loss card, which today explains a death on
   EASY alone. Data, so it never classifies a ladder by name.
2. **A tricks page on the how-to card**, reachable from the board screen as well as the ladder
   list, with the first three tricks of the catalogue illustrated by real boards built the way
   the settings galleries are (`src/ui/preview.ts`, decision 0025). `test/helpers.ts`'s `paint`
   moves into `src/` for it.
3. **Lesson boards**, later: tiny boards built to need one trick, each doubling as the fixture
   that proves the graded player needs exactly that technique to clear it.

Telemetry, built 27 September 2026 as the play statistics (`src/ui/telemetry.ts`, the store in
`telemetrystore.ts`, the tally in `game/recorder.ts`, decision 0060): a separate store (its own key and version, never inside the `CS1:` code,
which is in the wild) recording per board: attempts, HP lost, cells opened by hand, cells opened
outside `safeCells({ useMarks: false })` at that moment (the honest definition of a guess a
player made), sweeps, casts, deaths and the tier that dealt them, elapsed time, and the dials
the board was played under (tuned and modified dials kept apart). Local only, exported on request
as a code the owner can paste and `npm run telemetry` prints as a table, one row a board, beside
which `sim:human`'s row for the same board says whether a person plays like the graded player.
This is what calibrates the technique costs and the retune targets once the game has been played.

## 9. The steps, and where they stand

| Step | What | Status |
| --- | --- | --- |
| 4.1 | The catalogue, `docs/strategies.md` | done 25 September 2026 |
| 4.2 | The graded player, its CLI, tests and golden run | done 25 September 2026 |
| 4.3 | The baseline measurement, every ladder, grades 2 and 4 | done 25 September 2026, below |
| 4.4 | The anchors: the Minesweeper board, the stars, the honest comparison | Minesweeper pending |
| 4.5 | Decide the target per ladder with the owner | decided 26 September 2026, as proposed in section 7 |
| 4.6 | Retune, one commit per ladder, decision record each | EXTREME and ORACLE done 26 September 2026; HUGE x EXTREME measured on target and left as is; BLIND and HUGE x BLIND done 26 September 2026; the plain ladders measured and left as they are, since only the lock reaches the target (9.1); the shapes and the placement ladders measured 27 September 2026 and left for the same reason (9.1, decision 0058). Every ladder has now been measured against its target |
| 4.7 | Per-ladder tips and the tricks page | open |
| 4.8 | Telemetry store and export | done 27 September 2026 (decision 0060): the play statistics, kept per board on the device, exported from the backup screen as a `CST1:` code and read by `npm run telemetry`; since 30 September 2026 the screen links a play-test report on GitHub for the code (decision 0085) |
| 4.9 | Spending policies and attention in the graded player | spells and attention done 26 September 2026; deferral open |
| 4.10 | Re-measure against telemetry; revise the costs | after release |

### 9.1 Baseline, 25 September 2026

Recorded with `npm run sim:human -- 40` on the ladder data of 25 September 2026, and again on
26 September with the eight ladders merged that day (every earlier figure reproduced exactly):
every ladder but SUDOKU, its ten tuned boards, 40 seeds each, spell-less, numbers hidden where
the game hides them, `unsound` 0 throughout. SPRINKLE DONUT's row was measured on its own the
same day, when it was added (decision 0046). Stuck points, guesses, lethal guesses and HP lost are per board;
"need" is the share of boards on which the grade-4 player needed a trick of that grade or above;
"avail" is the moves on offer per pass above grade 0; "#10" is board 10's clear rate.

| ladder | g2 stuck | g2 clear | g4 stuck | guess | lethal | g4 clear | hp | need>=2 | >=3 | >=4 | avail | effort | #10 g2 | #10 g4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EASY | 0.0 | 100% | 0.0 | 0.0 | 0.0 | 100% | 0.0 | 0% | 0% | 0% | 12.3 | 29 | 100% | 100% |
| NORMAL | 0.1 | 100% | 0.1 | 0.1 | 0.0 | 100% | 0.0 | 24% | 1% | 1% | 11.7 | 74 | 100% | 100% |
| HUGE | 0.1 | 100% | 0.1 | 0.1 | 0.0 | 100% | 0.1 | 42% | 2% | 2% | 15.5 | 151 | 100% | 100% |
| EXTREME (retuned) | 2.3 | 90% | 2.2 | 2.2 | 0.2 | 90% | 2.3 | 92% | 6% | 4% | 5.4 | 191 | 68% | 65% |
| HUGE x EXTREME | 3.2 | 76% | 3.0 | 3.0 | 0.6 | 79% | 3.5 | 99% | 16% | 8% | 5.9 | 401 | 57% | 63% |
| ARCANE | 0.6 | 100% | 0.6 | 0.6 | 0.0 | 100% | 0.4 | 69% | 3% | 2% | 8.0 | 130 | 100% | 100% |
| ORACLE (retuned) | 2.1 | 80% | 2.0 | 2.0 | 0.5 | 82% | 2.2 | 98% | 9% | 6% | 5.5 | 224 | 30% | 35% |
| WRAPAROUND | 0.0 | 100% | 0.0 | 0.0 | 0.0 | 100% | 0.0 | 4% | 0% | 0% | 19.3 | 49 | 100% | 100% |
| CROSS | 0.8 | 99% | 0.7 | 0.7 | 0.0 | 100% | 0.8 | 72% | 4% | 3% | 6.0 | 105 | 98% | 98% |
| WRAPPED CROSS | 0.5 | 100% | 0.5 | 0.5 | 0.0 | 100% | 0.5 | 63% | 1% | 0% | 6.9 | 93 | 98% | 98% |
| HIVE | 0.4 | 100% | 0.4 | 0.4 | 0.0 | 100% | 0.4 | 24% | 1% | 1% | 9.5 | 100 | 100% | 100% |
| DIAMOND | 0.5 | 99% | 0.5 | 0.5 | 0.0 | 99% | 0.5 | 61% | 4% | 3% | 7.7 | 95 | 100% | 100% |
| PAIRS | 0.4 | 100% | 0.4 | 0.4 | 0.0 | 100% | 0.4 | 54% | 1% | 0% | 11.2 | 126 | 98% | 98% |
| DOMINOES | 0.3 | 99% | 0.3 | 0.3 | 0.0 | 99% | 0.4 | 56% | 1% | 1% | 7.7 | 98 | 95% | 95% |
| WORKOUT | 0.7 | 99% | 0.6 | 0.6 | 0.0 | 100% | 0.6 | 78% | 7% | 7% | 6.2 | 147 | 98% | 98% |
| PACKS | 0.5 | 99% | 0.4 | 0.4 | 0.0 | 99% | 0.5 | 69% | 3% | 2% | 6.9 | 111 | 98% | 98% |
| DONUT (round) | 2.2 | 94% | 2.2 | 2.2 | 0.1 | 94% | 2.4 | 96% | 3% | 2% | 4.1 | 209 | 80% | 80% |
| CHECKERBOARD | 0.2 | 100% | 0.2 | 0.2 | 0.0 | 100% | 0.1 | 67% | 2% | 0% | 7.8 | 140 | 100% | 100% |
| CONGA LINE | 0.3 | 100% | 0.3 | 0.3 | 0.0 | 100% | 0.3 | 61% | 1% | 1% | 6.7 | 110 | 100% | 100% |
| RAGGED CAVE | 1.1 | 97% | 1.1 | 1.1 | 0.1 | 97% | 1.3 | 80% | 6% | 5% | 5.2 | 118 | 90% | 90% |
| DUNGEON | 0.9 | 96% | 0.8 | 0.8 | 0.1 | 97% | 1.2 | 62% | 4% | 3% | 5.7 | 71 | 93% | 93% |
| PYRAMID | 0.0 | 100% | 0.0 | 0.0 | 0.0 | 100% | 0.0 | 6% | 0% | 0% | 16.1 | 64 | 100% | 100% |
| GEAR | 0.8 | 98% | 0.8 | 0.8 | 0.0 | 99% | 0.8 | 81% | 4% | 4% | 6.7 | 145 | 90% | 95% |
| CARD | 0.7 | 99% | 0.7 | 0.7 | 0.0 | 99% | 0.8 | 76% | 6% | 5% | 9.1 | 202 | 100% | 95% |
| VALENTINES | 0.8 | 100% | 0.8 | 0.8 | 0.0 | 100% | 0.5 | 70% | 3% | 2% | 8.8 | 126 | 98% | 98% |
| STAR | 1.0 | 98% | 0.9 | 0.9 | 0.0 | 98% | 1.1 | 76% | 14% | 13% | 7.7 | 127 | 98% | 98% |
| ULTRA HIVE | 0.4 | 99% | 0.4 | 0.4 | 0.0 | 99% | 0.4 | 23% | 1% | 1% | 10.6 | 95 | 95% | 95% |
| PETRI DISH | 0.3 | 100% | 0.3 | 0.3 | 0.0 | 100% | 0.1 | 52% | 1% | 1% | 10.6 | 105 | 100% | 100% |
| PATROL | 0.0 | 100% | 0.0 | 0.0 | 0.0 | 100% | 0.0 | 0% | 0% | 0% | 1.0 | 84 | 100% | 100% |
| SPRINKLE DONUT (new) | 3.4 | 82% | 3.3 | 3.3 | 0.4 | 82% | 4.0 | 100% | 12% | 6% | 3.9 | 243 | 65% | 68% |
| BLIND (retuned) | 1.1 | 46% | 0.9 | 0.9 | 0.9 | 60% | 0.4 | 100% | 26% | 24% | 5.5 | 142 | 25% | 28% |
| HUGE x BLIND (retuned) | 1.1 | 44% | 0.8 | 0.8 | 0.8 | 63% | 0.4 | 100% | 29% | 28% | 8.6 | 221 | 18% | 33% |

What it says, read on the day it was recorded:

- **Grades 3 and 4 hardly move anything.** On every ladder the grade-2 and grade-4 players are
  within a point of each other; a what-if or a count was the only way forward on 1 to 16% of
  boards. What separates the ladders is not the technique they demand but the guesses they
  force, so the retune's lever is the guess measures and the scanning measure, not the grade.
- **The plain ladders never corner a grade-2 player.** EASY, NORMAL, HUGE, WRAPAROUND, HIVE,
  ARCANE and the placement ladders clear at 99 to 100% with a guess every few boards; a player
  who subtracts numbers and never misses a move is not what those ladders are hard for. What
  they cost is scanning: 12 to 19 moves on offer per pass, over 74 to 151 units of effort on
  NORMAL and HUGE, which is where attention (section 10) would show.
- **The hard ladders are guess-decided, as the lock finding said.** Before their retunes
  EXTREME and ORACLE forced three to four guesses a board, one of them lethal on ORACLE, and
  their board 10 cleared at 0 to 8% even at grade 4 (HUGE x EXTREME at 63% since its retune).
  The rows above are as retuned on 26 September 2026 (decisions 0041 and 0042, the lock one
  short on the top boards): board 10 now 65% on EXTREME and, spending mana, 60% on ORACLE
  (35% spell-less, which is what the table shows). HUGE x EXTREME was measured next on the same
  day and left alone: boards 7 to 10 clear 70, 55, 60 and 63% at grade 4 (40 seeds), on the
  target already, since decision 0019 tuned it against the perfect deducer to about where the
  human target sits; board 8's 55% is within the noise of 40 seeds, about eight points. DONUT
  is the needle ladder: 4.1 moves on offer per pass, two guesses a board, 80% of board 10. Its
  row is as made round on 26 September 2026 (decision 0045), six density points up to hold the
  square ring's 95% and 80%; the square ring's row was 1.9 stuck, 3.5 on offer and 174 effort. The honest player finds the round ring harder than the graded
  player does (68% against 83% before).
- **The graded player clears more than the honest player where guesses are dear.** EXTREME 80%
  against the honest player's 55%, ORACLE 60% against 48%: it holds a pencil, bounds two
  numbers that overlap, never guesses a cell it has named, and refuses a guess that could kill
  while another exists. The honest player's forced-guess curves remain the record of what the
  ladders were tuned to; these are the record of what they demand.
- **The plain ladders cannot be brought to the adopted target by density, only by the lock.**
  Measured 26 September 2026 at 40 seeds on candidate files: NORMAL at the 34% ceiling (27.5 to
  34.0%, seven points up) still clears 100% at grade 2 with 1.3 forced guesses on board 10;
  WRAPAROUND at the same schedule 100%; HUGE six points up (26.8 to 32.0%) 98 to 100%, its 24
  to 30 HP absorbing 5.8 HP of guesses on board 10; HIVE is at its 35% ceiling already. Only
  the lock moves them: HIVE with lock 4 on boards 8 to 10 clears 88, 80 and 60%, and forced
  guesses go from 0.5 to 4.9, 6.7 and 7.2 a board, which is exactly the guess-decided top that
  decisions 0041 and 0042 took off EXTREME and ORACLE. So the target as written (a grade-2
  player at 90% falling to 70%) is the wrong target for a descending-distribution ladder at a
  shallow lock: such a ladder is always clearable by a reader who misses nothing, and what it
  costs a person is scanning (12 to 19 moves on offer per pass, 74 to 151 effort on NORMAL and
  HUGE) and the slips telemetry will measure. No plain ladder was moved. If the owner wants
  NORMAL, WRAPAROUND, HUGE or HIVE to bite at the top, the lever is the lock one deeper on the
  last three boards, and the price is the kind of hardness, not the amount.
- **The shapes repeat the plain ladders' finding, all eleven of them.** Measured 27 September
  2026 at 40 seeds on candidate files, the magic shapes spending mana (the table above is
  spell-less; DONUT is decision 0045 and was not re-measured). At the shipped schedules a grade-2
  player clears 93 to 100% of boards 8 to 10 on every shape. Density lifted to the 34% ceiling
  (0.3 to 3.2 points, where a shape is not already past it) leaves every one at 93 to 100% and
  only adds forced guesses: CARD from 1.6 to 4.0 a board, RAGGED CAVE from 2.7 to 4.4. The lock
  one deeper on boards 8 to 10 is again the only dial that reaches the target, and it does so the
  way it did on HIVE, with six to thirteen forced guesses a board and one of them lethal:

  | shape | shipped, boards 8 / 9 / 10 | at the ceiling | lock 4 on 8 to 10 | guesses on 10 |
  | --- | --- | --- | --- | ---: |
  | CROSS | 100 / 100 / 100% | 100 / 98 / 100% | 90 / 85 / 80% | 2.2 to 9.6 |
  | WRAPPED CROSS | 100 / 100 / 100% | past it | 100 / 95 / 88% | 1.1 to 8.4 |
  | DIAMOND | 100 / 100 / 100% | 100 / 100 / 98% | 95 / 93 / 85% | 1.2 to 6.5 |
  | RAGGED CAVE | 100 / 98 / 93% | 100 / 93 / 100% | 57 / 57 / 57% | 2.7 to 9.7 |
  | GEAR | 100 / 100 / 98% | 100 / 100 / 100% | 83 / 78 / 57% | 1.9 to 12.5 |
  | CARD | 100 / 98 / 100% | 98 / 98 / 95% | 75 / 70 / 70% | 1.6 to 13.0 |
  | VALENTINES | 100 / 100 / 98% | past it | 95 / 93 / 90% | 1.6 to 9.7 |
  | STAR | 98 / 98 / 100% | 100 / 100 / 93% | 83 / 75 / 60% | 2.3 to 10.1 |
  | PYRAMID | 100 / 100 / 100% | past it | 100 / 100 / 100% | 0.0 to 1.6 |
  | ULTRA HIVE | 100 / 100 / 95% | past it | 83 / 83 / 75% | 1.3 to 6.7 |
  | PETRI DISH | 100 / 100 / 100% | past it | 95 / 93 / 83% | 1.2 to 10.2 |

  PYRAMID's face-up base is immune even to the lock. RAGGED CAVE, GEAR, STAR and CARD fall
  through the target to 57 to 70% because their guesses are dearer (a cavern, a tooth, a point,
  a suit's edge is a guess with fewer neighbours to read), so a lock retune would need the
  density stepped back as well, as HUGE x EXTREME's did. No shape was moved: the owner's ruling
  on the plain ladders applies unchanged, that the lock buys guess-decided top boards, which is
  a different kind of hardness and not the one these ladders are for. What a shape costs a person
  is scanning, 5 to 11 moves on offer per pass (16 on PYRAMID), and the readings above are the
  lever if that ruling changes (decision 0058).
- **The placement ladders do not even have the lock as a lever.** Measured the same day, 40 seeds,
  grade 2 with the rule's own reads, numbers hidden where the game hides them, WORKOUT spending
  mana. At the shipped schedules boards 8 to 10 clear 95 to 100% on every one. Density has
  nowhere to go: PAIRS and DOMINOES sit on their structural 25% cap, CHECKERBOARD is at 38.5%,
  PATROL's routes jam past 8.5%, and PACKS lifted two points to 34% and CONGA LINE a point and a
  half to its 33.5% cap clear 90% and 85% of board 10 at two to three forced guesses, which is
  the target's board-10 figure only at the grade-4 player's expense (93% and 88%, under the 95%
  the target holds it to). And the lock one deeper on boards 8 to 10 does nothing on a board
  whose rule names the tiers for you: CHECKERBOARD 100 / 100 / 100%, PAIRS 100 / 100 / 98%,
  DOMINOES 98 / 100 / 95%, CONGA LINE 95 / 100 / 95% and PACKS 93 / 98 / 90%, with forced guesses
  on board 10 up by a third of one (PACKS by 1.2, from 1.3 to 2.5); PATROL is 100% and
  guess-free either way. The one
  exception is DUNGEON, a five-tier board with no tier rule, where the lock does what it does
  everywhere else: 78 / 70 / 55%, six to nine forced guesses a board, one of them lethal. WORKOUT
  already runs lock 4 from board 4 and Exercise carries a grade-2 player to 98 to 100% even at
  34% density with six forced guesses on board 10. Nothing was moved. The placement ladders'
  reward is understanding the rule, and the instrument says that once understood they are
  clearable; what remains to measure is how often a person misreads the rule, which is
  telemetry (4.8).
- **The new ladders sit where their curves put them.** PYRAMID's face-up base rows make it as
  gentle as EASY; GEAR, CARD, VALENTINES and STAR, tuned onto ARCANE's curve, corner a grade-2
  player about as often as ARCANE does and STAR alone leans on grade 3 (14% of boards);
  PATROL's moves-on-offer figure is 1.0 by construction, one open per reading where the
  creatures walk, and the player waited out every stuck point and never guessed.
- **SPRINKLE DONUT was tuned onto the target from the start.** With every creature shown, a
  cell is never a question of where, only of what, and density is the whole dial: at 56.4 to
  59.1% a grade-2 player clears 93% of board 1 falling to 65% of board 10. What it demands is
  sums over counted creatures, with DONUT's scanning (3.3 to 4.9 moves on offer per pass) and a
  what-if or a count on a fifth to a quarter of the top boards.
- **The search ladders are single-mistake games a deducer loses.** Before its retune BLIND
  forced two to three guesses a board and every one is death: 4 to 7% cleared, 0% of board 10.
  Both rows are as retuned on 26 September 2026 (decisions 0043 and 0044, density 16.5 to 19.7%
  and 16.0 to 19.4% in place of NORMAL's and HUGE's), on a target proposed for the one-mistake
  ladders and open to being moved: 88% and 78% of board 1 falling to 28% and 33% of board 10 at
  grade 4. Notice what is left once
  the density is right: a quarter of its boards need a what-if or a count, the highest share of
  any ladder, because proving a cell empty is all there is.

## 10. Open questions and known limits

1. **The grades are an opinion until telemetry.** They follow the Sudoku raters' practice and the
   mamono community's own account of how it plays, and they are consistent with each other, but
   the cost of a grade-3 what-if against ten grade-1 subtractions is a guess.
2. **Attention is a first model.** With `--attention=R` the player looks within R cells of its
   last action first and scans the whole board only when nothing there yields at that grade, so
   the grade stays what is measured and locality only decides where a grade is found; a scan is
   counted (`scans`) and costed (`SCAN_COST`). Measured 26 September 2026 at ten seeds over the
   ten boards, radius 6: HUGE scans 200 times a ladder against NORMAL's 79, and per pass
   WRAPAROUND scans most (a third of its passes, with no edges to anchor on) and EXTREME least
   (one in twelve, its frontier dense enough that the next move is close). So the figure
   separates the ladders, on size and on shape. What it still does not model is missing a move
   that is in view; that needs telemetry to calibrate.
3. **Marks are always right.** The trusted wrong mark is the community's fatal error and is not
   modelled; a seeded error rate is the third knob, after attention and deferral.
4. **Spells are a policy, not a person.** With `--spells` the player spends mana before HP the
   way section 8 of the catalogue says (Reveal on the cell it would gamble on, else Census on
   the number over it, else Beacon, two information casts a stuck point; an Exercise before a
   guess whose worst case is above the level). The baseline in 9.1 is spell-less; the magic
   ladders' retunes are measured with spells on. Whether people spend that well, or hoard, is a
   telemetry question.
5. **CONGA LINE's adjacency reads are graded with its reach read** at grade 3, because the engine
   proves them together in `emptied`; splitting them is a later refinement.
6. **SUDOKU** needs its own catalogue (singles, hidden singles) and is not measured.
7. **Two things the map found that are not this milestone's.** The honest player's pair
   subtraction paired numbers by coordinates and so never subtracted across a wrapped seam, which
   made it weaker on WRAPAROUND and WRAPPED CROSS than elsewhere (issue #9, fixed 28 September
   2026: WRAPAROUND measured the same, WRAPPED CROSS moved by 0.1 stuck points); and the pencil
   palette's strike-through beside a beaten creature on PAIRS and DOMINOES showed the partner's
   tier that decision 0012 hid from hover, fixed by decision 0061 (issue #10).
