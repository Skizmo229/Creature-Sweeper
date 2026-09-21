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
`src/sim/opening.ts`, which drives the real engine. **`design/placement.py` is the same pattern
and has the same risk**; port it if it starts mattering.

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
where it is denser to describe. **That last claim is the unmeasured one.** DUNGEON's schedule is the
only one in the game derived by playing it, with the honest player in `sim:spells`, and re-deriving
it is what would settle whether the density should now come down.

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

**Wrapping a SHAPE does the opposite of wrapping a rectangle, and WRAPPED CROSS is the case.**
"Edges are free information, so joining them is the only variant that is harder" is a claim about a
rectangle, where the rim is a small part of a large interior. A cross is nearly all rim, so it
barely loses any — and what joining its tips actually does is far bigger: CROSS is four dead-end
corridors sharing a hub, and the wrap turns them into two loops, so a player stuck at one tip can
work in from the other. It is the DUNGEON finding again with the sign flipped: what sets the count
of forced guesses is how many separate puzzles the board is cut into. Measured with the honest
player from `sim:spells`, 25 seeds a board, at CROSS's own schedule: 0.0–2.3 forced guesses a board
against CROSS's 0.3–2.4, and 92% of board 10 cleared against 80%. It ships at CROSS's schedule
shifted up 1.2 density points (24.7–31.9%), which puts it back on CROSS's curve at 0.1–2.7 and 84%.
Anything else combining a shape with a topology should be measured rather than reasoned about.

**It is gated on its two parents, not on a board count, and that is the cheaper of the two.**
`requires_boards` spends the one budget in the unlock data that can silently strand a save — the 70
boards the type-gated ladders offer, of which BLIND's 65 already takes the top. A combined type has
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

**Connectivity must be asserted, not assumed.** The auto-opening reveals *one* region, so a board
that fragments leaves everything else unreachable. A ragged-cave generator produced stray islands
in 13 of 40 boards before this was caught.

---

## Current state

19 game types × 10 tuned boards, plus a scaling continuation to board 13–40 depending on type
(517 boards in all). 270 tests. Playable prototype with canvas board, HUD, marks,
pencil marks, two Sweep modes, magic, Full Run, the full unlock chain, a rules card, an
always-present mute toggle, and a settings menu with eight presentation options and seven
gameplay dials. Sweep defaults to CHARGED, ten hand-opened cells a sweep.

```
main line   EASY -> NORMAL -> { HUGE, EXTREME } -> HUGE x EXTREME (needs both)
magic       NORMAL -> ARCANE -> ORACLE
variants    gated on BOARDS CLEARED ANYWHERE, not on each other:
            CHECKERBOARD 20 · HIVE 25 · WRAPAROUND 30 · DIAMOND 35 · DONUT 40
            CROSS 45 · RAGGED CAVE 50 · DUNGEON 55 · SUDOKU 60 · BLIND 65
            the five cut-out shapes carry ARCANE's loadout (Reveal, Census, 75 mana),
            and DUNGEON carries Exercise on top of it
combined    WRAPPED CROSS needs CROSS and WRAPAROUND; it carries ARCANE's loadout too
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
having. Fonts, sound packs and clear effects had no per-type answer before this, so `TYPE_IDENTITY`
in `theme.ts` supplies one per ladder with a fallback, kept beside `THEMES` rather than inside it:
`TypeTheme` is what the renderer needs to draw a board at all, and these are defaults the player is
expected to override.

**The font is a player setting, so no glyph in the UI can be assumed.** The in-game settings button
shipped as a gear (U+2699) and rendered as tofu the moment the board was put in anything but the
mono default. It is spelled out now. Anything added to the chrome has to survive all five stacks.
**The mute speaker is the same rule answered the other way**: it is inline SVG, not a character,
because a path has no font dependency and is the same picture under all five. A word would have
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

**The zoom ceiling caps magnification only.** A small board is held at the player's limit instead
of being blown up to fill the stage — which is what the old `MAX_CELL = 48` constant already did
— but a board too big for the stage still shrinks past it down to `MIN_CELL`, so the setting can
never leave a board unreachable.

**Palette and icon are separate settings on purpose.** Borrowing ARCANE's teal should not also
borrow its hexes; they were never one decision. The menus keep the ladder's own accent whatever the
board is painted, so the game stays navigable however far the board is repainted.

---

## Open decisions and unfinished work

Ordered by how much they matter.

**The ladders have never been played.** Every density, lock depth and HP value is derived and
simulation-checked but not playtested. This is the biggest open risk and the reason Milestone 2
(headless measurement across many seeds, then retuning `ladders.py`) exists.

**No solver, so boards still contain unresolvable 50/50s.** Some deaths are unfair rather than
earned. Solvable generation is the highest-value QOL fix and is harder here than in Minesweeper:
the constraint is "these *n* cells' tiers sum to *N*, each in 0…T" — a bounded integer composition
problem, not a count. Start with generate-and-test and measure the rejection rate.

Archipelago was dropped by request.

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

**ORACLE boards 7-10 are not clearable by a deductive player** — 0-4% across 25 seeds, against 92%
on board 1. That is 6 HP and a flat 6-tier curve against 7-11 forced guesses, and it is the
clearest evidence yet for the missing solver: those boards are decided by 50/50s, not by play.
Worth settling before the ladders are playtested, since a human will read it as unfairness.

**"Share of the pool spent" is the wrong measure of scarcity, and it took two sessions to notice.**
It said 1-11% on the dense ladders and 29-34% on DUNGEON, which read as "prices bite on DUNGEON
only" — and the conclusion drawn from it, that the way to make prices matter elsewhere was a sparser
board, was wrong. Spend share is as much a fact about how often a player *wants* to cast as about
what casting costs. The measure that actually answers the question is what it would cost to buy your
way out of EVERY moment a deductive player is cornered, as a share of the whole pool: at the old
prices that was 1-32%, so even a player buying everything finished with two-thirds of the board's
mana unspent, on DUNGEON as much as anywhere. Nothing was scarce; DUNGEON was just the least
un-scarce. See the pricing note above for what that changed.

**The shaped ladders have magic but were tuned without it.** DONUT, CROSS, DIAMOND and RAGGED CAVE
carry ARCANE's loadout, and their densities are still the ones derived for a spell-less board.
ARCANE runs 1.4–2.2 density points above NORMAL precisely because magic lets you buy answers, so
the same argument says these four are now easier than they were measured to be. The mana economy
itself needed no changes — measured at 23–25% exploration share on their first boards against
ARCANE's 26%, and 13+ full kits on the poorest — so this is a density question only. Nothing is
broken either way; the sim still clears every board at full HP. DUNGEON is the exception and the
template for fixing the other four: its schedule was derived by playing it with the honest player
from `sim:spells` and moving the density until the curve matched ARCANE's retuned one.

**Anything classifying ladders by "has spells" now needs shape checked first.** The reference
page's unlock graph did exactly that and would have emptied the shape row into the magic row.

**There are two kinds of unlock gate, and only one of them fails loudly.** `requires` is a list of
types whose board 10 must be cleared — readiness, and a bad one is a cycle, which is obvious.
`requires_boards` is a count of boards cleared anywhere — time served, and a bad one is just a
number. Nothing about the number says whether a player can reach it *without* the type it guards,
so setting BLIND above what the type-gated ladders offer would leave a save simply stuck, with
nothing to point at. The type-gated ladders (EASY, NORMAL, HUGE, EXTREME, HUGE x EXTREME, ARCANE,
ORACLE) offer 70 tuned boards; BLIND at 65 is the top of the schedule. DUNGEON took a slot in the
middle of it rather than the end — it belongs with the other shaped boards, and the five-board
cadence is what makes the sequence legible — so SUDOKU and BLIND each moved up one step. `test/unlocks.test.ts` walks
the graph from an empty save and fails if anything is stranded, and separately asserts every
threshold fits inside those 70 *without* counting a scaling board — a player who never goes past
board 10 must still reach everything.

**The variant ladders do not teach each other, so they are not chained.** A hex grid teaches
nothing about a torus and neither teaches Sudoku; chaining them made a player who wanted the ragged
cave grind three shapes they had no interest in first. Counting boards lets them arrive from any
direction. The menu order follows the thresholds so it reads in the order a player meets it.

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

**CHECKERBOARD's pencil palette still offers the impossible tiers.** On a light square the odd
tiers are not candidates and never will be, so the pencil is offering a hypothesis the board has
already refused — the same error the tier-0 pencil made on SUDOKU, in a milder form. It is only
ever a wasted click rather than a wrong one, which is why it is here and not above, but the fix is
the same shape: gate the palette on the hovered cell's colour.

**Smaller:** BLIND's unlock timing is a guess (currently post-game); no pinch-zoom on touch, so
the largest boards are pan-only on mobile; `design/placement.py` is still a Python reimplementation
and knows nothing about the checkerboard;
the reference page has no identity row for SUDOKU, so its asset sheet and voice table show a
placeholder (that used to be a crash that killed both tables — `ident()` in `page.template.html`).

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
