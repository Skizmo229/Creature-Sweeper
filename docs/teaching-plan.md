# Teaching the game: the tutor, the school and the field guide

The catalogue in `docs/strategies.md` says how a person clears a board, graded by how much has
to be held in the head at once. The game itself teaches three rules on one card
(`src/ui/screens/howto.ts`) and then leaves the player to die their way to the rest. This plan
puts the catalogue inside the game in three forms: a **tutor** that explains the next provable
move on the board the player is stuck on, a **school** of short lessons that teach the tricks one
at a time on boards drawn for the purpose, and a **field guide** that holds the catalogue itself
where a player can read it.

Drafted 26 September 2026, proposed as **Milestone 5**. Not yet adopted; nothing here has been
built. It depends on Milestone 4's instrument, the graded player, and on nothing else that is
still open there: the tricks are written and tested, and the retune can go on beside this.

## 1. The problem

- **The game teaches by death.** The how-to card states the sum rule, the level shield and the
  guess budget, and EASY has no Sweep so that the sum rule is learned by hand. Everything past
  that, from "subtract what you can see" to the endgame's hunt for the last of a tier, is
  learned or not. The mamono community's own account (`docs/strategies.md`, sources) is that
  people learn at the board, stuck, from someone pointing at the number they missed.
- **The hint line describes controls, not play.** `hintText` says what a click does in the
  current mode and, once, the rule a ladder adds (the crawl, the walk, the sprinkles). It never
  says why a cell is safe.
- **Sweep proves and does not explain.** The engine's Sweep performs the raw ring, the
  subtraction of open tiers and the placement rules' proofs at a keypress, and its label counts
  what it can prove. A player who leans on it clears boards without learning what it did, and
  meets the ladders without Sweep, or the grade-2 moves it never makes, unprepared.
- **The catalogue is unreachable from the game.** It is a Markdown file in the repository. A
  freeware player never sees it.

## 2. What is already there

The plan is shaped by how much of a teacher already exists.

- **The tricks are code.** Each of the catalogue's twenty tricks is one technique in
  `src/sim/tricks.ts`, at the catalogue's grade, with a table in section 7 of the catalogue
  mapping the two. A technique takes a `View` and adds to a `Moves`: cells safe to open, cells
  named exactly, candidate sets narrowed.
- **The reader reads only what a person can see.** `src/sim/reader.ts` builds a `Constraint`
  from each visible number (the cell, what is still hidden around it, and which covered cells
  that is spread over), and reads a beaten creature's number only where the game draws it. The
  graded player's alarm checks every conclusion against the hidden truth, and
  `test/graded.test.ts` holds `unsound` at zero on every kind of board. A teacher built on this
  cannot know more than the player, and cannot be wrong.
- **The UI already imports the sim.** The dev handle's `cs.runFull` drives a Full Run from the
  browser, so there is no boundary to cross.
- **The board is a pure function of (config, seed)**, and the settings galleries are real boards
  rendered by the real renderer (decision 0025, `src/ui/preview.ts`). Diagrams that are real
  boards is a habit the repository already has.
- **The shell has the pieces.** The hint line under the board, the in-page overlays
  (`src/ui/overlays/ask.ts`, the how-to and clear cards), the cursor highlight
  (`drawHighlight` in `src/ui/board/overlays.ts`, styled by `BoardDisplay.highlight`), the Sweep
  label that counts provable cells, and the per-run records in `src/ui/progress.ts`.

What is missing is small and specific: a trick does not say *which numbers* proved a move, there
is no way to build a board from a drawing, and there is no screen for any of it.

## 3. Principles

These are the constraints every part below meets. Each is a sentence a reviewer can check.

1. **The teacher sees what the player sees.** It reads the board through `reader.ts` and nothing
   else. It never touches a covered cell's tier. A hint that knew more than the player would be a
   note that exposes them (`docs/invariants.md`; CLAUDE.md's rule on notes).
2. **The teacher never acts.** It opens nothing, marks nothing, pencils nothing. Sweep is the
   thing that acts; the tutor is the opposite of Sweep. HP stays a guess budget because the
   player still makes every move.
3. **One trick at a time, lowest grade first**, exactly as the graded player passes. The tutor and
   the difficulty instrument are the same code, so what the tutor calls a grade-2 board is what
   the retune calls one, by construction and not by agreement.
4. **The catalogue is the single source of the words.** Each trick's name, grade and one-line
   explanation live in one table that the tutor's caption, the school's script and the guide's
   entries all read, and a test holds that table to section 7 of the catalogue.
5. **Nothing is hand-drawn.** A lesson board and a guide diagram are real `Game`s rendered by the
   real `BoardView`, for decision 0025's reason: a picture that has quietly stopped being true is
   worse than none.
6. **The engine stays headless and the instrument stays unchanged.** The tutor lives in
   `src/sim` and `src/ui`. The one change to the tricks adds a field and alters no conclusion;
   the golden outputs stay byte-identical through every commit of this milestone.
7. **Teaching never gates play.** No ladder waits on a lesson. The school is offered, the tutor
   is a key, the guide is a page.

## 4. Part 1: the tutor

The tutor answers one question, on the board the player is playing, at the moment they are
stuck: *is there a move here, and why?*

### 4.1 What the player sees

A key (`H`, unused today) and a HUD button beside Sweep. Pressing it runs the tricks in grade
order on the board as it stands and shows the first move the cheapest yielding grade offers:

- the number or numbers that prove it, lit, each with its ring drawn the way the cursor
  highlight draws a hovered cell's neighbours;
- the cells it concludes, tinted: safe to open in one colour, named above the level in another
  with the tier written on them, narrowed in a third with the candidates;
- one caption where the hint line is: the grade, the trick's name and its sentence, with the
  numbers filled in. "Grade 1 · The last cell. The 4 has one covered neighbour left, so that cell
  is a 4."

Pressing again shows the next move at that grade, then the next grade up. Any click on the board
dismisses it, and the click is the player's own. When no grade yields the caption says so, in the
catalogue's words for that case: "Nothing is provable. Check the counters and take every free
kill first." (The stuck case grows in 4.5.)

The tutor is on every ladder, EASY included: EASY has no Sweep so the sum rule is learned by
hand, and the tutor is the opposite of Sweep, so it belongs there most of all. On the ladders
whose tricks are their own (met partner, corridors, the lone dark square) the tutor teaches them
the first time they apply, which is the moment a player can take them in.

### 4.2 Provenance: the one change to the tricks

A `Moves` records what a trick concluded and not which constraints proved it, because the
instrument never needed to know. The tutor does. `Moves` gains a fourth field:

```
because: Map<Cell, Proof>       Proof = { trick: TrickId; constraints: readonly Constraint[];
                                          supposed?: { cell: Cell; tier: number } }
```

The shared helpers (`settle`, `concludeSum`) take the trick and the constraints they are working
from and record them beside each conclusion; the counting tricks record the set of constraints
that accounted for the total, and `what-if` records the supposition it refuted. The graded player
ignores the field. Its measurements, the golden outputs and `test/graded.test.ts` are unchanged,
and the commit says so.

### 4.3 The tutor's pass

`src/sim/tutor.ts`, headless: `explain(game, options): Lesson[]`, one `Lesson` per move the
cheapest yielding grade offers, ordered nearest the player's last action first (the attention
model's locality, so the tutor points where a person would look). A `Lesson` is the proof, the
concluded cells, the grade and the filled-in caption. `test/tutor.test.ts` holds it to the same
alarm as the graded player: on every kind of board in `test/graded.test.ts`'s list, at several
points in a game, every cell a lesson calls safe or names is checked against the truth and the
count of wrong ones is zero.

Two questions about what the tutor may read:

- **The player's marks.** The reader subtracts a mark as the tier it claims, because the graded
  player writes only proven marks. A person writes guesses. The tutor therefore reads the board
  twice: first trusting nothing but open cells, and only if that yields nothing, trusting marks,
  with the caption saying so ("trusting your mark of 4"). This mirrors Sweep's two buttons, S and
  D, and the catalogue's warning that the trusted wrong mark is the fatal error.
- **The player's pencil.** Never read as a bound, for the invariant's reason. The tutor's
  candidate sets start full on every press.

Cost: the instrument runs forty seeds of ten boards in seconds, so one pass on one board is
milliseconds at grades 0 to 2. Grades 3 and 4 are heavier on HUGE. The budget is one frame at
the first press; if a measurement puts a grade over it, that grade runs in a worker, and the
caption shows the lower grades first meanwhile.

### 4.4 What a hint costs, and what it records

Sweep is free and charged; the tutor is free and counted. Each press is a hint, the clear
screen says how many the board took ("cleared with 2 hints"), and a hinted board does not set a
best time, the way the galleries' boards do not (`docs/ui.md`). Whether a hint should also carry
a charge or a Sweep-like meter is the owner's call (section 8); the plan's position is that a
player asking why is doing the thing the game wants, and the best-time rule is enough to keep
the tutor out of the record book.

Hints per board, per ladder, per grade, go into the save as the runs do. That is the first
telemetry the tuning plan asks for (`docs/human-tuning-plan.md`, open question 1): where players
ask for help, and at what grade, is where the boards are hard for them, board by board, and it
comes for free from a feature the player wants anyway. The dev handle exposes it (`cs.hints`).
Nothing leaves the machine; the game is offline freeware.

### 4.5 The stuck case

When no grade yields, the board is at a forced guess, which the hard ladders' top boards force
on everyone (`docs/tuning.md`). The catalogue's section 8 says what to do, and the tutor can show
two of its points without saying anything about odds:

- **Know the worst case.** The cell whose ceiling is lowest, with the ceiling and its cost from
  the damage table at the player's level: "Worst case here: a tier 3, costing 6 of your 10 HP."
  This is a fact about the rules, computed from the constraints and the counters.
- **Two more levels.** Whether the cells named or narrowed on the board would be free kills at a
  higher level, and whether the EXP for it is on the board among free kills: "At level 3 these
  four cells are free. Level 3 is two free kills away."

It does not pick a guess. The reader who wants odds has the counters, and the catalogue says the
board's average is total tier left over covered cells.

### 4.6 Steps

Each a commit, on branch `m5-tutor`; the owner reviews and merges.

1. Provenance in `tricks.ts` (4.2). Behaviour-neutral; golden byte-identical.
2. The trick text table, `src/sim/tricktext.ts`: for every `TrickId` a name, the catalogue's
   sentence as a template, and the section it lives in. `test/tricktext.test.ts` holds every id
   to section 7 of `docs/strategies.md`, both ways.
3. `src/sim/tutor.ts` and its test (4.3), including the two readings of marks.
4. The board overlay: `drawLesson` in `src/ui/board/overlays.ts`; `BoardDisplay` gains
   `lesson: Lesson | null`. Verified with canvas hashes as the Milestone 3 splits were.
5. The key, the button, the caption in place of the hint line, dismissal on click, the hint
   count in `progress.ts`, the clear screen's line, and the best-time rule.
6. The stuck case (4.5).
7. A Settings toggle (Tutor: on, off), the rules in `docs/ui.md`, and a decision record.

## 5. Part 2: the school

Eight short lessons, one trick each, on boards drawn so that the trick is the only move.
Grades 0 to 2 and the guessing rules: the tricks that make a grade-1 player, who "can still
clear a great many boards", and the two grade-2 tricks that make the hard ladders clearable.

### 5.1 The lessons

| # | Lesson | Trick | Grade | The board | What the player does |
| --- | --- | --- | --- | --- | --- |
| 1 | A number is a sum | the raw ring | 0 | A 2 at level 2 over five covered cells; one of them is two 1s. | Opens all five; sees a 2 that was two 1s, and one that was a 2. |
| 2 | Your level is a shield | the free kill, the counters | 0, 1 | Two 1s marked at level 1, a 3 beside them. | Kills the 1s for free, reaches level 2, reads the LV counters, sees the 3 stay locked. |
| 3 | Subtract what you see | residual ring | 1 | A 5 beside a beaten 3, three covered cells. | Hovers the beaten creature, subtracts, opens the three. |
| 4 | The last cell | last cell | 1 | A 4 with one covered neighbour. | Marks it 4; learns that a mark above the level locks the cell; comes back at level 4. |
| 5 | The counters | counters | 1 | A 5 over two cells with no 5s left. | Reads the counter, concludes 4 + 1 or 3 + 2, opens at level 4. |
| 6 | The 1-2-1 | subtract | 2 | The catalogue's wall: `1 4 3 3`. | Names the 3, opens the two empties, names the 1. |
| 7 | Bounds and the pencil | bounds | 2 | A 9 over two cells. | Pencils "4 or 5" on both; learns the pencil is read by its lowest candidate. |
| 8 | Guessing well | none | — | A forced guess that two free kills elsewhere would make unnecessary. | Takes the free kills first; reads the worst-case cost; then guesses, or need not. |

A ninth, optional, for the endgame: **the last of a tier** (grade 4), one 5 left and a 9 over two
cells, because the last few level-ups on every ladder are exactly that hunt.

The ladder-specific tricks (met partner, corridors, the whole pack, the sprinkles, the lone dark
square, the partner's tier) are not school lessons. They mean nothing off their ladder, and each
has a first board on which it is learned; section 5.5 puts them there.

### 5.2 Boards from drawings

Every lesson board is a literal drawing, and so is every diagram in the catalogue, so the engine
gains one constructor: `Game.fromLayout(truth, shown, options)`. `truth` is the grid as it is,
`shown` is the grid as the player sees it, in the catalogue's own notation so the two documents
share one language:

```
truth:   .  digit  #          empty ground, a creature of that tier, a hole
shown:   ?  .  digit  kN  mN  covered, open ground, an open number, a beaten creature of tier N,
                              a mark of N
```

The config is derived from the drawing: the quantities are counted, `startLevel` is an option,
and every threshold is set to `C_k` exactly (`cumulativeExp`, `src/engine/config.ts`), so each
level-up on a lesson board is "kill everything at or below", which is also the easiest rule to
narrate. Facts 1 to 3 of `docs/invariants.md` hold by that construction and `test/invariants.test.ts`
gains a case saying so. The opening is the `shown` grid and `dealOpening` is not called. A
placement rule and shape may be passed for the ladder-specific diagrams, which need the rule's
display (the sprinkles, the bonds) to mean anything.

This constructor pays twice more. **The catalogue's diagrams become tests**: `test/strategies.test.ts`
parses every fenced diagram in `docs/strategies.md`, builds it, runs the tricks, and checks that
the trick the surrounding text names fires on exactly the cells it says, and that no lower grade
does. A diagram that drifts from the code fails the build, which is how `docs/architecture.md`'s
map is held to the tree today. And the engine's tests can state a board as a picture where they
build one by hand now.

### 5.3 The script

A lesson is a board and a list of steps. A step says something, lights something (through the
tutor's `Lesson` overlay, so the school and the tutor draw one way), and waits for one thing: a
cell opened, a cell marked or pencilled with a tier, a key pressed, or nothing. The script is
data (`src/ui/school/lessons.ts`), the words drawn from the trick text table where a trick is
taught, so that a change to the catalogue's sentence changes all three places.

On a lesson board a click that no trick has proven is refused with a caption ("Nothing proves
that cell yet; look at the 4") rather than fought, except on lesson 8, where guessing is the
lesson. This is a rule for lesson boards alone, made in the UI (the click never reaches the
engine), and it is what keeps a lesson from derailing into a death that teaches the wrong thing.
Every lesson can be left at any point and restarted.

`test/school.test.ts` plays every lesson with the graded player at the lesson's grade and checks
that it makes the expected move at each step with no guess, and that the grade below does not.
So the school is held to the same instrument as the ladders.

### 5.4 Where it lives

Not in `ladders.json`. The school has no schedule, no tuning and no seed, and `ladders.py` should
not know it exists. It is a screen: "School" on the ladder screen beside "How to play", and the
how-to card ends with a second button, "Take the lessons". Progress (which lessons are done) goes
in the save beside the ladders' records, with no unlock hanging on it (principle 7). A first-time
player sees the how-to card as today; the card offers the school and does not require it.

### 5.5 The ladders' own lessons

The first time a player opens a ladder whose placement rule or shape adds a trick, an interstitial
card in the how-to's style states it, with the catalogue's diagram for it drawn as a real board
of that rule: met partner on PAIRS and DOMINOES, the whole pack on PACKS and CONGA LINE, corridors
on DUNGEON, the sprinkles on SPRINKLE DONUT, the lone dark square on CHECKERBOARD, the walk on
PATROL, the face-up base on PYRAMID. Which ladders get one is asked of the data: a card exists
where the placement rule's or shape rule's record names a lesson, never by comparing a name
(CLAUDE.md's rule that has bitten three times). The hint line's ladder sentences stay, as the
reminder after the card.

### 5.6 Steps

Branch `m5-school`, after Part 1 has merged.

1. `Game.fromLayout` and its invariants case (5.2).
2. The catalogue's diagrams as tests (5.2). This may find that a diagram is wrong; fixing the
   diagram is a docs commit, and the finding goes in the commit message.
3. The lesson data and the step runner (5.3), headless, with `test/school.test.ts`.
4. The school screen, the refusal caption, the progress record (5.4).
5. The ladder interstitials (5.5), one commit for the mechanism and the data on the rules, one
   per card's words if they need discussion.

## 6. Part 3: the field guide

The catalogue, in the game, for reading: sections 1 to 6, 8 and 9 of `docs/strategies.md`,
each trick an entry with its name, grade, the words, and its diagram drawn as a real board.

### 6.1 One source, tested

The catalogue is written for two readers and reads well as prose; turning it into a data file
would cost it that. So the guide's words are a table in code (`src/ui/guide/entries.ts`, one
entry per `TrickId` plus the entries for section 1, 8 and 9, each with a heading, a body and a
diagram in the layout notation), and `test/guide.test.ts` holds the table to the document: every
`TrickId` in section 7 has an entry, every entry's heading appears in the catalogue, and every
entry's diagram, built with `fromLayout`, fires its trick. The words are duplicated; their
presence and their truth are not left to memory. If the duplication proves a nuisance the
alternative is to generate section 2 to 6 of the catalogue from the table, which is the
direction `ladders.json` already flows.

### 6.2 The screen

An overlay screen in `src/ui/screens/guide.ts`, scrolling, one section per grade, the diagrams
rendered by non-interactive `BoardView`s the way the settings galleries are. Each entry says
which ladders it applies to, asked of the placement and shape rules, and each ladder's card on
the ladder screen can link to its own entries. Reached from the how-to card, the ladder screen,
the tutor's caption ("more") and the school's steps. The overlay rules in `docs/ui.md` apply:
fixed position, the pointer held while it is up, no `window.confirm`.

### 6.3 Steps

Branch `m5-guide`, after `Game.fromLayout` has merged (it is Part 2's first commit, and can be
taken first on its own if the guide is wanted before the school).

1. The entries table and its test (6.1).
2. The screen and its entry points (6.2).
3. The per-ladder links and the ladder cards' "how to play this one".

## 7. Order

Part 1 first, because it is usable on every ladder at once, it changes the least, and Parts 2
and 3 draw with its overlay and speak with its table. Then `fromLayout` and the diagrams-as-tests,
which serve both remaining parts and the test suite. Then whichever of the guide or the school
the owner wants first; the guide is a few days, the school a couple of weeks, and the plan's
preference is the guide, since it makes the whole catalogue reachable before any of it is scripted.

Each step is a branch, one commit per move, `npm run check` before hand-over, golden outputs
byte-identical throughout (nothing here is meant to alter behaviour), and the owner merges.
Decisions go to `docs/decisions/`; bugs found go to GitHub Issues, drafted for approval.

## 8. Decisions for the owner

1. **Hints and the record book.** The plan says a hinted board sets no best time and carries no
   other cost. The alternatives are a charge like Sweep's, or nothing at all.
2. **Trusting marks.** Two readings, open cells first and marks second, with the caption saying
   which (4.3). The alternative is one reading that trusts marks, as D does.
3. **Refusing unproven clicks in the school** (5.3). The alternative is to let a lesson be lost
   and restarted.
4. **The stuck case** (4.5): the worst case and the levels-away figure are facts about the rules;
   naming a cell to guess would be advice about odds, and the plan does not. Confirm.
5. **The key.** `H` is free. `?` is the other candidate.
6. **The guide's words** duplicated and tested, or the catalogue's trick sections generated from
   the table (6.1).
7. **A post-mortem.** The death screen could say "the move you missed": the tutor's pass on the
   board as it stood before the fatal click. It needs the pre-click state kept, which is one
   snapshot; it is cheap once Part 1 exists and is not in this plan's scope until the owner wants
   it.
8. **The ninth lesson** (the last of a tier, grade 4). In or out.

## 9. Definition of done

- The tutor is on every ladder, and `test/tutor.test.ts` shows zero unsound conclusions on every
  kind of board in `test/graded.test.ts`'s list.
- The golden outputs are byte-identical to `main` at every commit of the milestone.
- Every `TrickId` has a text entry, a guide entry and, where the catalogue gives it a diagram, a
  diagram that builds and fires (tests in 4.6, 5.2, 6.1).
- Every school lesson is completed by the graded player at its grade with no guess, and not by
  the grade below.
- The catalogue's diagrams are tests, and all pass.
- Two people have played the school and used the tutor on NORMAL and EXTREME: the owner, and one
  Minesweeper player who has never played mamono sweeper. What they say goes in section 10 of this
  plan, and their hint counts by grade are the first row of the telemetry the tuning plan is
  waiting for.

## 10. Status

Drafted 26 September 2026. Nothing built. Awaiting the owner's answers to section 8.
