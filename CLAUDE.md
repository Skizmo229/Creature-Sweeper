# Creature Sweeper — working notes

A remix of **mamono sweeper** (itself a Minesweeper remix) with heavy customisation, QOL, and a
progression mode. Intended for freeware release if it ever ships.

Read `README.md` first for layout and commands. This file is the stuff that is not obvious from
the code and expensive to rediscover.

---

## The four load-bearing facts

Almost every design decision is constrained by these. Violating one silently breaks a run rather
than throwing, so they are all covered by tests in `test/invariants.test.ts`.

**1. The tuning identity.** Let `C_k` be the total EXP available from every creature of tier ≤ k.
The upper level thresholds equal `C_k` *exactly*, so the last few level-ups each require killing
literally every creature at or below that tier. Ladder difficulty is driven by **lock depth**: how
many of the top thresholds are full-tier-clear gates. This was reverse-engineered from the
original game's data, not invented.

**2. The zero-damage guarantee.** At level k you can safely kill every tier ≤ k, which yields
`C_k` EXP, and the threshold to reach k+1 is at most `C_k` by construction. By induction **every
board is clearable without taking a single point of damage**, whatever the distribution shape. So
HP is a *guess budget*, not a combat resource — you spend it on 50/50s and misreads, never on
required fights. `npm run sim` verifies this across every board.

**3. EXP must always be collected.** Because the gates *are* `C_k`, any effect that removes a
creature without granting its full EXP makes that gate permanently unreachable and silently kills
the run. Applies to every spell, item or mechanic that can remove a creature. This is why no spell
removes creatures — the whole set is information, protection and movement.

**4. A cell's number is the SUM of neighbouring tiers, not a count.** Everything about board
shape follows from this. Fewer neighbours = fewer unknowns = easier to deduce. Edges and corners
are *free information*, which is why wraparound (which deletes them) is the only variant that is
harder, and every cut-out shape is easier.

---

## Architecture

**`src/engine/` is headless and must stay that way.** No DOM, no I/O, no timers. `npm run
typecheck` runs twice on purpose: the second pass uses `tsconfig.engine.json`, which compiles the
engine with **no DOM library at all**, so a stray `window` is a build error rather than something
discovered when it fails to run headlessly.

**Adjacency lives in exactly one function** — `neighbours()` in `src/engine/board.ts`. Numbers,
cascades, the opening, Sweep's proof and Census all read through it. That is why hex grids,
wrapped edges and cut-out shapes each cost almost nothing in the engine: they are all one
function. Keep it that way. Anything that *iterates* the grid rather than asking for neighbours
(creature placement, the search-mode empty count, `safeCells`, the renderer) is where new board
features actually cost work.

**Tuning data flows one way:** `design/ladders.py` → `design/data/ladders.json` → the engine. The
engine never duplicates those numbers.

**A run is engine state, not UI state.** `src/engine/run.ts` owns the ten-board sequence, the HP
pool and the heal; `src/ui/app.ts` only ever renders `run.game`, which is an ordinary `Game`. That
split is why Full Run needed no changes at all to input, rendering, Sweep, spells or the HUD's
arithmetic — and it is why `npm run sim:run` can play whole runs headlessly.

---

## Gotchas that have already bitten

**Duplicated board logic drifts.** `design/opening.py` was a Python reimplementation of the board
rules. It agreed with the engine to 0.17 cells — until boards gained hex grids and wrapped edges,
which it knew nothing about, leaving three ladders with no data. It was replaced by
`src/sim/opening.ts`, which drives the real engine. `design/placement.py` was the same pattern and
went the same way, into `src/sim/placement.ts` — and the port caught it already wrong: it computed
numbers with wrapped edges but flood-filled the opening without them, so a zero region crossing the
seam was cut in two and only the larger half counted. The engine's flood fill says wrapping makes
the opening 7–17% LARGER than scatter on the three test beds, where Python had it 0–4% smaller —
which may be part of why WRAPAROUND measures as the gentlest counted ladder. The four clustering
strategies that never shipped (triads, pairs, lairs, bands) still exist only in that file, as tier
layouts handed to the engine to measure; the half that could drift — numbers, opening, adjacency —
is the engine's own. It also measures every placement rule that did ship against the same creatures
scattered, on its own board 5, which the Python could not: PAIRS opens 57% smaller, DOMINOES 26%,
CHECKERBOARD about the same, PACKS 184% larger and CONGO LINE 159%.

**`design/ladders.py` carries its own copy of the shape predicates**, because it must know how
many cells a shape leaves before it can apportion creatures, and that count feeds `C_k`. This is
deliberate duplication, guarded by a test asserting the engine's mask produces exactly the cell
count `ladders.py` recorded for every shaped board. If you touch either copy, that test is the
alarm.

**Parameterise masks in cells, never in fractions of the board.** A ring "20% of the width" thick
is nine cells on a long side and four on a short one — the same board playing two different games.
Once parameterised in cells, aspect ratio stops affecting difficulty *at all* (measured: identical
to two decimals on 30×16 vs 22×22).

**The cave's cell count is a promise, not a measurement.** Every other shape is a per-cell
predicate, so `ladders.py` can count what it leaves. A cave cannot be counted ahead of time and
its silhouette moves with the seed — which is why it was deferred, because `C_k` needs the quota
fixed before the board exists. It is resolved by inverting the direction: the count is *chosen*
per board in `ladders.py`'s `cells` schedule, `shapeParam` carries it into the engine, and the
generator spends exactly that many cells. A mask a few cells light would not throw; the board
would just be mistuned on that seed, with the top gate — which *is* `C_k` — one kill out of reach.
The test `leaves exactly the cell count the ladder was tuned against` is the alarm. Nothing else
about cave is special: quota, thresholds and the zero-damage guarantee all come straight from the
fixed shapes.

**The cave is grown, never trimmed, and that is what buys the minimum width.** Cells are laid down
as whole 2×2 squares and nothing is ever removed, so every cell stays inside a full square
forever: no passage one cell wide can exist, and none can appear later. Corner-to-corner touches
are refused at placement for the same reason. Both are guarantees by construction rather than
repairs, which is the only reason they are cheap — the earlier trim-a-noise-field version could
not have had either at any price, because trimming is what *creates* one-cell threads.

**Trimming to a count and growing to a count look different even though they end at the same
number.** The trimming version was tuned to death and never stopped reading as a subtraction: pare
a cave from its rims and where it stops is an accident of the order you took cells in, and every
ordering has a signature — thinnest-first shaves off every protrusion, most-connected-first fills
every bay, both reach a smooth oval within about forty cells, and oldest-first burrows into one
flank leaving threads. Growth has no such failure mode, because a cell is only ever put somewhere
on purpose.

**Punch the caverns before growing, and keep one only if the cave still fits round it.** Caverns
are what stop a budget spent from a single seed settling into a disc. But a cavern that cuts the
space in two is worse than none: growth fills whichever chamber it started in and the rest of the
board sits empty. Testing each cavern against the remaining room fixes that and also means growth
cannot fail for want of space, since the space was measured against the budget before a cell was
laid. Growth is then given about 8% more room than it needs, and the leftovers are the raggedness.

**The cave's rim is a superellipse, not an ellipse.** An ellipse wastes a fifth of the bounding box
on corners no cave reaches, which showed up as a ladder needing 50×25 boards to hold 300 cells.
Power 2.6 keeps the outline organic — the wobble harmonics are what stop it reading as a rounded
rectangle — and lifted the usable share of the box from 26% to 40%.

**A wall stops information dead, and that is what DUNGEON is.** A room's numbers constrain that
room and nothing else; all that crosses a hallway is the couple of cells at its mouth. So every room
is a separate puzzle needing its own foothold, and the count of forced guesses is set by how many
rooms the map is cut into rather than by how many creatures are on it. Measured, and the size of it
was the surprise: run at the ragged cave's own densities and cell counts, the dungeon cornered a
deductive player 7.4 times on board 1 and 8.2 on board 10, clearing 75% and 0%, where the cave at
those same numbers cornered it 1.0 and 5.5 and cleared 100% and 75%. Same density, same cells — the
difference is entirely the walls. That finding is still true and no longer sets the density on its
own: one-cell hallways and empty doorways hand back a large free scaffold, which is why the schedule
climbed from 9.0–14.6% to 12.8–26.4%. It is the only schedule here derived from a play measurement
rather than carried over from a neighbour, and it has been re-derived every time the mode changed.

**Which is why the dungeon sizes its rooms from the budget instead of rolling them.** Rooms were
first drawn at a fixed size, so a bigger board simply held more of them and the room count nearly
doubled across the ladder — an untuned difficulty ramp on the one axis that matters most, hidden
underneath the one being tuned. `ROOM_COUNT` pins it at seven and the mean side is derived from the
cell budget, so board 10 is a bigger version of board 1 rather than a different game, and density
goes back to being the dial. That change alone took board 1 from 2.4 forced guesses to 1.3 and board
10 from 50% cleared to 67%.

**The dungeon has three kinds of cell, and the difference is the whole mode.** A ROOM is somewhere
creatures live. A HALLWAY is one cell wide and always empty. A DOOR is the room cell a hallway
arrives at, and it is empty too. So a corridor is somewhere you can always walk, and stepping off
one into a room is the moment you are exposed — which is what makes this play as a crawl rather
than as a minefield with corridors drawn on it. The classification cannot be recovered from the
finished grid, because a corridor cell and a room cell are both just `present: true`, so
`dungeonMap` returns it and `buildShape` carries it as far as creature placement.

**A doorway also carries a POCKET, and the asymmetry in how it is measured is what makes it fit.**
The pocket is a room cell orthogonally beside a door that is itself against a wall, and it is empty
too: the doorway bought a free read into the room, but the cell you stepped onto next was still a
blind commitment, and the crawl rule makes that the expensive kind of guess. ORTHO for "beside a
door" and the full ring for "against a wall" — taking the ring on both was tried first and it does
not merely run dense, it cannot generate at all, because a small room is mostly perimeter and the
ring swallows the perimeter whole. "Against a wall" is also what keeps it a pocket rather than a
corridor of immunity: for a door mid-wall it clears the two cells flanking it and nothing deeper.
Out of bounds counts as wall, correctly — the plan sits inside `DUNGEON_MARGIN`, so the edge of the
box is void in the way the space between rooms is.

**The earlier version built everything from 2x2 blocks, which bought a two-cell minimum width by
construction, and that is gone deliberately.** Hallways are one cell wide now, so there is no width
guarantee left to make. Two things survived the change and one did not. The cell count is still
exact, and is now easier to hit rather than harder — one-cell granularity lands on any budget, so
the `cells` schedule no longer has to be a multiple of four. Corner pinches are still refused, for
the legibility argument rather than the width one: a diagonal contact reads as a gap whatever the
width. What did not survive is being able to check either by construction; the plan is now built,
then inspected, and a pinched one is thrown away rather than repaired, because by then the budget
has been spent to the last cell.

**The hallways need two passes to stay one cell wide, and both earn their place.** An L-shaped path
cannot widen itself, so the only way a hallway comes out two wide is by running alongside one
already there. Costing both elbows and taking the tidier one roughly halves it — 270 such spots
over 570 boards down to 190 — and `thinHalls` removes the rest by taking cells back one at a time,
each kept only if the map is still in one piece without it. Trimming is safe here in a way it was
NOT safe for the cave, and the difference is worth naming: the cave trimmed toward a minimum WIDTH,
and trimming is exactly what creates one-cell threads, so it could never get there. Here one cell
wide is the target, so the thing trimming does wrong is the thing being asked for.

**`MIN_SPAWN_SHARE` exists because the density the ladder quotes is not the density you feel.**
Creatures go only in room floor, never a hallway, a doorway or a doorway's pocket, so the pool they
are dealt into is smaller than the board and the rooms play denser than the number in `ladders.py`.
That is the number to check against when this schedule is touched, not the nominal one. Before any
floor existed the ratio wandered with the seed and the scaling boards reached 37.7%, past the 34%
the rest of the game treats as the point a board stops being a puzzle.

**It was 0.78, and that number was derived rather than chosen — which is exactly why the doorway
pocket broke it.** Board 10's nominal density is 26.4%, and 26.4/0.78 = 33.8%, just inside the
ceiling: the floor WAS the ceiling, restated as a share. The pocket makes 0.78 unreachable —
measured over 40 seeds a board the share now runs 58-76% at worst and 71-82% on average, because
small boards have small rooms and a small room is mostly perimeter — so every plan on the early
boards was refused and `dungeonMap` threw on every seed. It is 0.55 now, and **the invariant moved
from the share to the thing the share was a proxy for**: `test/invariants.test.ts` bounds the
density a room actually plays at, because that is what decides whether a board is still a puzzle,
and the share only ever mattered because density/share is it. Board 1 cannot reach a 77% share at
all and still plays at ~22%, which is the whole argument in one board.

**What the pocket cost, measured:** felt room density went from 15.9-30.4% to 18.0-32.6% on an
average seed, and reaches 34.9% on the worst board-10 seed in 40. That is 0.9 points past the
ceiling, on a game where HIVE sits at 35% and CHECKERBOARD at 38.5% for stated reasons — and the
pocket hands back guaranteed-safe ground, so the board is not straightforwardly denser to PLAY even
where it is denser to describe.

**Measured since, and the pocket made the board easier to play, not harder — so the density stays.**
With the honest player over 40 seeds a board (`npm run sim:spells -- 40 dungeon`), DUNGEON now runs
0.2 → 4.7 stuck points a board and clears 98% of board 10, where before the pocket it ran 0.5 → 5.4
and cleared 83%. The felt density past the ceiling on the worst seed is a description, not a cost.
What it leaves is a ladder sitting well under ARCANE at the top — 98% of board 10 cleared against
68% — so if DUNGEON should be harder, the lever is still `ROOM_COUNT`, not density, which is already
at the felt ceiling. The complete deducer from `sim:forced` says the same thing from the other side:
at board 10 it is cornered 3.2 times a board on DUNGEON and 3.1 on ARCANE, and clears 100% against
87%. Same number of forced guesses, far cheaper ones — the doorway reads are why, and it is the "a
guess you know something about is cheaper" finding for a fourth time.

**`ROOM_COUNT` moves DUNGEON's guesses and barely moves its danger — measured, not changed.** With the
honest player, 30 seeds a board, at 7 rooms (shipped), 9 and 11: 17.8, 21.0 and 25.6 stuck points
over the ladder (ARCANE: 24.0), while the average clear rate only goes 98%, 96%, 95% (ARCANE: 82%);
board 10 lands at 4.8 / 97%, 5.9 / 80% and 6.3 / 87%. So about eleven rooms would make DUNGEON as
PUZZLING as ARCANE and it would still be far gentler, because the doorways keep every forced guess
cheap. If it should be DEADLIER rather than more puzzling, the lever is HP — 10 on every board —
not rooms and not density. Measured by editing the constant for the length of a run and putting it
back; nothing about the mode changed.

**The crawl rule is what makes DUNGEON a dungeon, and it is one number.** `reach: 2` in the ladder
data: you may only open a cell, or cast a targeted spell on one, within two steps of ground you have
already uncovered. Two things about how it is measured are load-bearing. It counts steps through
`neighbours()` rather than across grid coordinates, so it is the distance you could WALK — it stops
at a wall instead of reaching through one, and it needs no special case for hex or for a wrapped
seam because adjacency already knows about both. And it is measured outward from the CANDIDATE
rather than inward from every open cell: the answer is the same because distance is symmetric, but
the work is two dozen cells instead of a sweep of the board, which matters because the renderer asks
it nine times a frame while the cursor moves. Marking and pencilling are deliberately exempt —
annotation is thinking, and a player should be free to reason about a room before they can enter it.

**The crawl rule can take the zero-damage guarantee away, and the fix is the rule's own exception.**
This is the thing to remember if any rule about *where* the player may act is ever added again. The
guarantee is a statement about what is POSSIBLE, and restricting where you may act can remove a
possibility the EXP economy was relying on: the free kills are on the board, just not near you.
Measured at reach 2 over 2,280 boards, five ended with the frontier walled in by creatures above the
player's level — all five on the opening move, where your level is 1 and a ring of tier 2s is enough
to do it. Reach 3, 4, 5 and 6 each came back clean over the same 2,280, which is the tempting fix
and the wrong one: rarer is not the right shape of answer for an invariant the whole risk model
rests on, and one board in five hundred that quietly cannot be finished is worse than a stated
exception, because the player cannot tell which one they are on. So `sealedIn()` states it: THE
DUNGEON NEVER FORCES A FIGHT YOU CANNOT WIN FOR FREE — when nothing within reach can be opened at
your level, the radius lifts until something can. It reads `level` alone and not `level +
exerciseCharge`, because the question is whether the BOARD has sealed you, not whether you happen to
hold a purchase that would open it. With the valve, 0 of 5,700.

**The crawl rule costs more HP than it costs deduction, which is not where the cost looked like it
would land.** The honest player from `sim:spells` is cornered about as often as before — the walls
were already doing that — but a forced guess is now a guess on what is in front of you rather than
on the cheapest square anywhere on the board, and that is much more expensive.

**Empty hallways and doorways then pushed it the other way, harder than expected.** Measured at the
schedule the crawl rule had been tuned to, the one-cell rebuild cleared 100% of board 10 against 60%
and was cornered 1.6 times a board against 3.9. Nearly doubling the density (14.6% → 26.4%) brings
the forced guesses back — 0.5 rising to 5.4 a board, against ARCANE's 0.1 to 5.0 — but the clear
rate only falls to 83%, because the guesses themselves got CHEAPER: a doorway is a free read into
the room, so the cell you are forced onto is usually one you know something about. More guesses,
each worth less. That is a different ladder from the one the crawl rule alone produced, and it is
probably the more interesting one, but it does sit gentler than ARCANE. The lever left is
`ROOM_COUNT` — more rooms is more separate puzzles — rather than density, which is already at the
felt ceiling.

**Anything that drives the game headlessly has to know about the crawl rule, and two things already
did.** `autoplayTierOrder` picked the lowest-tier free kill anywhere and would have re-picked the
same unreachable one for ever, so it now walks: it opens safe empty ground to push the frontier out
and takes the creature when it comes within reach. Empty ground is free at any level, so walking can
never spend the HP the sim is measuring, and returning nothing means genuinely walled in. The honest
player in `sim:spells` needed the same treatment in two places — what it may open and what it may
gamble on — or it would have been measuring a player who can click anywhere. `autoplaySearch` now
repeats its raster pass until one opens nothing, which no search ladder needs today and means none
ever has to remember this.

**Reveal writes a GIVEN, not a player mark.** Same flag a Sudoku clue carries, because it is the
same kind of claim: the board talking rather than the player guessing. It renders gold instead of
green, so a fact you paid 75 mana for never looks like a hypothesis you wrote down, and `setMark`
and `toggleNote` refuse to erase it, so it cannot be rubbed out by a stray right-click and bought
back. It does NOT make Sweep stronger, and that is worth knowing before `given` is read anywhere
else: the strict proof consults `given` only on the Sudoku path, which no board carrying spells
uses, so a revealed tier still reaches Sweep as mark assistance exactly as before. There is a test
asserting that.

**The spell row is ordered by price, derived rather than stored.** Same argument as `spellKey` being
derived from the name — a stored order is a second place the truth lives, and the two drift. Reveal
and Census shipped the other way round because Reveal was written first, which put the 25 before the
10 and made the row read as an arbitrary list. `orderSpells` sorts at the config boundary, so the
ladder data's own order is never trusted and a new type cannot be dealt a row that disagrees with
its costs.

**The board is outlined in white where it meets the background — the silhouette, not a grid.**
`drawSilhouette` in `boardview.ts`. On a rectangle it is a box; on a shaped ladder it IS the shape,
which is most of what makes a dungeon read as rooms and hallways rather than as scattered tiles.

Two things about it are worth not rediscovering. **The obvious trick does not work**, and it looks
like it should: stroke every cell UNDER the fills at twice the rim width, and the interior strokes
get painted over while the outward halves survive. That relies on the cells tiling exactly, and they
do not — `tracePath` insets every cell by a pixel, so there is a two-pixel gutter between neighbours
that no fill ever covers, and the whole grid comes out white. It was tried, and the measurement that
caught it was sampling the canvas pixel between two open cells. So the boundary edges are worked out
instead, per cell, against `SQUARE_EDGE_DIRS` / `HEX_EDGE_DIRS`.

**And adjacency here is deliberately not `neighboursOf`.** That answers a question about the rules —
it wraps, so on a torus the leftmost column is adjacent to the rightmost — where this is a question
about the picture, and the board plainly stops at the left edge whatever the rules say. WRAPAROUND
would otherwise have had no left or right rim at all. The seam is already drawn, dashed, by
`drawSeams`.

**Cut-away cells are `present: false` — absent, not empty.** They hold nothing, neighbour nothing,
and count toward no win condition. "Nothing here" and "revealed nothing" must also look different
on screen; they briefly didn't, and the hole was indistinguishable from revealed floor.

**Bash heredocs in this environment collapse `\\n` escapes.** Writing JS/TS containing escape
sequences through `bash <<'EOF'` silently corrupts them. Use the Write/Edit tools for any file
with escapes.

**The LV palette is modal, and a mode that needs a second step will read as broken.** Pencilling
takes a mode *and* a tier. Shipped as a bare "Notes" toggle it looked like a button that did
nothing, because one click armed nothing and the caption never said a tier was still needed. Worse,
with the mode on and no tier the click fell through to `game.open` — so turning the pencil on and
clicking fought whatever was under the cursor, which can end a run. Three things fix it and should
stay: the toggle is labelled with the mode it is **in** (`Entry: Mark` / `Entry: Pencil`), entering
pencil arms a tier so one click is enough (and hands it back on exit unless the player chose it
themselves, or they are left silently marking instead of opening), and pencil mode never falls
through to opening. The hint line is rebuilt every `refresh()` to say what a click does right now,
because a fixed caption can only ever describe one mode.

**The Entry mode governs the keyboard as well as the palette, and Shift inverts it.** A digit over
a hovered cell marks in Mark mode and pencils in Pencil mode; holding Shift does the other one for
that keystroke, which keeps a quick pencil available without leaving Mark. This was wrong on
arrival: a digit always marked and only Shift pencilled, so switching to Pencil changed what a
click did but not what typing did, and the mode looked like it had simply failed. Any new input
path has to read `notesMode` or it will drift the same way.

**The tier-0 pencil ("0 / empty") is hidden on Sudoku boards, and that is not a style choice.**
Sudoku's opening reveals every empty cell before the first move — measured, 0 covered empties on a
fresh board against 306 on NORMAL #1 — so no covered cell there can be tier 0 and the candidate is
never true. It was offered anyway, justified in a tooltip that had the fact exactly backwards. It
is a real hypothesis on every other ladder, where most of the board is hidden ground, so the
control stays; it is gated on `placement !== 'sudoku'` and on pencil mode. Left visible full-time
it also read as a ninth tier counter, which is why it now carries a label rather than a bare dot.

**`markMode` uses -1 for "nothing selected", not 0.** Tier 0 became a real palette choice when
pencil marks arrived — "this might just be empty ground" is one of the most useful things to
pencil, and it is the candidate that makes a set safe at LV1. So 0 can no longer double as "none",
and anything testing `if (this.markMode)` is wrong in a way that silently arms the empty-ground
pencil.

**A note mask of 0 means "no notes", never "nothing is possible".** Read as a bound, an empty set
says the cell is simultaneously provably safe (no candidate exceeds your level) and certainly
fatal (no candidate is at or below it). Every reader checks `hasNotes` first, and `highestNote` /
`lowestNote` return -1 rather than a sentinel that would pass a comparison.

**The pencil refuses a candidate the placement rule has already refused, and nothing it would take
deduction to refuse.** `Game.noteCandidates` is the whole list: the square's colour on CHECKERBOARD,
the partner's number beside a defeated creature on a pairing board (`pairCandidates` — empty ground
or exactly that tier, and only empty ground once the creature has met its partner or when two
creatures touch the cell), the tiers the neighbouring pack has not shown on PACKS and CONGO LINE
(`packCandidates` — a union over every piece beside the cell, and empty ground outright when two of
those pieces show the same tier, since a creature there would join two packs), and no tier 0 on
SUDOKU. The solver reads its domains through the same function, so the pencil and the instrument
that measures the game cannot disagree about what a rule allows; moving the pack reading here from
the solver changed none of its output, checked byte for byte. The congo line's shape proof
(`congoClear`) stays out: it counts reach from the line's ends, which is deduction, not a reading of
a neighbour. It is enforced in `toggleNote`, not in the
palette, for the reason Sweep's charge is — so the click and the keyboard cannot disagree — and it
refuses only ADDING a note, because a candidate pencilled before the board ruled it out has to stay
erasable. **It must never grow a Sudoku row/column/box rule, or anything else that is the player's
deduction to make**: that is the auto-candidates convenience which turns Sweep back into a solve
button. It claims IMPOSSIBLE, so the test that matters is that it never refuses the tier a cell
really holds, over real boards walked part-way (`test/candidates.test.ts`).

**The cursor says whether THIS click would land, which is a question about the mode, not only
about reach.** It used to ask the crawl rule unconditionally, so on DUNGEON it went red over cells a
mark or a pencil would have landed on — annotation is exempt from reach. `App.clickLands` answers it
now and `BoardView` asks through the optional `lands` callback: reach while opening or casting, and
while a tier is armed only annotation's own refusals (a given, a ruled-out candidate). The palette
strikes through the ruled-out tiers for the hovered cell too — struck rather than dimmed, because
dimmed already means "none of these left".

**Pencil notes wear the mark's dark outline, and the dim is kept.** The dimmed green composited on
its own tile ran 1.22:1 on EASY, 1.61 on BLIND and 1.70 on DOMINOES, and going opaque only reaches
1.37 on EASY because the hue itself is light. Against its halo it is 5.1-5.9:1 on every palette.

**Wrapping a SHAPE does the opposite of wrapping a rectangle, and WRAPPED CROSS is the case.**
"Edges are free information, so joining them is the only variant that is harder" is a claim about a
rectangle, where the rim is a small part of a large interior. A cross is nearly all rim, so it
barely loses any — and what joining its tips actually does is far bigger: CROSS is four dead-end
corridors sharing a hub, and the wrap turns them into two loops, so a player stuck at one tip can
work in from the other. It is the DUNGEON finding again with the sign flipped: what sets the count
of forced guesses is how many separate puzzles the board is cut into. Measured with the honest
player from `sim:spells`, 25 seeds a board, at CROSS's own schedule: 0.0–2.3 forced guesses a board
against CROSS's 0.3–2.4, and 92% of board 10 cleared against 80%. It ships at CROSS's schedule
shifted up 1.2 density points, which put it back on CROSS's curve at 0.1–2.7 and 84%. When CROSS
later moved 2.5 points up for its spells this moved with it (now 27.2–34.4%) and was re-measured:
21.7 stuck points over the ladder against CROSS's 21.8, still on the curve, at the cost of harder
opening boards (1.3–1.9 stuck against CROSS's 0.9–1.2). Anything else combining a shape with a
topology should be measured rather than reasoned about.

**It is gated on its two parents, not on a board count, and that is the cheaper of the two.**
`requires_boards` spends the one budget in the unlock data that can silently strand a save. A combined type has
somewhere better to say the same thing: HUGE x EXTREME's rule, that a ladder which is two ladders at
once should not be reachable without having played both.

**A hole neighbours nothing, in BOTH directions — the second half was missing until a board was
shaped *and* wrapped.** `neighbours()` filtered absent cells out of what it returned but not out of
what it was asked about, so a hole beside an arm listed the arm while the arm rightly refused to
list the hole. Harmless in play, because `cellAt` will not hand out a hole to act on, and invisible
on every board before this one: a plain shaped board was never run through the adjacency-symmetry
test, which only existed for WRAPAROUND. The fix is one guard at the top of `neighbours()`.

**The wrap seam is drawn per cell, because on a shaped board most of a joined edge is not there.**
`drawSeams` used to stroke the bounding box, which is right on a rectangle and a lie on a wrapped
cross: a dash running the full height of the box claims a seam across background where there is no
board to join. It now walks the edge columns and rows and draws only beside present cells, which
reduces to exactly the old line on a rectangle.

**A placement rule reaches the whole of deduction, because a number is a SUM.** CHECKERBOARD looks
like it says one small thing — a light square holds an even tier, a dark one an odd tier, and empty
ground goes anywhere. What it actually says is that the light cells behind any number total an even
number, so **the parity of a number belongs entirely to its dark neighbours**, and that compounds
the way nothing about a single cell could. The sharpest form of it is free: a number with exactly
one covered dark neighbour and an even hidden sum has proven that square is empty ground, at any
level, with no other information about the board. `hiddenCap` in `checker.ts` is that argument
written as the one number Sweep needs — the most tier a single covered cell can be hiding — and
there is a test enumerating every small ring to check it is both sound and tight.

**It is in `safeCells` because Census taught that lesson already.** A rule the game cannot act on
is a rule the player has to translate into marks by hand, which is most of what was wrong with
Census. Measured, the parity proof roughly doubles what Sweep offers on a CHECKERBOARD board (43
cells against 22 over the same 16 rounds). It is the only proof in the game decided PER NEIGHBOUR
rather than for a whole ring at once, so `safeCells` had to grow a per-cell branch; half a number's
unknowns being safe while the other half is not is the shape of deduction unique to this board.
It does not run away and solve the board — there is a test asserting Sweep alone clears none of
them — because it is bounded by the numbers already on screen.

**Empty ground must stay legal on both colours, and that is the whole reason it is a sweeper.**
Pinning tier 0 to one colour would make every square of the other colour provably occupied before
the first click.

**The balance the mode promises lives in the QUANTITIES, not in the placement.** Odd tiers have
nowhere to go but the dark squares, so "the same number of enemies per side" is a constraint on
`quantity` and is met in `ladders.py` by apportioning each parity its own half of the creature
budget. `config.ts` refuses a board whose halves differ by more than one — such a board would
generate perfectly and be tuned perfectly and simply not be this mode, which is the failure shape
the cave's cell count and the Sudoku quantity check are also guarding against.

**Which is why the ladder is six tiers and not five.** At five tiers three are odd and two are
even, so the even pair would carry half the board between them and the descending curve would
buckle. At six it is three against three and the archetype survives nearly intact — the only trace
left is tier 2 coming out marginally ahead of tier 1, which is the price of the promise.

**The board must have an even number of cells, or one colour has a square more than the other.**
Checked in `config.ts`, and the continuation in `ladders.py` rounds its width down to even to keep
it true past board 10 — the width schedule is the faster-moving of the two, so pinning it costs the
least. A wrapped axis would have to be even for the same reason; no ladder wraps one, and the
condition is stated anyway because getting it wrong is silent.

**CHECKERBOARD is worth 11 density points, measured.** At NORMAL's own schedule (25.0–33.0%) the
honest player from `sim:spells` was cornered 0.0 times on board 1 and 0.6 on board 10 and cleared
every board — nothing for the ladder to be. Walked up until the curve matched HIVE's, the other
variant that compensates for an easier board by packing it, it lands at 27.5–38.5%: 0.3 forced
guesses rising to 2.9, against HIVE's 0.3 to 2.8 and CROSS's 0.3 to 2.4. **It is the first ladder
to run past the 34% battle ceiling by a real margin**, and the justification is specific rather
than general: 34% was measured on boards where a covered cell could be ANY tier, and here its
colour has already ruled out half of them, so the same density carries about half the ambiguity.
HIVE (35%) and ARCANE (34.5%) already sit past it for smaller versions of the same reason.

**The clear rate falls much more slowly than the guess count rises, and that is the mode's
signature.** 92% of board 10 cleared against HIVE's 80% at a matched forced-guess rate, because a
guess whose parity you already know is a cheaper guess. More guesses, each worth less. That is
DUNGEON's doorway finding reached from a completely different direction, and it is the second time
it has turned up — which is worth treating as a general fact rather than a coincidence: **what a
board costs in HP is set by how much you know about the cell you are forced onto, not by how often
you are forced.**

**The honest player had to be taught the rule before the density meant anything.** `sim:spells`
reads only what a player can see, and a real player on that board can see the colours; measuring
the ladder with a player who could not would have been measuring a different mode and would have
tuned it far too sparse. Same argument as `autoplayTierOrder` having to learn to walk when the
crawl rule landed. Anything that drives the game headlessly has to know about a new deduction rule
or it is measuring the wrong game.

**PAIRS is a rule about packing wearing a rule about couples.** "Every creature has exactly one
creature neighbour" forces the occupied cells into dominoes that MAY NOT TOUCH — a contact would give
the two creatures either side of it a second neighbour. Everything about the mode comes off that
second half rather than the first, and the first half is the part that sounds interesting.

**A creature's number IS its partner's tier, and that was free.** Nothing but the partner borders a
creature, and a number is the sum of neighbouring tiers, so the two are the same quantity — no
arithmetic, no ambiguity. `computeNumbers` already ran over creature cells and the renderer could
already show a defeated one's number, both built for something else, so the mode's single most
valuable deduction cost nothing to have. It USED to be shown by default here — `generateGrid`
preset a per-cell `showNum` flag on every pairing board, on the argument that leaving the board's
best read one click behind a sprite would bury the rule — and that preset is gone, by request: a
beaten creature on PAIRS and DOMINOES shows its art like everywhere else. On every other ladder
**a beaten creature's number is shown while the cursor is over it**, and that is the whole
mechanism now. It was a click toggle held on the cell as `showNum`; the flag, the `toggleNum` event
and the toggle in `Game.open` are gone, so a click on a beaten creature is a click on open ground
and the number is a picture of where the cursor is rather than state anything has to remember.
**Touch has no hover**, so on a phone the number is currently unreachable — worth settling before
pinch-zoom's phone gets tested.

**On PAIRS and DOMINOES it is not drawn at all, by request** (`isPaired` in `BoardView.drawOpen`): a
lone digit over a creature read as that creature's own level rather than its partner's, and
confused more than it told. The engine still holds the number and three things still read it, which
is the open question this leaves. Sweep's partner proof (`ringIsFree`, case A) opens a ring on the
strength of a number the player can no longer see. The pencil's `pairCandidates` strikes every tier
but blank and the partner's out of the palette for a cell beside a beaten creature, so hovering one
in Pencil mode still spells out the partner's tier. And the honest player and the solver both read
it, so PAIRS's and DOMINOES's schedules were measured against a player who sees more than a real one
now does — both ladders play harder than their tuning says until they are re-measured.

**Its two Sweep proofs fold into `proven` as one line, because "the ring is free" is already what
that flag means.** Partner within your level → every covered neighbour is that partner or blank.
Partner already open → it has met the one creature it may touch, so the rest is blank AT ANY LEVEL.
`ringIsFree` in `pairs.ts` is both. Neither runs away, and the reason is the packing rather than
anything about levels: a freed ring holds the partner and otherwise empty ground, because no second
domino may touch the first, so a trigger clears one pair and stops. The cascade it sets off kills
nothing and so triggers nothing. Compare Sudoku, whose rule had to be kept out of `safeCells`
entirely for exactly the opposite reason.

**The rule was expected to give the board away and does the reverse.** Sparse plus clustered sounded
like big voids and a huge free opening. But the exclusion ring around every pair spreads the
creatures EVENLY, and clustering is what makes a zero-region — so the opening comes out 30–65%
SMALLER than uniform at the same density, and cells hiding nothing drop from 18.8% to 10.7%.
Measured over 300 seeds a board it has the smallest openings in the game, 6.0% falling to 1.1%
against NORMAL's 9.2% to 4.0%. It is `design/page.template.html`'s own clustering finding with the
sign flipped, and the two are consistent: pairing IS clustering at the smallest scale there is, and
anti-clustering at every larger one, and the larger one wins.

**It is the only ladder whose axis is SIZE, and that was forced.** Non-touching dominoes cannot
exceed two cells in every six (33.3%) and a random lay-down jams at 24.8–25.6%. The quota must be
landed EXACTLY because `C_k` assumed it, so the schedule stops where placement is reliable rather
than where the board stops being a puzzle — 26% places on every seed in 40 restarts, 28% on one in
four. Inside the four points that leaves, density does almost nothing: walking 20→25% on a FIXED
board moved the honest player's forced guesses 0.0 → 1.5 and left the first SIX boards at 0.0, the
same empty ladder ARCANE had. Growing the board across the same span gives 0.2 → 2.1 at 100% → 83%
cleared, which is WRAPPED CROSS's curve. Deduction here is local, so area is what buys more places
to be cornered. A board short of quota would not throw — it would sit one kill under its top gate on
that seed only, which is the ragged cave's failure exactly, so `choosePairs` throws rather than
returning a short board and `test/pairs.test.ts` checks the rule and the count on every board.

**HP is not a dial on it, and lock depth barely is.** The characteristic gamble here is "exactly one
of these k cells holds a tier T, the rest are empty", with T read straight off a dead creature — so a
wrong guess is one known lethal blow, not an accumulation, and the whole ladder at HP 12 and HP 14
clears the same share of every board as at HP 10. Lock was tried on the theory that it throttles the
ring proof by holding your level down; it moved the clear rate and left the forced guesses alone,
because the EXP economy gets you there anyway. It keeps NORMAL's 10.

**The counted schedule steps by exactly five, 15 to 80, and a new counted ladder is a new slot.**
Both are by request, and a test pins the step. It used to stop at 65 so that every gate fit inside the
70 tuned boards the type-gated ladders offer; DOMINOES, WORKOUT and PACKS joining it took the top to
80, so the last three gates (CAVE is the last within 70) now need a variant played first. That is
safe because every counted ladder opened is ten more tuned boards: `test/unlocks.test.ts` walks the
schedule in order on tuned boards alone and fails if any gate is never met. It starts at 15 by request
too, so the first variant arrives after EASY and half of NORMAL rather than on EASY alone. DOMINOES and
PACKS used to be gated on clearing PAIRS; they are counted now and still open after it.

**DOMINOES is PAIRS dealt as a full domino set, and the set decides the distribution.** Every
pairing {a,b} of a double-T set appears once, so every tier appears exactly T+1 times and
`quantity` is FLAT by construction — the Sudoku situation, not the Checkerboard one, and
`ladders.py` branches around its distribution path the same way. The set count is recovered from
`quantity` by `setsIn` rather than carried as a field, because `quantity` is already the one place
the ladder says how many creatures there are. The dealer keeps `choosePairs`'s partner order — the
two ends of a TILE have to land on the two halves of a DOMINO — which is the one reason it cannot use
the shuffle-and-take every other placement does.

**Every reader of the pairing rule asks `isPaired`, and that is not tidiness.** The generator, both
Sweep proofs, the honest player in `sim:spells` and the renderer's bonds all have to treat DOMINOES
as a pairing board; five separate `=== 'pairs'` checks would have been five places to hand a domino
board none of the mode's deduction, silently. The third time this codebase has met "anything
classifying ladders by X". `isPacked` is the same answer for the pack rule, which CONGO LINE shares:
it arrived with the pack pencil, replacing four hand-written `=== 'packs' || === 'congo'` checks.

**No blanks, for a structural reason.** A [0|x] tile is a creature whose partner is empty ground,
which breaks the one-creature-neighbour rule both proofs rest on; a blank half is also drawn as
ordinary floor, so a quarter of a double-six set would be tiles the player cannot verify, and [0|0]
is invisible in principle. The set bookkeeping is the mode.

**Every board is a double-six set — six tiers, always — and that makes density nearly the whole
dial.** The tier count was a ramp in the first version (4 → 7) and was fixed at six on request; a
test now pins it, because a schedule edit that brought the ramp back would still generate, still be
tuned correctly, and quietly be a different mode. With the tiers fixed, the ladder is copies of the
set and how tightly they are packed, and the second dominates: with the honest player, four sets on
board 10 cleared 88% at 22.5% density and 45% at 25% — the steepest cliff of any ladder measured,
because a flat six-tier set makes every forced guess as likely to land on a tier 6 as a tier 1.
Topping out at three, four or five sets made almost no difference. So the band runs 18.5–23.5%, well
under the packing ceiling, which is left to the scaling boards: 0.1 → 2.2 forced guesses, 98% → 70%
cleared over 60 seeds a board — harder than PAIRS's 83%, as the ladder you reach by clearing PAIRS
should be.

**Two findings from the tier-ramp version still stand.** Double-nine cannot carry a multi-set
ladder at all — 90 creatures a set, and the largest board at the packing ceiling holds five. And HP
is no rescue on a flat curve: a double-eight board 10 cleared 53%, 53% and 55% at HP 10, 14 and 18,
even though HP lost per guess (1.5–1.6) looked like accumulation. The deaths are still dominated by
the occasional high-tier blow, so the per-guess average is not a reliable sign that HP will help.

**It is the one ladder that gets harder by getting SMALLER.** Between one set count and the next the
creature count cannot move, so the only way to raise density is a smaller board: boards 6–8 hold the
same 126 creatures on 594 cells shrinking to 561. That only works because the continuation sizes its
boards from the set rather than extrapolating the size schedule — extrapolating would have laid more
sets on a board sized for fewer and run past the packing ceiling, which `config.ts` refuses. The
first version of that also pinned height at the ceiling and produced a 21×32 portrait board after ten
landscape ones; it now keeps the ladder's own aspect.

**PACKS is PAIRS with six in place of two, and "all touch" means CONNECTED.** Creatures stand in packs
of one of every tier, and no two packs touch. It cannot mean every member touches every other — the
largest mutually adjacent group is four cells on a square grid and three on hex. Touching is
`neighbours()`, so a diagonal counts. Packs never touch, so a pack is exactly a connected group of
creatures, and that is why the mode needs no links drawn: membership is on the board. Shapes are
loose by request — grown by picking a random member-and-neighbour edge, which leans slightly toward
chunky shapes without ruling out an L or a snake.

**Its Sweep proof is one number, `missingFrom`: the strongest tier a pack has not shown.** A covered
cell beside an open creature is a packmate or empty ground, and a packmate is one of the missing tiers.
So when that tier is within your level the ring is free, and a whole pack (nothing missing) frees its
ring at any level. It is computed over the component of OPEN creatures, which may be only part of a
pack when two pieces are joined through a covered cell. That errs safe: a piece can only think MORE
is missing. It cannot run away for PAIRS's reason, and there are tests for both. A beaten
creature's number was never shown by default here — it no longer is on PAIRS either — because a
creature's number here is a sum of packmates rather than a single named partner.

**It is the opposite of PAIRS on openings, and that is what sets its density.** Six-cell clusters
leave empty ground: board 1 opens a median 26% of the board against NORMAL's 9%. The packing ceiling
does not bind it (`PACK_MAX_DENSITY` 0.36 lays down on every seed measured, against PAIRS's 0.26),
so density is the dial. The flat curve is what the first guess missed — one of every tier per pack
makes a tier 6 as common as a tier 1. That first guess, 26–34%, cleared 35% of board 10. It ships at
22.5–31.6%: 0.2 → 5.2 forced guesses, 99% → 70% cleared, DOMINOES's 70% at the top. Guesses run well
ahead of the clear rate — the "a guess you know something about is cheaper" finding for the third
time. **The board grows a row or column every step for granularity**, because one pack is 1.25
density points on 480 cells and a fixed size rounded neighbouring boards to the same board, which
`test/scaling.test.ts` caught.

**CONGO LINE is PACKS strung out, and at six "no 2x2" and "a true line" are the same rule.** Lines of
six, one of every tier, stepping orthogonally, led by the tier 6; no two lines touch. The generator
enforces the stronger-sounding rule — no member orthogonally beside any member but the one before and
after — and it is not a second rule: an orthogonal shortcut closes a loop of grid cells, and every loop
shorter than eight contains a 2x2, which six cells cannot avoid. What that buys is exact: **two open
creatures orthogonally side by side are consecutive in the line.** That is why the board ties them
(`drawBonds`, orthogonal contacts only — a diagonal is a corner, not a link), and it is what every proof
in `congo.ts` rests on. Square and unwrapped only, refused in `config.ts`: hex has no orthogonal step,
and a wrapped seam would be a line the eye cannot follow. Every pack read carries over unchanged —
`missingFrom`, `namePacks` and `packCaps` all treat it as a pack — because a line IS a pack.

**The leader rule, which is the part that sounds like the mode, gives Sweep nothing, and that was
measured rather than assumed.** Three shape proofs, each good at any level: a leader with a follower
open beside it has its other sides empty; a member with two open orthogonal linemates is full; three
open creatures in a 2x2 make the fourth empty. Over 386 stuck points the honest player never once had
a cell from any of them that the numbers and the pack proof had not already given. The reason is the
leader itself: it is the tier 6, a player in tier order kills it last, and by then `missingFrom` has
freed every ring on the board. They are kept because they are sound and cheap and help a player who
killed a leader by guessing — but the rule that does something is **a line only continues from its
ends** (`beyondReach`): the members still missing are within that many orthogonal steps of the open
stretch's two ends, so the rest of its rim is empty ground at any level, which PACKS cannot say. Even
that answers only 9 of the 386 stuck points and moves the ladder by less than the noise. Worth knowing
before anyone expects a new deduction rule to be a new difficulty: this mode differs from PACKS in how it
reads, not in what can be proved. The test that matters is `never calls a creature empty, whatever is
open` — these proofs claim EMPTY, so one wrong cell is a free sweep into a creature.

**It ships at PACKS's schedule, because that measured where PACKS is.** 22.5–31.6%, 60 seeds a
board with the honest player taught both proofs: 0.1 → 3.8 forced guesses, 98% → 68% cleared, against
PACKS's 0.3 → 4.6 and 68%. Openings match too (median 25.6% of board 1 against 25.8%). The packing
ceiling is 34% (`CONGO_MAX_DENSITY`: every seed to 60x30 at 34%, seeds lost at 35% on the largest), which
is also the battle ceiling, so the continuation is capped at 33.5% — rounding to whole lines put 34.1% on
one board otherwise. The mean clear rate, 92.8, sits between CROSS and HIVE; it opens at 50.

**WORKOUT is the one ladder whose spell has its own price, and the price is the mode.** Exercise
alone, 30 mana, 10 dearer every cast, 10 cheaper for every level gained and never below 30; a kill
made on a borrowed level pays double EXP; all of it resets with the board because a new board is a
new `Game`. It is `WorkoutRule` on the config, read through `Game.spellCost` — anything that prices
a spell must ask that, not `SPELLS[id].cost`, or it will quote WORKOUT's Exercise at 150.

**Double EXP is safe for the four facts because it only ever ADDS.** A gate is `C_k`, so a kill paying
short would strand one; a kill paying over only reaches it sooner, which is what the deeper lock
(3, then the full 4 from board 4) is there to push against. `config.ts` refuses a multiplier below 1
for exactly that reason. The bonus is paid on ANY fight the charge is spent on, free ones included,
by request — so farming it is legal play.

**Measured, the double EXP barely moves difficulty, and that is the thing to know before tuning on it.**
With the honest player from `sim:spells` (40 seeds a board, `npm run sim:spells -- 40 workout`):
spell-less 0.1 → 5.7 forced guesses and 100% → 73% cleared; casting at each forced guess 100% → 85%,
mean 96.6% against NORMAL's 98.8% spell-less. A player who also farms — every named creature at or
one past its level, taken on a charge whenever the price is back at 30 (`POLICY=gym`) — casts about
five times a board instead of two and clears the same share. The cheap casts are rationed by
level-ups, and a five-tier board only has four. If the mode should cast MORE, the lever is `relief`
(or relief on kills rather than levels), not density.

**The unlock graph only drew ladders it had a hard-coded position for, so WRAPPED CROSS had been
missing from it since it shipped.** Nothing failed and nothing said so. Every type-gated variant is
now placed by rule on the row beside HUGE x BLIND, which fixed it and caught DOMINOES before it went
missing the same way.

**The web build ships to itch.io, and two things about that are load-bearing.** `base: './'` in
`vite.config.ts`: itch serves an HTML game from a per-upload subfolder, so absolute `/assets/...`
paths load nothing and the page is blank with no error. `npm run package` builds and zips `dist/`
into `release/` with `index.html` at the zip's root, and refuses a build with absolute paths. And
the save is `localStorage` inside itch's third-party iframe, which Safari caps and may clear, so
**Back up / restore save** on the ladder list carries progress and settings out as a `CS1:` code
(`src/ui/savefile.ts`). It is base64 rather than JSON because it gets pasted through chat apps, and
a chat app curling a quote breaks JSON silently. Import refuses anything that would load as a
blank save, since that would wipe exactly what it exists to protect. **Changing `SaveData` now
means writing a migration** — testers' saves, and their exported codes, are in the wild.

**Connectivity must be asserted, not assumed.** The auto-opening reveals *one* region, so a board
that fragments leaves everything else unreachable. A ragged-cave generator produced stray islands
in 13 of 40 boards before this was caught.

---

## Current state

24 game types × 10 tuned boards, plus a scaling continuation to board 13–40 depending on type
(689 boards in all). 395 tests. Playable prototype with canvas board, HUD, marks,
pencil marks, two Sweep modes, magic, Full Run, the full unlock chain, a rules card, an
always-present mute toggle, and a settings menu with nine presentation options and seven
gameplay dials. Sweep defaults to CHARGED, ten hand-opened cells a sweep.

```
main line   EASY -> NORMAL -> { HUGE, EXTREME } -> HUGE x EXTREME (needs both)
magic       NORMAL -> ARCANE -> ORACLE
variants    gated on BOARDS CLEARED ANYWHERE, not on each other:
            WRAPAROUND 15 · CROSS 20 · HIVE 25 · DIAMOND 30 · PAIRS 35 · DOMINOES 40
            WORKOUT 45 · PACKS 50 · DONUT 55 · CHECKERBOARD 60 · CONGO LINE 65
            RAGGED CAVE 70 · DUNGEON 75 · SUDOKU 80
full runs   BLIND needs Full Runs completed on 3 different types
            the five cut-out shapes carry ARCANE's loadout (Reveal, Census, 75 mana),
            and DUNGEON carries Exercise on top of it
combined    WRAPPED CROSS needs CROSS and WRAPAROUND; it carries ARCANE's loadout too
workout     WORKOUT: NORMAL's boards, deeper gates, Exercise alone at 30 rising by 10
no sweep    EASY offers no Sweep at all (`sweep: false` in the ladder data)
post-game   HUGE x BLIND needs HUGE and BLIND
full run    every type -> its own FULL RUN, unlocked by clearing that type's board 10
scaling     every type -> boards 11..N, unlocked the same way, picked with arrows
```

`window.cs` in dev exposes the running app (`cs.play('donut', 1)`, `cs.current`, `cs.sync()`,
`cs.cellSize`, `cs.runFull('normal')`, `cs.currentRun`). Stripped from production builds. It is the
fastest way to drive the game from the console when verifying a change.

---

## Settings

Two halves that behave completely differently, and the split is the whole design.
`src/engine/settings.ts` holds the **gameplay dials** — they change rules, so they are engine
state and they decide whether a board counts. `src/ui/settings.ts` holds the **presentation
settings** and the store; none of those touches a rule, so none of them can affect a record.
`src/ui/settingsscreen.ts` is the form, built detached and handed back, which is what keeps
`app.ts` from growing a third of its length in widget-building.

**The dials are allowed nowhere near EXP or creature removal, and that is what keeps the four
load-bearing facts alive.** The tuning identity is a sum over creatures, so nothing that fails to
add, remove or re-value one can reach it. The zero-damage guarantee is a claim about what is
*possible* — a fight at or below your level ends in one round with no retaliation, so a free kill
stays free at any damage ratio, and scaling HP moves the guess budget without making a required
fight cost anything. Invariant 3 survives for the same reason as the first. `test/settings.test.ts`
asserts all of it directly: at HP ×0 (one point), creature damage ×3, no mana and no Sweep, the
tier-order player still clears every battle ladder without being hit once, and ends on exactly the
EXP and level it reaches unmodified. Anything added to `GameplaySettings` has to clear those three
before it lands, because all three fail *silently* — a broken board is still playable, it just
cannot be finished.

**Harder records, easier records nothing — and "nothing" includes the unlock.** Each dial has a
direction (`isAtLeastAsHard`), so a player who makes the game harder keeps their clears, unlocks
and best times, and a player who makes it easier gets none of them. A blanket "modified" flag was
the obvious alternative and is wrong: most of these are asymmetric, and throwing away the times of
someone playing at HP ×0.5 punishes the opposite of what the rule is for. The consequence is said in three places,
because a player who discovers it at the end of a board discovers it too late: live in the settings
screen, on the ladder list, and on the clear overlay itself.

**HP regen is Full Run only, and that is forced rather than chosen.** Healing inside a board would
turn HP from a guess budget into a combat resource, which is the single change the whole risk model
rests on not happening. So the dial is the fraction of the pool the run's existing between-boards
heal restores, its default of 0.5 *is* the shipped rule, and the rounding stays down — see the
BLIND note above for why a pool of 1 must heal nothing.

**Damage is scaled per blow, never on the total.** The fight is resolved round by round and whether
you survive round three depends on what rounds one and two actually took off you, so `resolveBattle`
takes a `bite` that defaults to the tier. That opens exactly one hole: at level 0 the player can
never reduce the creature and at bite 0 the creature can never reduce the player, so the loop does
not terminate. It is a stalemate and is returned as one, rather than guarded with a round cap that
would be a number nobody could justify.

**Sweep used to be absent from that check, and defaulting it to charged is what made it join.**
The old argument was sound while the default was `'on'`: both other modes take a tool away, so no
setting of the dial could be easier than default. Charging it by default (ten hand-opened cells)
inverts that — `'on'` is now unlimited access to a tool the tuned game rations, and a player who
switched to it would have been handed records, unlocks and best times for a strictly easier game.
`sweepRank` orders the three (off > charge > on) and `sweepChargeClicks` is compared too, because a
bank of 1 is `'on'` wearing a meter. The alarm if this is ever flipped back is the test asserting a
fresh board on the tuned default has NO sweep banked.

**A sweep must never pay for the next one.** In charge mode the meter banks one charge per cell
opened *by hand*; the cells a sweep opens are excluded, or a single sweep of forty cells would bank
a dozen more and the gate would be decorative. A cascade is one click and so one charge, for the
same reason. The gate is enforced in `Game.sweep`, not in the button, so a UI that forgot to
disable the control still cannot get past it — and neither can the keyboard.

**A Full Run scales its pool once.** `run.ts` passes the ladder's *unscaled* `run_hp` into
`boardConfig` and lets `Game` apply the HP dial, because `Game` applies it unconditionally;
passing the already-scaled pool scaled it twice. There is a test asserting the run's pool and its
board's ceiling agree.

**Time Attack needed `Game.forfeit`, because the engine owns no clock.** "The countdown reached
zero" is a fact only the UI can know, so it hands it back through a method rather than writing a
status the engine never agreed to — the creatures are revealed and a `lost` event is emitted
exactly as when HP runs out. The target is the player's OWN previous best and nothing else: an
invented limit would be a difficulty setting wearing a stopwatch, where a personal best is a time
this player has already proved is achievable on this board. A board with no best time has nothing
to race and plays normally. **The countdown is frame-driven, so a hidden tab stops checking it** —
`performance.now()` keeps running, so the time is still spent and expiry registers on the first
frame after the tab comes back. That is the right behaviour, and it is also why the countdown looks
frozen when driving the game from a browser pane that is not painting.

**There are two families of board-clear effect, and the second one cannot be written without the
renderer's help.** The *ambient* four (confetti, burst, ripple, sparkle) are decoration over the
top and know nothing about what they cover. The *icon* seven (tumble, cascade, pop, burn and three
wipes) animate the board's own creatures, so they need two things from `BoardView`: where every
glyph is, and for the board to STOP DRAWING THEM. Without the second, the original icons stay
painted underneath and every creature appears to leave a ghost of itself behind at its old cell.
That is `VictorySource`, and it is why the effect hands the glyphs back when it ends — including
when it is cut short, because an interrupted effect that forgot would leave the board permanently
missing half its information.

**The glyphs are pre-rendered per tier and blitted, not drawn.** `drawCreature` traces up to nine
pip paths a call, and the biggest boards carry 553 creatures — about 4,500 path fills every frame,
which would turn a two-second animation into a slideshow on exactly the boards whose clear is most
worth celebrating. A glyph cannot change during an effect, so it is drawn once per distinct tier
into an offscreen canvas and copied from there. Measured on a synthetic 553-creature board: 0.6–1.2
ms a frame median, 13.6 ms worst, against a 16.6 ms budget. The atlas is rendered at twice the cell
size because `pop` swells a glyph past double before bursting it.

**The physics effects step by MEASURED time, and finding that out cost a bug.** `tumble` and
`cascade` originally advanced a fixed step per frame, the way the ambient particles do — which
makes the fall take a fixed number of FRAMES rather than a fixed number of seconds. On a throttled
tab the creatures barely moved before the effect ended: they hung in the air and vanished. They now
take the real delta, clamped to 1/20 s so a backgrounded tab resuming with a delta of seconds
cannot teleport everything through the floor. Verified at 60fps and at 15fps: the creatures reach
the floor either way. The ambient effects keep their fixed step and that is still right — a
confetti chip has nowhere in particular to be, where a tumbling creature has to be on the floor
before the curtain falls.

**Cascade is the one painter that never clears the canvas, because the trail IS the effect.** That
also means its fade-out cannot live in the paint, where every other effect's does; it fades the
canvas element instead. Its launch interval shrinks with the creature count, or a 553-creature
board would take forty-five seconds to get through them all.

**Sprites include COVERED creatures, which only matters on a search board.** An ordinary win has
every creature open already. BLIND is won by uncovering the empty ground, so its creatures are
still hidden at the moment of victory — and a clear effect that shows the player what they had
been walking past is a better ending than one that finds nothing to animate. An icon effect handed
no sprites at all falls back to confetti rather than silently doing nothing, which would read as a
bug.

**Burn clips the real glyph rather than redrawing an approximation of one**, so a half-burnt
creature is still exactly the creature it was. It runs bottom-up and is staggered so the lowest
rows catch first, because that is the direction fire travels; top-down reads as a wipe wearing a
warm palette. The three wipes are one implementation and three axis functions, so a new direction
is a line rather than an effect.

**The board-clear effect draws on its own layer, and a screen rebuild must stop it.** The board
renderer is turn-based and worth keeping that way; animating into its canvas would mean repainting
every cell sixty times a second, or leaving particle trails across the board. A player who clicks
"Next board" half a second in gets the screen rebuilt under the animation, so `endVictory()` is
called from every screen change — without it a `requestAnimationFrame` loop keeps running on a
detached canvas for the rest of the session.

**Sound is synthesised, and two things about it will bite.** An `AudioContext` cannot be created
before a gesture — browsers start one suspended and refuse to run it — so it is built lazily on
the first sound and resumed on every call; building it in the constructor worked in dev and shipped
silent. And sound must never be able to break the game, so every entry point swallows its own
failure. Beyond that: **one sound per action, not per event.** A single click can produce a cascade
of hundreds of `revealed` cells, a fight, a level-up and a win in the same array, so the loudest
thing that happened wins and the rest are dropped.

**Every visual setting shows its options instead of naming them, and the examples are REAL
BOARDS.** A dropdown reading "Gems" or "DUNGEON" asks the player to imagine the result and then go
and check. Each visual setting is a gallery of tiles instead, and every tile is a genuine `Game`
drawn by the genuine `BoardView` — `src/ui/preview.ts`. An approximation would have been a quarter
of the code and would have started lying the first time anything about cell drawing moved, which
is the `design/opening.py` failure exactly: a preview that has quietly stopped being true is worse
than no preview, because nothing tells the player. Two supports for this in `BoardView`:
`interactive: false`, because its wheel handler calls `preventDefault` and forty thumbnails would
be forty holes in the settings page's scrolling; and `fixedCell`, which sizes the canvas to the
board instead of the board to the canvas.

**Every tile in a gallery draws the SAME board**, from a fixed config and a fixed seed, so the only
thing differing between tiles is the setting. A per-tile layout would make the palette gallery a
test of memory rather than of colour. Four boards are shared between about forty thumbnails, which
is safe because a view never mutates the game it draws.

**Three things about the examples are load-bearing rather than cosmetic.** (1) The creature
examples open the board's *highest* tiers, because a tier 4 draws four pips and a tier 1 draws one
— taking them in reading order showed whatever the seed put top-left, and half the time that was a
single dot, which tells you nothing about a pip shape. (2) A creature glyph is only ever visible
once it has been beaten, so showing the icons at all means showing defeated ones — which is also
what puts the strike-through setting in the same picture. (3) The empty cells opened are chosen
from those with a number on them: an empty cell numbered 0 cascades, and on a 4x3 board one cascade
uncovers nearly all of it, leaving no covered tiles to look at.

**The cursor-highlight gallery is drawn on a HEX board, and it has to be.** On a square board
"true neighbours" and "flat 3x3 block" light exactly the same eight cells, so a square example
would show two identical pictures for two different settings and teach the player that the choice
does nothing. On hex the first lights six and the second eight. The tiles also need
`BoardView.pinHover`, because a highlight is only visible when something is hovered and a
thumbnail has no cursor on it — on a touch screen it never will.

**Picking a visual option rebuilds the whole screen, and the scroll position is carried across.**
It has to rebuild: the galleries are drawn in terms of each other — the icon examples wear the
chosen palette, the palette examples wear the chosen icon — so changing one changes what every
other gallery should be showing. The zoom slider is the exception and redraws its example in place,
because it fires on every frame of a drag and forty thumbnails a frame is not a slider. Its example
is drawn at the exact size being chosen, so the setting reads in the units it actually controls.

**Sound and the clear effect are the other two exceptions, and for a different reason.** Nothing
else is drawn in terms of them, so they have nothing to rebuild for — and both are effects in
time, whose only possible example is themselves. Picking one PLAYS it. That is only possible
because they update their own tiles in place: a rebuild would replace the element half way through
the demonstration it had just started.

**The board-clear effect has a Test button, over a board that is genuinely won.** Not a board
dressed up as one: every creature on it is beaten and `status` is `'won'`, which is the state the
effect fires over in play. Building it opens the empty ground FIRST and the creatures last, because
the win lands on the final kill and `open` refuses everything afterwards — the other order leaves
half the floor covered. A module-level handle stops any running demo before starting another and
on every screen rebuild, so repeats cannot accumulate and a rebuild cannot strand a frame loop on a
detached canvas.

**Test deals a NEW board; picking an effect replays on the same one.** The split is the point.
A gallery is a comparison, so the tiles have to differ by the effect alone — reshuffling the layout
underneath would leave the player comparing effects against boards. Test is the opposite job: one
tile watched over time, where a fresh layout each press is what makes it a preview rather than a
recording. It is the only example board that takes a seed and the only one not memoised; the others
are compared ACROSS tiles and so must be identical to each other, and caching every seed Test asked
for would grow without bound for no benefit.

**The clear-effect demo carries one of every tier THE REAL BOARD USES, and none above.** What
that preview is really previewing is the *glyphs*, because the icon effects act on the creatures
themselves — so both halves of that are errors. Missing a tier shows a subset of the art and calls
it the art, and tiers 6 to 9 in particular do not look like 1 to 5: they reuse the five hues
wearing a gold halo, which catches the light quite differently when it is tumbling or burning.
Showing a tier too many is the same error pointed the other way — previewing a creature that
cannot turn up where the player is. NORMAL deals five tiers, so its example shows five; HUGE nine.

**The tier count comes from the board, not the type**, which matters on exactly one ladder. Every
type but BLIND holds one tier count across all ten boards; BLIND climbs 5 to 7 over its own ladder
and to 9 in the continuation. So `previewTiers()` reads the live game when there is one and falls
back to the last board the player looked at — the same pair of fields "game type default" already
resolves against, so the whole screen describes one place rather than two.

Every entry in the example's `quantity` is at least 1, which is what makes "one of each" a property
of the config rather than of the seed — the generator deals exactly what it is given. The quantity
is a fixed nine-long table sliced to the tier count, and that slice does two jobs: the shape is a
real ladder's (commoner low tiers, rarer high ones), and because the slice lengthens with the tier
count the density climbs with it, 14 creatures on 60 cells at five tiers and 19 at nine — which
tracks the real ladders, about 23% at five tiers and about 33% at nine. `test/preview.test.ts`
holds all of it, at every tier count the real ladders deal, read off the ladder data rather than
hardcoded, so a ladder growing a new tier count is an alarm rather than a silent wrong preview.

The gallery thumbnails were deliberately left alone. They are 4x3 boards at 26px showing two
defeated creatures, and their job is the pip SHAPE, which is the same at every tier; nine tiers
would not fit legibly and would be answering a question that gallery is not asking.

**`preview.ts` builds boards and renders nothing, and that is what makes the examples testable.**
`tsconfig.engine.json` compiles `test/` with no DOM library at all — deliberately, so every test
is proven headless as well as every line of the engine. A test importing the real example boards
therefore drags whatever `preview.ts` imports into that pass, and while `renderPreview` sat there
it dragged in `CanvasRenderingContext2D` and broke the build. The choice was between weakening the
guard with an exclude and having no test for the examples at all, and neither is necessary:
`renderPreview` moved to `settingsscreen.ts`, beside its only caller, and the boards stayed where a
Node test can reach them. Anything added to `preview.ts` has to stay DOM-free for the same reason.

**The demo's seed is module-level, so it outlives a rebuild.** Picking a palette or a font rebuilds
the whole screen, and a demo board that reshuffled itself every time an unrelated setting moved
would be noise — the board changes only when the player asks. Test re-seats the game on the
existing view rather than building a new canvas, so the element keeps its size and nothing in the
page moves, and `victorySource()` reads whatever game the view is holding so the effect picks up
the new creatures for free. It must stop the running effect BEFORE swapping the game: a live effect
is holding the old board's glyphs hidden, and swapping underneath it strands that flag on a board
nothing is going to hand it back to.

**Every "game type default" option names what it resolves to.** "Game type default" on its own is a
promise with no content — the player cannot tell whether choosing it changes anything. The picker
says "Game type default — Blips", which is the only thing that makes the three-way shape worth
having. Sound packs and clear effects had no per-type answer before this, so `TYPE_IDENTITY`
in `theme.ts` supplies one per ladder with a fallback, kept beside `THEMES` rather than inside it:
`TypeTheme` is what the renderer needs to draw a board at all, and these are defaults the player is
expected to override. The font's answer lives in `TYPE_FONTS` in `typefaces.ts` instead, for the
reason in the next note, and `identityFor` stitches the two back together.

**Every ladder has a typeface of its own, bundled, and the face dresses the whole interface.**
Twenty-four faces plus Atkinson Hyperlegible Next, which no ladder wears — it was designed for
readers with low vision and is there for anyone who wants the easiest one. They are the Latin
woff2 files Google Fonts serves, copied out of the Fontsource packages into `src/ui/fonts/`, not
npm dependencies. System stacks could not have done it — twenty-four distinct looks are not
installed anywhere — and one of the five stacks this replaced was already quietly wrong: Georgia
("Storybook", worn by ARCANE, ORACLE and DIAMOND) has OLD-STYLE FIGURES, its 3, 4, 5, 7 and 9
hanging 18% below the line, so every board in it had numbers jumping about. **A face must have
lining figures before it can be added**, and that is a thing to measure, not eyeball: a canvas has
no way to switch a face's figure style, so an old-style face cannot be rescued once chosen.
Playfair Display, Almendra and Grenze Gotisch were all turned away for it.

**Four things had to change for twenty-five faces to share one renderer.** (1) Each face carries
the weight the board draws at, because eight have a regular only and a canvas asked for bold from
one fakes it, which smears; `font-synthesis-weight: none` says the same to the interface. (2) The
board sizes digits to a measured height (`DIGIT_HEIGHT` in `boardview.ts`) rather than to the em:
Baloo 2's digits are 62% of theirs and Anton's 87%, so one size made some ladders squint-sized. (3)
It centres them on their measured ink, replacing a fixed nudge under a `'middle'` baseline that
was tuned for one face. (4) The interface does the same through `font-size-adjust: ex-height 0.52`
— lowercase ran from 46% of the em to 73%. **A bundled face can still arrive a frame late**, which
is why the old stacks were system-only: the interface reflows by itself, and `BoardView` asks for
its face and repaints once when it lands. Measured metrics are cached only once the face has
loaded, or the fallback's would size the board for the rest of the session.

**The font data lives in `typefaces.ts`, not `theme.ts`, and that is `preview.ts`'s reason again.**
`theme.ts` draws creatures, so it names `CanvasRenderingContext2D`, and the test pass compiles with
no DOM at all. `test/fonts.test.ts` needs the table, and holds four things that each drift
silently: every ladder has its own face; every face has an `@font-face`, and every file is named by
one; the board weight is one the face really has; and every face's copyright notice is in
`public/FONT-LICENSES.txt`, which Vite copies to the root of every build. **Adding a face means all
four.** Old saves carry the five retired ids (`mono`, `sans`, ...), and `migrateFontChoice` maps
them onto the nearest face on read — `mono` onto JetBrains Mono, which its stack named first.

**Some faces carry a character of their own, and that is the price of the whole interface wearing
them.** Aladin's capital E is drawn like a euro sign, so ARCANE's HUD reads "€XP"; Sniglet's 5 has
a rounded top; Bungee has no lowercase. None of it touches a digit's legibility on the board, which
is what every face was chosen on, but the settings screen sets each tile's caption in its own face
so the player sees it before choosing.

**The font is a player setting, so no glyph in the UI can be assumed.** The in-game settings button
shipped as a gear (U+2699) and rendered as tofu the moment the board was put in anything but the
mono default. It is spelled out now. Anything added to the chrome has to survive all twenty-five
faces — and the bundled files are Latin only, so anything outside Latin-1 and general punctuation
(the arrows, the star) is drawn by the system fallback each stack names after its face.
**The mute speaker is the same rule answered the other way**: it is inline SVG, not a character,
because a path has no font dependency and is the same picture under every face. A word would have
done; a speaker glyph would have been the gear bug again.

**The speaker lives on `document.body`, not in the app root, and that is what "always" means here.**
Every screen begins with `root.replaceChildren()`, so anything inside it is destroyed on each
navigation — an always-present control has to survive that rather than be re-added in four places
and forgotten in the fifth. **Muting is deliberately not the same as setting the sound pack to
OFF**, though both end in silence: the pack is a taste, muting is a circumstance, and folding them
together would throw the player's chosen pack away every time they silenced the game for a minute.
It is repainted from `applyPresentation` rather than only from its own handler, because "Reset
presentation" clears `muted` too and a speaker still showing a cross over a game making noise would
be the control lying about the thing it controls.

**The HUD says words, and the zero padding went with the codes.** `EX0000`/`NE0007` were the
original's four-character readouts, legible only once you already know the game — and "Next Level"
is the one number a new player most needs named, because it is what turns a fight from fatal to
free. Padding existed to hold a fixed width under a terse label, so with words it reads as a part
number; width is held per readout in CSS instead, since what each absorbs differs. Time Attack
needed a call of its own: `T-0004` carried the only thing distinguishing a countdown from a
count-up in one character, and it is `TIME 12 LEFT` now because a glyph is not available here.

**The rules are stated before the first click, and EASY is the only ladder that explains a death.**
Nothing in the UI said what a number MEANS — every ladder subtitle is its tuning axis ("Density,
then size"), which is the right label for a designer and says nothing to a player, and the hint line
under the board explains which button does what. The sum rule leads the card because it is the one
a Minesweeper player gets wrong, and it is stated with its proof: a number can exceed 8 where a cell
has only 8 neighbours. The loss overlay says what killed you on EASY alone — every other type is
gated behind clearing it, so repeating it would stop being an explanation and become nagging. It is
gated on `TEACHING_TYPE` in `app.ts` rather than on a flag in `ladders.json`, because which overlay
says what is a presentation decision with no business round-tripping through the ladder generator.

**The loss note says "took your last N HP", not "cost N", and the difference is not style.** A
`battle` event reports HP ACTUALLY lost, so a 20-point blow against 10 HP reports 10 — which read
as a contradiction beside the rules card's "a tier 5 at LV1 costs 20 HP". On a fatal blow the HP
lost is always exactly what was left, so this says the true number without quoting a price.
Deriving the full blow instead would put a second copy of the damage formula outside the engine.

**`.overlay` is `position: fixed`, and it was `absolute` for most of the game's life.** That is
right only where the screen is exactly one viewport tall, which is true of `.screen.game` (100dvh)
and false of every other screen: the ladder list is as tall as its cards, 2064px at phone width, so
an overlay inset to it centred its card at y=720 against an 812px window and left a 92px sliver of
the top edge showing. That was already true of the "ERASE PROGRESS?" confirmation before any rules
card existed. Safe as `fixed` because the one animated transform is on `.stage`, the overlay's
SIBLING — a transformed ancestor would capture it and quietly turn this back into `absolute`.

**Text size scales the interface and nothing else, and it is applied on release.** It is the root
font size, as a percentage so a browser already set larger keeps its own base, and every size in
the stylesheet is rem, so the HUD, the menus and the settings screen all follow it while the board —
a canvas sized by its cells — does not. Resizing the whole page on every frame of a drag moves the
slider out from under the pointer, so a copy of the HUD follows the thumb (`--demo-scale`, read by
`.hud` and set only on that copy) and the page switches once, with the row held where it was.
**On a phone it runs out of room fast**: past about 125% on a 375px screen the enlarged HUD and
buttons squeeze the board to the stage's 180px floor and the game screen scrolls. Measured, and
left alone — the range is for desktops too, and a phone player can simply choose less.

**The zoom ceiling caps magnification only.** A small board is held at the player's limit instead
of being blown up to fill the stage — which is what the old `MAX_CELL = 48` constant already did
— but a board too big for the stage still shrinks past it down to `MIN_CELL`, so the setting can
never leave a board unreachable.

**Two fingers pinch-zoom, and the lift that ends a pinch opens nothing — the second half was a bug
before the first half existed.** A two-finger touch used to reset the pan's starting point to the
second finger, and whichever finger lifted first clicked the cell under it: zooming on a phone could
open a cell, which can end a run. Now a touch that has ever had two fingers down is a gesture until
every finger is up, and no lift in it opens anything. The pinch scales the cell size with the
spread of the fingers, clamped to the wheel's own limits, and keeps the board point under the
midpoint under the midpoint, so one gesture zooms and pans at once. Only `pointerType === 'touch'`
is tracked: a mouse button released outside the window can leave its pointer behind, which here
would turn the next touch into a phantom pinch. The arithmetic is in `src/ui/pinch.ts` rather than
in `BoardView`, for `preview.ts`'s reason — the test pass compiles with no DOM, and `boardview.ts` is
made of canvas calls. A resize still refits the board, so rotating a phone resets its zoom; that is
the existing behaviour and was left alone.

**A palette's `hot` has to be told apart from its `ink`, and checking it against the FLOOR misses
that entirely.** `hot` draws the number on a defeated creature and `ink` draws every other number,
so the two sit side by side on the same dark ground — and four palettes shipped with a `hot` that
contrasted beautifully with the floor (8–11:1) while sitting under 90 RGB units from their own
`ink`, which reads as one pale colour. PAIRS was the one that surfaced it, because it is the only
ladder that shows that number by default, but SUDOKU, ORACLE and BLIND were all worse. Fixed at
#ffc23d / #ff5dc8 / #fa4f7a / #3fb8f0; the set's minimum is now 93 and nothing lost floor contrast.
The measurement is three lines of Python and worth rerunning whenever a palette is added.

**And the warm fix is unavailable on exactly the ladders that most look like they want it.**
GIVEN_COLOR is gold, and it is what a Sudoku given AND a Reveal mark are drawn in — so on SUDOKU
and on every magic ladder an amber `hot` lands within ~20–60 units of the annotation the board is
covered in, trading a collision with `ink` for a worse one. BLIND is the opposite trap: its `ink`
is a neutral near-white, so nothing separates from it by HUE and only saturation does. Three
constraints, then, not one — `ink`, the floor, and whichever annotation colours that ladder
actually puts on screen. Distinctness from OTHER palettes is not a fourth: they are worn one at a
time, and the shipped set never respected it anyway (CAVE and DONUT are 5 units apart).

**The "Hovering a creature you have beaten" setting is DISABLED, and the next three notes describe
it as it was.** Hover now shows the number under a beaten creature (see the PAIRS note), and the
two cannot share the cursor. The settings row and the renderer's half are commented out rather than
deleted — `settingsscreen.ts` and `BoardView.drawOpen` — while `hoverDefeated` is still plumbed and
saved, so players' chosen values survive and bringing it back is uncommenting both together.
`drawTierBadge` and `isPipShape` are left defined with no caller for the same reason.

**Hovering a beaten creature can show its LEVEL, and that is presentation rather than assistance
because it reveals nothing.** The pips already say the tier — the digit is the same fact written
instead of counted, which is worth most on the nine-tier ladders where telling eight pips from nine
is genuinely slow. So it sits with the presentation settings and can never touch a record. It
defaults to ON, by request; "Nothing" is the game as it was. The store writes every presentation
field whenever it writes one, so a save that ever touched a setting before this flipped carries
`'none'` explicitly and keeps it, and only a save that never opened settings picks the new default
up. No migration, because the store cannot tell a chosen "Nothing" from an incidental one.

**It is drawn in the LEVEL'S own colour, and that is what makes it safe to read.** A cell's number
and a creature's level are both single digits in the same cell, and on PAIRS both are live at once,
since the number there IS the partner's level. A digit that simply replaced another digit in the
same ink would be a misread waiting to happen — measured on a live board, hovering turned a "3" into
a "1" in place. `tierColor` is already the global encoding of a tier and is worn by the very pips
the digit covers, so the colour says which of the two numbers you are looking at. Anything else that
ever writes a digit into a cell needs to answer the same question.

**The restyle branch of that setting always contains one option that does nothing, and it is named
rather than hidden.** One of the seven pip shapes is whichever shape the board is already drawn in,
so its gallery tile is pixel-identical to "Nothing" — measured, not assumed. That is the trap the
cursor-highlight gallery escaped by moving to a hex board, and it cannot be escaped that way here:
these tiles have to wear the player's OWN icon or they are previewing somebody else's board. So the
label says "already the shape in use", which is the same answer as "game type default" naming what
it resolves to. `test/preview.test.ts` holds the pin to a defeated creature of the highest tier,
because a pin that drifted onto floor would leave every tile in the gallery identical.

**Palette and icon are separate settings on purpose.** Borrowing ARCANE's teal should not also
borrow its hexes; they were never one decision. The menus keep the ladder's own accent whatever the
board is painted, so the game stays navigable however far the board is repainted.

---

## Open decisions and unfinished work

Ordered by how much they matter.

**The ladders have never been played.** Every density, lock depth and HP value is derived and
simulation-checked but not playtested. This is the biggest open risk and the reason Milestone 2, the current one,
(headless measurement across many seeds, then retuning `ladders.py`) exists.

**Boards still contain unresolvable 50/50s, and there is now a solver that can say which.** Some
deaths are unfair rather than earned. Solvable generation is the highest-value QOL fix and is harder
here than in Minesweeper: the constraint is "these *n* cells' tiers sum to *N*, each in 0…T" — a
bounded integer composition problem, not a count. The generate-and-test rejection rate has been
measured (below), and it says generate-and-test alone cannot reach the top of the hard ladders.

**The complete deducer is a measuring instrument, not a generator — `src/sim/solver.ts`.** It answers
exactly what the honest player approximates: is there a covered cell that every layout consistent
with the screen makes free? It reads what a player can see — numbers (a defeated creature's too),
open tiers and givens, the colour, pairing and pack rules beside open creatures, and the per-tier
counts the palette shows — and leaves out the dungeon's room structure and the structural rules
away from open creatures. Leaving a rule out can only make it find FEWER free cells, so every count
below is a floor. It is a bounds-propagating search with one idea worth knowing: a layout found
witnesses a value for every cell in it, so only cells no layout has yet put above your level need a
search of their own, and those try a two-number window around the cell first, with the numbers at
the window's edge relaxed to what their outside cells could make up — a window with no room for a
dangerous value is a proof. `npm run sim:forced` plays the honest player and a player that takes the
solver's free moves on the same seeds; its `bad` and `hurt` columns must be zero, and were zero over
every battle ladder at 30 seeds a board (no screen it could not lay out, no HP lost on a cell it
called free). `test/solver.test.ts` holds both, and that it opens everything Sweep's own proof does.
It is fast where it is used — milliseconds at a real stuck point — and slow on a frontier scattered
at random, which no game produces; the search is budgeted, and a question the budget cuts off counts
as not free. It lives in `src/sim` because nothing in the game calls it; generation using it would be
the moment to move it to `src/engine`. The honest player moved out of `spellvalue.ts` into
`src/sim/honest.ts` for it — that file runs its CLI at import — so both measurements share one copy of
the player; the move was checked by diffing `sim:spells` output before and after, byte for byte.

**Every forced-guess figure in this file is an upper bound — by about two, and not by the same factor
everywhere.** At 57–97% of the honest player's stuck points the solver had a free move. A perfect
deducer is cornered 31–59% less on the plain and shaped ladders — ARCANE 2.21 → 1.07 a board,
EXTREME 5.29 → 3.08, DONUT 4.10 → 2.46 — and 68–85% less on the placement-rule ladders: CHECKERBOARD
1.21 → 0.18, CONGO LINE 1.28 → 0.27, DOMINOES 0.72 → 0.19, PACKS 1.64 → 0.44, PAIRS 1.16 → 0.37. That
second group is the one that matters: those rules combine across numbers in ways the honest player's
one-cell readings never reach, so each of those ladders was tuned against a player who understood
its rule worse than a strong human will, and plays easier than its tuning says. The typical miss is
not exotic. ORACLE board 3, LV2: a 3 and a 9 each leave a cell possibly a 3, but a 3 there would
empty the two cells below it, leaving the 7 beside them needing a tier 7 in its last covered cell,
on a board that stops at tier 6 — so it is at most a 2, and free. Tuning with the honest player still ranks the plain and shaped ladders consistently
with each other, because they all fall by about the same share, which is why the shaped-ladder
retune used it; it does not rank the placement-rule ladders against them, and re-deriving those
five against the solver is the open question this leaves.

**Guess-free generate-and-test is affordable early and impossible late.** Share of boards a perfect
deducer finishes without once being cornered, 30 seeds: NORMAL 94% (board 10: 93%), ARCANE 73%
(37%), DUNGEON 59% (17%), DONUT 36% (3%) — and 0% on board 10 of EXTREME, HUGE x EXTREME and ORACLE
(HUGE x EXTREME before its retune; 5% since).
Rejecting any board that forces a guess costs about three deals on ARCANE's top board and cannot
produce EXTREME's at all. The top of the hard ladders needs construction (placing creatures so the
deduction exists) or a weaker target — no forced guess that can KILL, rather than none at all, which
is what HP-as-guess-budget already implies.

**The weaker target — no forced guess that can kill — rescues most of what the strict one cannot,
and still not the top of the hard ladders.** `npm run sim:lethal` plays the perfect deducer and, when
it must guess, guesses the cell whose WORST case is lowest: the solver asked at each tier in turn
(`threshold`, which makes "safe" mean "proven at or below this tier"), the honest player's own
judgement breaking the tie. At each forced guess it records whether that worst case could have
killed at the player's HP. A board where none could is a board a perfect player cannot lose, so its
share is exactly what generate-and-test would keep under this target. At board 10, 30 seeds:
ARCANE 97% (against 37% guess-free), DONUT 73% (3%), EXTREME 7% (0%), HUGE x EXTREME 0% (0%, before its retune),
ORACLE 0% (0%). Cheap for the magic and shaped ladders, one deal in fourteen for EXTREME's top
board — and impossible for HUGE x EXTREME 9–10 and ORACLE 9–10, which is not a generation problem
but a schedule one: see the lock-depth note. The guesser matters less than it sounds: "lowest worst
case" clears about what the honest player's own guess choice does (EXTREME board 10: 10% against
7%); what moves the numbers is the deduction and the board.

**The mana affordability test is three claims now, and DUNGEON is why it was rewritten twice.** The
original bar was one vague one — the dearest spell, castable five times over — which was a fair
proxy only while mana was free. DUNGEON broke it once by being sparse (most of its income is
exploration, not kills, so a kills-only pool understated it by 70%) and again by taking Exercise
(the dearest spell became 50, which its board 1 affords three times). Three times is not a ladder
priced out of its loadout; it is a ladder where the loadout costs something, which is what the notes
above had been asking for. So the bar now says three separate things, each with a measured floor:
the CHEAPEST spell is castable many times (floor 15.0, DUNGEON #1), the DEAREST at least twice
(floor 3.0, DUNGEON #1), and the pool covers one of everything at least once (floor 1.8, DUNGEON
#1). A vague bar that has to be relaxed every time a ladder is interesting was measuring the wrong
thing.

**Spell prices are 30/75/150/300 (Census, Reveal, Exercise, Beacon), and this is the first time
they have been load-bearing.** The test for whether a price matters is not what share of a pool gets
spent, it is what it would cost to buy your way out of *every* moment a deductive player is
cornered. At the old 25/10/50/100 that was 1-32% of a board's whole pool, so no ladder could run out
of mana by playing well and doubling or halving the table would have changed nothing anywhere. At 3x
it is **40-86% on the late boards** and 2-30% on the early ones, which is the shape wanted: the
introduction stays cheap, and by board 10 you cannot answer everything and have to choose which
moments to buy. Measured over 15 seeds a board, casting on DUNGEON fell from 2.4 Reveals a board to
1.4 while the share that unlocked something rose to 87% — a player who has started choosing — and
clear rates moved without collapsing: DUNGEON 98→93%, DONUT 91→87%, ORACLE 51→49%, the rest
unchanged.

**It is one global table and should stay one.** The variation between ladders is already carried
twice over — by income, where a board's pool spans 150 to 1,233, and by demand, where forced guesses
span 0.1 to 6.0 a board. A per-ladder price would be a third axis saying what those two already say,
and it would stop "Reveal costs 75" being a fact the player learns once. It would also break what
cheapest-first button order *means* as you move between ladders. If one ladder needs to feel poorer,
the lever is its income — `start_mana` is already per-type — not its prices.

**Starting mana tripled with the prices, to 75, because it was never a number.** It is "one Reveal
exactly", chosen so the opening pool answers the first question a board asks and not the second.
Anything that changes Reveal's price has to move it or the intent is silently dropped.

**Still an untuned first guess:** `MANA_PER_EMPTY_CELLS = 4`. `EXERCISE_LEVELS` is 1 and must stay
1 — damage is a staircase, so two levels clears two steps at once.

**Measured, by `npm run sim:spells`: Reveal is worth 60-70x Census as actually played.** At the
current prices, per cast it saves 0.94 HP against 0.01; per mana, 0.0126 against 0.0003; it lifts
the clear rate 3.7 points where Census lifts it none. Priced on value as played, Census would cost
2.0 mana against Reveal's 75. The instrument is an honest player — it reads only what a player can
see, deduces with Sweep's own bound plus exact tiers plus subtraction of overlapping numbers, and
guesses when it runs out. The ratio between the two spells is what to watch here; the absolute
numbers all moved when the prices did.

**Reveal also clears the blank ground touching its target, and that ring is 45% of the spell.**
Measured, it took Reveal from 0.65 HP a cast to 0.94 and its clear-rate lift from +2.3 points to
+3.7. The justification is that it gives nothing away: a cell with no creature on it was always free
to open, so the ring saves clicks rather than risk. Two things make it safe to have written this
way. It cannot run away — revealing a CREATURE can never cascade, because every neighbour of a
tier-N cell carries at least N in its own number and so cannot be a zero cell, and a cascade needs
one (there is a test standing a lone creature in a 55-cell zero-region and asserting exactly eight
cells open). And revealing EMPTY ground could always cascade, so the ring adds nothing new there.
The cells pay no exploration mana, the same as Beacon's and the dealt opening's — ground you bought
is not ground you explored.

**It also pushes the frontier on DUNGEON, which is a synergy rather than an accident.** Opened cells
are what the crawl rule measures reach from, so a Reveal now extends where you may act. That is the
right shape for a dungeon crawl — you buy a look into the next room and can then step into it — and
it is worth remembering if reach is ever given to another type.

**Consequence to watch: Reveal now buys twice what Exercise does per mana** — 0.0126 against 0.0061,
where before the ring it was 0.0087 against 0.0061. Nothing is broken, and Exercise still lifts the
clear rate nearly as much (+3.3 against +3.7) because the two do different jobs. But if the two are
meant to be a real choice on DUNGEON rather than a default and a fallback, pricing Reveal at 100
would put them level again. Left alone deliberately: the ring was asked for as a buff, and the
measurement is here so the decision can be made on it rather than re-derived.

**But Census is not weak information, it is unaimable.** Cast where it demonstrably unlocks
something — an oracle that looks first, which no player can do — it is worth 0.28 HP per cast,
close to Reveal's 0.65, and per mana it is Reveal's equal. The catch is that such a spot exists only 0.1-0.3 times per board, and a
player aiming by judgement hits one 2-9% of the time. So the gap is not in the answer Census
gives, it is in knowing where to ask. Repricing cannot fix that.

**Exercise replaced Ward, and lends a level rather than soaking damage.** It resolves the fight at
`level + charge`, so the creature dies the same way and pays the same EXP — invariant 3 is
untouched, and the zero-damage guarantee is a statement about what is *possible*, which a buff can
only help. Two things to keep in mind if it is ever changed: the charge counts toward the mark
guard, because refusing the one fight the spell was bought for would make it useless; and it must
NOT count in `safeCells`, because a proof that holds for one borrowed level would be applied to
every cell the sweep returns, and only the first fight gets it.

**Spell shortcuts are derived from the name, not stored** — `spellKey` takes the first letter, and
the button shows it in brackets, [B]eacon. That keeps the key and the label from ever disagreeing,
at the cost of letting two spells want the same letter: of the spells still on paper, Echo already
collides with Exercise and Scry with Sweep's own `s`. A test asserts the built set stays distinct
and clear of the board's keys, so a clash fails a build rather than silently swallowing a keypress.
The UI checks the board's own keys first, so a spell can never shadow Sweep or zoom.

**`safeCells` now reads `census` — it did not, and that was most of Census's problem.** Sweep
proved safety from the number alone, so a Census answer was information the game itself could not
act on and the player had to translate into marks by hand. The bound it was missing is
`residual - (creatures - 1) <= level`: each creature sharing the hidden sum is worth at least 1, so
the biggest is capped below the sum. It stands with `proven` rather than with the marks, because a
count is a fact and not a claim.

**Exercise is the best spell per cast in the game, and the worst per mana.** Measured over ORACLE
and DUNGEON, the two ladders that carry it: 0.91 HP saved per cast against Reveal's 0.65, and 0.0061
per mana against Reveal's 0.0087, because it costs twice as much. It also lifts the clear rate more
than Reveal does — +3.3 points against +2.3 — which is the clearest statement of what it is for:
Reveal stops you guessing, Exercise makes the guess you could not avoid survivable. On DUNGEON it
saves 0.1-0.85 HP a board and takes the ladder from 86% cleared to 89%. **At 150 it is out of reach
on DUNGEON's first boards** — its board 1 holds 200 mana and wants about one cast — so it reads
there as a late-ladder option rather than part of the opening kit. That is a consequence of the
reprice worth watching in playtest: it was 0.48-2.30 HP a board before. `npm run sim:spells` measures it with a policy of its own, cast at the same
moment the information spells are — the one where deduction has run out — and judged on the
`exercised` event the fight itself emits, since it unlocks nothing a player could reason about and
scoring it on unlocked deductions would have scored it zero.

**Each policy in `sim:spells` is now judged against its OWN ladders.** One baseline for everything
was fine while every magic ladder carried every spell being measured; Exercise is not on every
ladder, so a single baseline would have compared its runs on the ladders that have it against
spell-less runs on ladders that do not, and the difference would have been a fact about which
boards those are rather than about the spell.

**Spell value is a hump, not a slope** (`npm run sim:spells -- 40 <ladder>`). A spell only pays at
a moment where deduction has run out, so it needs a board hard enough to corner the player and
still winnable once it does. Both ends fail, and both failures were live. ARCANE boards 1-4 used
to corner the honest player 0.0-0.1 times a board and it cleared 97% of them untouched, so Reveal
saved 0.00 HP — nothing to fix. ORACLE boards 8-10 corner it 7-11 times and it clears 0%, so
Reveal saves 0.00 there too — nothing that *can* be fixed. Tuning a spell against a ladder at
either end is measuring nothing.

**ARCANE was retuned off that finding**, from .220-.292 to .265-.345 — denser than EXTREME, which
is the point: the spells are the compensation. Measured over 40 seeds a board, it now corners the
player 0.1 times on board 1 rising to 5.0 on board 10, clears 98% falling to 65-68%, and Reveal
saves 0.75-1.05 HP on the late boards against 0.00-0.56 before. The early boards stay gentle on
purpose; it is still the ladder that introduces magic.

**ORACLE boards 7-10 are not clearable by a deductive player, and the solver confirms it is the
boards, not the player.** The honest player clears 0-3% of them over 30 seeds. A perfect deducer is
still cornered 6.7-9.1 times a board there and clears 23%, 3%, 0% and 3% — against 90-100% on
boards 1-6, where it is cornered at most twice. The cliff is between boards 6 and 7 (2.0 forced
guesses to 9.1). That is 6 HP and a flat 6-tier curve against forced guesses no play can avoid: those
boards are decided by 50/50s. Worth settling before the ladders are playtested, since a human will
read it as unfairness — and the solver says it cannot be settled by generate-and-test (0 of 30 board
10s were guess-free), so it is a schedule question for ORACLE, or construction — and the schedule
lever turned out to be the lock, not density or HP (next note).

**The cliffs on the hard ladders sit where the lock gets deep, and the lock — not HP, not density —
is what makes those boards guess-decided.** Lock depth maxes out at one less than the tier count,
where every threshold above the first is a full-tier-clear gate. EXTREME reaches it (4 of 5) at board
9 and ORACLE (5 of 6) at board 7, and each ladder's perfect-deducer clear rate falls off a cliff on
exactly that board. Held one short of the maximum and otherwise unchanged, complete deducer, 30
seeds a board: ORACLE 7–10 go from 23 / 3 / 0 / 3% cleared to **97 / 63 / 40 / 47%**, board 7's
forced guesses from 9.1 to 2.6; EXTREME 9–10 from 20 / 7% to **60 / 60%**, forced guesses from
about 8 to 5.5. Against that, ORACLE with two more HP barely moves (43 / 3 / 0 / 3%) — a bigger
budget only buys the player more forced guesses before the end — and three points less density
helps a little (47 / 53 / 37 / 13%). Lock held at 4 AND two more HP takes ORACLE 7–10 to 97 / 70 /
63 / 63%. The mechanism is the tuning identity's own: a max-depth gate needs every creature of a tier
found before the next level, and the last one of a tier is often the one sitting in a 50/50. The
reference page's "lock depth amplifies the need for solvable generation" was a warning; this is its
size — the step to maximum depth roughly triples a perfect player's forced guesses on the board
where it lands.

**Two short of maximum is not advised, measured.** EXTREME 9–10 at lock 2 clear 67 / 60% for a
perfect player against one-short's 60 / 60% — nothing bought. ORACLE 7–10 at lock 3 reach 100 / 77 /
57 / 67% against one-short's 97 / 63 / 40 / 47% — a real gain, but the same one "one short plus two
HP" already gets (97 / 70 / 63 / 63%, honest player 60 / 43 / 13 / 30%). And two short puts the top
boards BELOW the middle of their own ladder — EXTREME's boards 5–8 hold lock 3, ORACLE's 4–6 lock
4 — so the lock dial would run backwards exactly where the ladder is meant to peak. The advice given
was one short on both, with two more HP on ORACLE 7–10 if its top should be as winnable as two short
would make it.

**HUGE x EXTREME does not follow the pattern, because it is deep everywhere.** Its lock runs 5–8 of
9, and a perfect player's clear rate is already 60–85% at lock 6 on boards 4–6 and 25% at lock 7 on
board 7. Holding boards 9–10 one short of maximum changes almost nothing (0 → 10% and 0 → 0%, 20
seeds), and holding lock at 6 from board 4 on only lifts boards 7–10 to 35 / 20 / 25 / 15%. Deep,
dense and nine tiers at once: the lock alone cannot rescue it.

**HUGE x EXTREME's board 10 is winnable now, by request, and it took lock AND density.** Keeping the
maximum lock (8) was tried first, because the blurb made it the ladder's identity: board 9–10 at
lock 8 needed density cut to 26% — below board 1's — to reach even 30% for a perfect player, which is
no ladder at all. What shipped holds lock at 7 on boards 7–10 and steps density back at board 7 to
pay for that lock step: `density .259 .266 .273 .281 .284 .286 .278 .279 .280 .281`, `lock 5 5 5 6
6 6 7 7 7 7`. Perfect player 75 / 70 / 65 / 55 / 65 / 60% on boards 5–10 (was 70 / 60 / 25 / 0 / 0 /
0), honest player 10% on board 10 (was 0), 20 seeds. Two alternatives measured level with it and
are worth knowing: lock 6 from board 4 with density rising to 30% (board 10: 45% / 5%), and lock 6 with
density held near 29% (50% / 5%) — both flatten the lock dial where this keeps it climbing. The blurb
now says "every level-up past the first", which is what lock 7 of 9 means. The continuation changed
more than the ten: with room left under the ceilings it now runs 24 boards past 10 instead of 6, and
its lock climbs back to 8 by board 13 — so the scaling boards are the unwinnable kind again, which is
optional content getting as hard as it can. EXTREME and ORACLE were left as they are, pending the
decision above; the zero-damage guarantee holds for any lock by construction, and `npm run sim`
cleared all 689 boards at full HP after the change.

**"Share of the pool spent" is the wrong measure of scarcity, and it took two sessions to notice.**
It said 1-11% on the dense ladders and 29-34% on DUNGEON, which read as "prices bite on DUNGEON
only" — and the conclusion drawn from it, that the way to make prices matter elsewhere was a sparser
board, was wrong. Spend share is as much a fact about how often a player *wants* to cast as about
what casting costs. The measure that actually answers the question is what it would cost to buy your
way out of EVERY moment a deductive player is cornered, as a share of the whole pool: at the old
prices that was 1-32%, so even a player buying everything finished with two-thirds of the board's
mana unspent, on DUNGEON as much as anywhere. Nothing was scarce; DUNGEON was just the least
un-scarce. See the pricing note above for what that changed.

**The shaped ladders carry magic, and now sit on ARCANE's curve — two of the four had to move and two
did not.** DONUT, CROSS, DIAMOND and RAGGED CAVE carry ARCANE's loadout on densities derived for a
spell-less board, and the argument was that ARCANE runs 1.4–2.2 points above NORMAL because magic
buys answers, so all four played easier than measured. Measuring them against ARCANE's curve with the
honest player — DUNGEON's method — said that was true of only two. At 60 seeds a board, ARCANE is
cornered 24.0 times over its ten boards and clears 82% on average. DONUT was already HARDER (41 stuck
points, 85%) and RAGGED CAVE already on it (25, 89%), so both stay. CROSS (13.1, 94%) and DIAMOND
(10.9, 95%) moved: CROSS 2.5 points up to 21.8 and 89%, board 10 at 5.0 stuck and 63% cleared against
ARCANE's 5.1 and 63%; DIAMOND 4 points up to 20.1 and 84%. WRAPPED CROSS moved with CROSS to keep its
1.2-point relationship, and re-measured still on CROSS's curve. The complete deducer from
`sim:forced` agrees on both movers, which matters because it is the check that the honest player
ranks these ladders the way a stronger one would. The mana economy needed no changes — 23–25%
exploration share on their first boards against ARCANE's 26%, 13+ full kits on the poorest.

**Stuck points and clear rate disagree about DONUT and CROSS, in opposite directions, and the curve
matched is the stuck points.** DONUT is cornered nearly twice as often as ARCANE and clears about as
much; CROSS at its new schedule is cornered a little less and clears more. Both are the "cheap guess"
finding again — a guess on DONUT's two rims or CROSS's all-rim arms is a guess you know something
about. Every retune in this file matched forced guesses (DUNGEON, CHECKERBOARD, WRAPPED CROSS), so
this one did too; a ladder meant to be as DEADLY as ARCANE rather than as puzzling would match the
clear rate instead and land somewhere else.

**A retune is measured on a candidate file, never on the real one.** `CS_LADDERS=path.json` points
every sim at a candidate `ladders.json`, so a schedule can be walked and measured before it replaces
the tuned one — and a sim already running is not handed a half-finished edit, since the file is read
once per process. The candidates here were built by importing `ladders.py`, shifting `TYPES` in
memory and calling `build()`, so thresholds, the continuation and every invariant came from the real
generator; the final `ladders.json` was checked byte-for-byte against the candidate that was measured.

**Anything classifying ladders by "has spells" now needs shape checked first.** The reference
page's unlock graph did exactly that and would have emptied the shape row into the magic row.

**There are three kinds of unlock gate, and only one of them fails loudly.** `requires` is a list of
types whose board 10 must be cleared — readiness, and a bad one is a cycle, which is obvious.
`requires_boards` is a count of boards cleared anywhere — time served, and a bad one is just a
number. Nothing about the number says whether a player can reach it *without* the type it guards,
so setting one above what the type-gated ladders offer would leave a save simply stuck, with
nothing to point at. The type-gated ladders (EASY, NORMAL, HUGE, EXTREME, HUGE x EXTREME, ARCANE,
ORACLE) offer 70 tuned boards; SUDOKU at 80 is the top of the schedule. `test/unlocks.test.ts` walks
the graph from an empty save and fails if anything is stranded, and separately walks the counted
gates in order *without* counting a scaling board — a player who never goes past board 10 must still
reach everything.

**`requires_runs` is the third, and only BLIND carries it: Full Runs completed on three DIFFERENT
types.** Not readiness and not time served, but finishing something with no restart, which is what a
1 HP board asks every time. It counts `runs[id].cleared` in the save, one per type, so running EASY
three times is one run; a run that falls short counts for nothing. It fails as quietly as a board
count, so it is guarded the same way: a Full Run opens on a type's board 10, the types reachable on
type-clears alone offer seven of them, and a test asserts the gate fits inside that. Anything that
classifies types as "ungated" has to check this field too — the budget tests counted BLIND as free
until they did. The reference page draws BLIND at the end of the counted lane.

**The variant ladders do not teach each other, so they are not chained.** A hex grid teaches
nothing about a torus and neither teaches Sudoku; chaining them made a player who wanted the ragged
cave grind three shapes they had no interest in first. Counting boards lets them arrive from any
direction. The menu order follows the thresholds so it reads in the order a player meets it.

**The counted ladders used to open easiest first; the order is now set by hand, by request.** It is
WRAPAROUND, CROSS, HIVE, DIAMOND, PAIRS, DONUT, CHECKERBOARD, CONGO LINE, RAGGED CAVE, DUNGEON, then
SUDOKU, and it does not follow difficulty — most visibly DUNGEON, the second easiest, is last before
SUDOKU. Don't "fix" it back to the ranking. The ranking
by the honest player from `sim:spells`, spell-less, 30 seeds a board, on mean clear rate over the
tuned ten, is still worth having:
WRAPAROUND 99.0, DUNGEON 97.7, CHECKERBOARD 97.4, CONGO LINE 92.8 (60 seeds), HIVE 92.7, PAIRS
92.1, RAGGED CAVE 89.0, CROSS 88.7 (60 seeds, since its retune), DONUT 84.9, WRAPPED CROSS 84.3
and DIAMOND 83.7 (both 60 seeds, since the retune). SUDOKU cannot be put on that scale and keeps
the top slot, 80; BLIND is no longer on the schedule. The complete deducer re-ranks the
placement-rule ladders well below their place here — see the solver note.
Two things in it contradict notes elsewhere in this file and are worth knowing before anyone
reorders by argument: WRAPAROUND, at NORMAL's own schedule, was cornered 0.0-0.6 times a board and
is the gentlest of the lot, whatever "edges are free information" predicts; and DUNGEON, the ladder
that carries spells and the crawl rule at once, now opens at 60, so ARCANE has usually come first. CONGO LINE, HIVE and PAIRS are within the noise of each other.

**Every cleared board counts once, scaling boards included.** That is deliberate: a player who
would rather go deep on one ladder than wide across several gets there too.

**SUDOKU is built.** 9x9, tiers 0-8 as the nine digits, so every row, column and box holds exactly
one empty cell — and those nine empties *are* the opening, free and needing no rule of their own
(`opening: 'empties'`). Digits 1-9 does not work and it is not a small thing: at 100% density every
pre-revealed cell is a pre-*killed* one, and 30 of them grant ~1700 EXP, past `C_7`, handing the
player level 8 before their first click.

**Its whole ladder is the givens count, because the rule takes the other dials away.** `quantity` is
nine of each tier on every board, so `C_k` is identical throughout and density, tier count and
distribution do not exist as levers — `ladders.py` branches around its own density/distribution path
for this type. Schedule is 26 down to 15 givens, lock 3 to 7. Difficulty is not the clear rate (100%
by construction) but the *tightest round*: the fewest cells any one round of deduce-kill-deduce
hands you, measured 9.0 down to 3.1.

**Every board is generated guess-free, and that is the point.** Damage is `E*(ceil(E/L)-1)`, so a
tier-8 at LV1 costs 56 against 14-20 HP — HP cannot be a guess budget here, so a board with a 50/50
is not hard, it is broken. `generateSudokuBoard` is generate-and-test against the propagator in
`sudoku.ts`. Build cost is flat to ~18 givens, 15x at 16, 45x at 14, and there is no guess-free
board below about 11; below the floor it throws rather than shipping a board it cannot vouch for.
Because boards are tested against a *fixed* solver strength, fewer givens makes them rarer and their
chains tighter rather than demanding harder techniques — that is the thing to revisit first if the
ladder reads as flat.

**Sweep on a Sudoku board is a harvester: it opens cells whose mark is at or below your level.**
Clues under the strict button (a given is the board talking, so it is a fact), your own marks under
the assisted one, so the proof-versus-claim split is unchanged. It was measured into existence: the
ordinary neighbour-sum proof returns **zero cells on every board of the ladder**, even with half
the grid correctly marked, because hidden sums run to sixty at this density and neither
`hidden <= level` nor the mark-assisted residual ever comes near a level. Both buttons were
permanently dark. The harvest rule gave up nothing and cannot run away, because marks are
player-authored and nothing regenerates them.

**Sweep must stay strictly weaker than the generator's solver, and only here is that not free.**
Every other ladder's boards contain real ambiguity, so any automatic deducer runs out by itself.
Sudoku boards are made by rejecting whatever `clearableWithoutGuessing` cannot finish, so wiring
that same propagator into `safeCells` made Sweep clear 100% of every board in one click. It shipped
that way briefly. The Sudoku rule is therefore deliberately absent from `safeCells`; the player
supplies it as pencil marks and Sweep opens what they prove.

**What keeps that true is that notes do not regenerate.** Opening cells reveals new numbers, but it
never pencils anything, so `sweep`'s fixpoint loop cannot iterate its way to a solution — it is
bounded by the player's own work. An auto-fill-candidates convenience would hand that property
straight back and turn Sweep into a solve button again. There is a test asserting Sweep alone never
carries a board.

**Consequence: both Sweep buttons are dead on a fresh Sudoku board.** Nothing is provable from
numbers at this density until cells open, and no pencil work exists yet. That is correct rather
than broken — Sudoku hands out no free moves either.

**Three things make a Sudoku board readable, and one has a weight threshold.** A row and a column
announce themselves; a 3x3 box is nine cells that look like any other, so the constraint the board
rests on was invisible. (1) Alternate boxes take a translucent wash — `washesBox`/`fillWash` in
`boardview.ts`, on `(boxX + boxY) % 2` — as a wash rather than a second palette, so it derives from
whatever theme is in play and lands identically on covered tile and cleared floor. The floor case
is the one that matters: by the endgame the whole board is floor, which is when the grouping is
hardest to hold. (2) The box boundaries take a heavy rule, and **it must be roughly twice an
ordinary cell edge** (`size / 4.5` against the edge's `size / 10`) or it reads as one more cell
border — at equal weight it was simply invisible on screen. It is drawn in one pass over the
finished board rather than per cell, because a cell drawn later paints over its neighbour's half of
a shared edge. (3) Givens render gold (`GIVEN_COLOR`) against the green of player marks, keyed off
`cell.given`. All three are gated on `placement === 'sudoku'`.

**Givens are marks with `given: true`, and they are unerasable.** Re-marking toggles a mark off, so
without the flag a player could rub out a clue they cannot get back and turn a guess-free board
unfair. `setMark` and `toggleNote` both refuse with `blocked: 'given'`.

**Pencil marks are built; the Sudoku type is what they were built for.** `Cell.notes` is a bitmask
of candidate tiers, bit `t` for tier `t`, and it is deliberately NOT a second `mark`: a mark is a
value and feeds the neighbour-sum subtraction, a note is a set and cannot. They are mutually
exclusive on a cell, because two live claims would force every reader to arbitrate between them.
Useful well before Sudoku: "this is a 1 or a 2" is a natural annotation on any board.

**NOTES CAN PROTECT YOU; THEY MUST NEVER EXPOSE YOU.** A set is read in exactly one direction:
`lowestNote > level` guards the cell, because if even the weakest candidate is out of reach then
every possibility is. It is deliberately NOT read the other way. `highestNote <= level` shipped
briefly as a claimed-safe rule and it was wrong — a cell pencilled {2,3} at LV5 that was really a
tier 7 was offered up by Sweep for 7 damage. A pencil mark means "the tiers I have not ruled out
yet", the opposite of a claim about what the cell is, so a permissive reading charges the player
for thinking out loud. A conservative reading of an uncertain annotation is safe; a permissive one
is not. When the player is sure they commit the pencil to a mark, which is the Sudoku idiom
exactly. `highestNote` now has no caller in the engine — that is on purpose, not dead code waiting
to be wired up.

**Full Run replaced the parked Ironman, and three of its rules are forced rather than chosen.**
All ten boards of a type back to back, unlocked by that type's board 10 so a run is never how a
player first meets a board. (1) **Level and EXP reset every board** — thresholds are `C_k` of a
*specific* board, so a level carried forward would arrive at board 2 near its ceiling and every
board after the first would be free. Only HP may cross a boundary, and building a fresh `Game` per
board is what makes that structural instead of something to remember. (2) **Mana does not carry**
either: a run-long pool would make the late boards the ones where spells are free, which is
backwards, and it would reward not casting in a game whose measured problem with spells is that
nobody is ever forced to spend. (3) **One max HP for the whole run** (`run_hp`, board 1's), with
the per-board schedule ignored — board 1 is the most generous entry in every schedule, so the
ceiling never drops under the player mid-run. The heal is half that pool, rounded down, after each
cleared board.

**None of that touches the zero-damage guarantee, and that is checkable.** The guarantee is a
statement about one board, and a run resets the level economy every board, so it still applies ten
deep: `npm run sim:run` completes every type's run at full HP over many seeds and exits non-zero if
one cannot. HP stays a guess budget; a run just makes it one budget instead of ten.

**The heal rounds DOWN, and BLIND is where that matters.** Its pool is 1, so the heal is 0 and a
run there is a single-mistake run. Rounding up would restore a pool of 1 in full and turn the mode
into ten unrelated boards on that ladder — at a pool of one, the harsher rule is the only one that
means anything. The board-select card says so in words rather than leaving the player to infer it
from a heal that never arrives.

**Boards past 10 live in `extended`, NEVER in `boards`.** Folding the continuation into `boards`
would silently change three things that all read its length: a Full Run would become thirty boards,
clearing a type would need board 34, and the grid would render a wall of tiles. `boards` means the
tuned ladder and nothing else; `maxBoard()` and `boardRow()` are the only things that see past it.

**The continuation continues each schedule's own average step, and three rules keep it honest.**
(1) A cap is never set below where the ladder already finished — HIVE ends at 35% density and
ARCANE at 34.5%, both past the 34% battle ceiling, and clamping to it made board 11 *sparser* than
board 10, with too few creatures left to meet its own thresholds. (2) A flat dial stays flat: EASY's
lock depth is 2 by design, and letting it drift to T−1 would make board 30 of EASY a differently
named EXTREME. (3) A step that produces no new board is skipped rather than ending the
continuation — EXTREME's board grows 0.444 cells a step, so board 11 rounded to board 10 and
stop-on-repeat gave it no scaling at all despite 30 cells of width still to grow into.

**A bigger board is not always a board with more room on it.** CROSS's arms are `|x - cx| <=
param/2` wide, and `cx` is a cell centre for an odd box but falls between two for an even one — so
35 across gives nine-wide arms and 36 gives eight, and the wider board holds *fewer* cells. Fewer
cells means a smaller `C_k`, and a board whose `C_k` went backwards cannot carry the previous
board's thresholds, because the EXP to meet them is no longer on it. Such a candidate is refused
and the next schedule step tried. DIAMOND's slanted rim is the obvious next shape that could do
this. Search ladders are exempt: they have no level economy, and BLIND's own tuned ten step `C_1`
backwards at board 6 where the tier count rises.

**Duplicates must be dropped AFTER the thresholds are made monotone, not before.** Two candidates
can differ only in an alpha-scaled threshold; `monotone()` lifts the later one up to the earlier
and *that* is when they become the same board. Deduplicating first let a pair through on EASY.

**The run tile is the eleventh board card, not a panel under the grid.** It carries `board-card`
and sits in the same grid flow, so it lands immediately after board 10 at the same size and the
grid stays free to take another tile after it. The rules it used to spell out in a wide panel moved
into its tooltip, the way Sweep and the spells explain themselves; they are still said in full on
the first board-clear overlay, which is before any of them can surprise anyone.

**`window.confirm` is not dependable, and a suppressed one fails as "cancel".** An embedded
webview can suppress dialogs outright, and a browser will once the player ticks "prevent additional
dialogs"; either way `confirm()` returns FALSE instantly without showing anything, which every
caller reads as "they said no". The button does not throw — it silently stops working. Abandon
shipped that way and was dead in the desktop app's own preview. Both guarded actions (Abandon,
Reset progress) now use `App.ask()`, an in-page overlay built from the same `.overlay` the win and
loss screens use. Anything irreversible added later must go through it rather than a native dialog.
While a question is up it is modal: `onKey` answers Escape and swallows everything else, so the
board cannot be played behind it, and every screen rebuild calls `closeAsk()` — without that the
handle would point at a detached node and swallow keys for the rest of the session.

**The clock starts when the board is DEALT, not on the player's first move.** Every board hands
over an opening before anything is touched, and that opening is a first click made for you —
reading it is the first thing you actually do. Keyed off the first player action instead, the clock
stood still through exactly the work the board had just set up, so every time on the ladder was
missing however long the player spent reading the board. `startedAt` is now set the moment
`Game.create` returns, because that call is what applies the opening rule. The two ladders whose
opening reveals nothing get the same treatment, since "the clock starts when the board appears" is
one rule and "...except there" is two.

`Game.started` is what used to drive this and now has no caller. It is kept, and it is NOT dead
code waiting to be rewired: it answers a different question — whether the player has acted on this
board at all — which is a real distinction only the engine can make, and one the clock must not go
back to reading.

**A run records itself, never its boards.** A run opens only once board 10 is cleared, so every
board in it was already cleared and there is no ladder progress a run could add — and clearing
board 6 at 2 HP carried in from board 5 is not the same claim as clearing board 6 outright. The
clock is the run's, started once on board 1's opening and never restarted, which is why
`advanceRun` rebuilds the whole screen but deliberately leaves `startedAt` alone.

**The Full Run heal fraction is a first guess.** Half the pool is fair at any setting — the sim
confirms a run needs no heal at all — but fair and enjoyable are different questions and only
playtesting settles which fraction feels right. Both ends are one number away in `run.ts`: a heal of
zero is the original Ironman, a full heal makes a run ten unrelated boards with a shared clock.

**Marks are not gated the way the pencil is, and that is a decision rather than an oversight.**
`setMark` will still write an odd tier on a light CHECKERBOARD square. A mark is a claim, and the
mark guard locks a cell on it, so refusing one is refusing to let the player be wrong in a way the
board can already see — arguably a kindness, arguably the game playing itself. Left open.

**Smaller:** BLIND's unlock timing is a guess (three Full Runs); pinch-zoom is built but has
only been exercised with synthetic touch events, never on a real phone.

---

## Conventions

- Boards are pure functions of `(config, seed)` — seeded `mulberry32`, never `Math.random`.
- Every engine action returns the events it caused, so renderers animate and tests assert on the
  same thing.
- Design findings get written into `design/page.template.html`, then `python design/build.py`,
  then the artifact is republished. `reference.html` is generated — never hand-edit it.
- When a measurement can settle a design question, measure it. Most of the good decisions here
  came from simulation rather than argument, and several contradicted the intuition.
- **Nothing that pictures the original game goes in the repo.** `design/original-reference/`,
  `game_types.pdn` and `design/screenshots/` are all untracked, and the reason is not caution
  about mechanics — those are free to take, and are taken, because rules and formulas carry no
  copyright. It is that a screenshot is *expression*, which does, and it is hojamaka's. The repo
  is public and GPL-3.0 / CC BY-SA, so publishing one would also mean purporting to license it.
  Both are in `.gitignore`; a helpful "let's illustrate the README" undoes that silently.
