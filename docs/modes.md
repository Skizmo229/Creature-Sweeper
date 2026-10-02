# The modes: each rule, what it proves, and what it must never do

One section per ladder that has a rule of its own. Each says what the rule is, what the engine
deduces from it (the Sweep proof), what the pencil refuses under it, what would silently break it,
and how it was tuned. Measurements are summarised; `docs/tuning.md` and the design reference have
the full numbers.

The plain ladders (EASY, NORMAL, HUGE, EXTREME, HUGE x EXTREME) differ only in schedule, and EASY
has no Sweep, since it is where the sum rule is learned. The magic ladders (ARCANE, ORACLE) add
spells. BLIND and HUGE x BLIND are search boards, and SEER is a search board with spells. The rest
follow.

## Topology and shape

**WRAPAROUND** joins both pairs of edges (`wrap: 'both'`, a torus) and is the only variant that
is harder than a rectangle, because edges are free information. (`'horizontal'`, a cylinder, is
the gentler version no ladder currently uses.) Measured, it is nonetheless the
gentlest counted ladder at NORMAL's schedule (cornered 0.0 to 0.6 times a board). A wrapped axis
must be at least 3 cells, or a cell is its own neighbour; and a hex grid wraps top to bottom only
on an even height, since its rows alternate their offset and an odd one leaves two unindented
rows either side of the seam, whose diagonals miss each other. The seam is drawn dashed, per
present cell.

**HIVE** is a hex grid: six neighbours, so every number is lower and blank regions are commoner,
and it runs denser (35%) to compensate.

**ULTRA HIVE** is HIVE on a regular hexagon of hex cells, `R` cells a side in a box `2R + 1`
square (the continuation keeps the side odd, since an even one adds an empty row and not a cell).
The shape refuses square cells and wrapping. Its six straight edges barely move it: at HIVE's own
schedule it was stuck 10.7 times over the ladder and cleared 92% against HIVE's 12.2 and 93%, and
it ships half a density point above HIVE, on HIVE's curve (12.5 and 91%; 150 seeds, 25 September
2026), topping out at 35.5%. Like HIVE it has no spells.

**DONUT, CROSS, DIAMOND** are per-cell masks. Parameters are in cells, never in fractions of the
board: a ring "20% of the width" thick is nine cells on a long side and four on a short one, the
same board playing two different games. Once parameterised in cells, aspect ratio stops affecting
difficulty at all. A bigger box is not always a bigger board: CROSS's arms are `|x - cx| <=
param / 2`, and `cx` falls between two cells on an even width, so 36 across holds fewer cells than
35; the continuation refuses a candidate whose `C_k` went backwards.

**DONUT** is round: the circle's disc in a square box, less a hole `param` cells narrower in
radius, so the ring is six cells thick all the way round. Its staircase rims give more away than
the square ring's straight ones did, and a thicker ring is easier, not harder, so it runs six
points denser to play the same, to 36.2% (decision 0045). Seven cells cleared 98% of board 10
even at 37%.

**WRAPPED CROSS** is CROSS on a torus. Wrapping a *shape* does the opposite of wrapping a
rectangle: a cross is nearly all rim, so it loses little information, and joining its four dead-end
arms into two loops lets a player stuck at one tip work in from the other. It is easier than CROSS
and ships 1.2 density points above it to sit on CROSS's curve. Counted like the other shapes, not
gated on its two parents (decision 0036). It is DUNGEON's walls pointed the other way: what sets the
forced-guess count is how many separate puzzles the board is cut into. Measured with the honest
player from `sim:spells` by 20 September 2026, 25 seeds a board, at CROSS's own schedule it was
cornered 0.0 to 2.3 times a board against CROSS's 0.3 to 2.4, and cleared 92% of board 10 against
80%; 1.2 points up gave 0.1 to 2.7 and 84%, topping out at 31.9%. When CROSS moved 2.5 points up
for its spells it moved too (decision 0020), and re-measured at 60 seeds (21 September 2026) it was
still on CROSS's curve, 21.7 stuck points over the ladder against 21.8, clearing 84% against 89%.
The price is the opening boards, 1.3 to 1.9 stuck against CROSS's 0.9 to 1.2: joined tips cost the
most where the board is small. It tops out at 34.4%, past 34 by as much as ARCANE's 34.5.

**RAGGED CAVE** is grown, never trimmed. Cells are laid down as whole 2x2 squares and none is ever
removed, so no passage one cell wide can exist; corner-to-corner touches are refused at placement.
Caverns are punched before growing, each kept only if the cave still fits round it, so growth
cannot fail for want of space. The rim is a superellipse (power 2.6) with wobble harmonics, which
lifted the usable share of the box from 26% to 40%. Its cell count is a promise: the count is
chosen per board in the ladder's `cells` schedule and the generator spends exactly that many, and
the test `leaves exactly the cell count the ladder was tuned against` is the alarm.

**PYRAMID** is a stepped pyramid, a per-cell mask: a two-cell cap and every row a cell wider on
each side, in a box exactly twice as wide as it is tall, so `h` rows hold `h(h + 1)` cells (the
continuation takes the width from the height to keep it so). Its opening is its own, `'base'`: the
bottom two rows are dealt as Reveal deals a cell, empty ground opened and cascading as a click
would, each creature written as a given and left alive to be fought when your level allows.
Nothing is killed and nothing pays exploration mana, so the four facts stand untouched.

The base makes the board nearly guess-free, and that was measured, not expected. At the stepped
edge a base cell touches a single covered cell above it, so its number reads that cell exactly;
the next cell along then has one unknown left, and so on, so each row unzips the one above. At
ARCANE's schedule the honest player was stuck 0.2 times over the whole ladder against ARCANE's
23.9, and cleared every board (60 seeds, 25 September 2026); eight density points more gave 4.0
stuck and 100% cleared, fifteen more (41.5 to 49.5%) 14.6 and 99%. No density a board survives
puts it on ARCANE's curve, so it ships at ARCANE's schedule as a ladder decided by deduction, the
way SUDOKU is (decision 0038).

It is climbed by PETRI DISH's crawl rule, a single step that marks extend (decision 0086): you
may open only a cell touching ground you have uncovered. The rule is the theme and moves no
measure, and that was measured too: every cell the base proves already touches open ground, so
the graded player's figures were identical with and without it, at one step and at two (40 seeds,
30 September 2026). What would make the climb bite is less of the base: dealing only the middle
fifth of the bottom row face up put the board on ARCANE's curve (16.9 stuck over the ladder for
the honest player against ARCANE's 22.3), with or without the crawl rule.

**GEAR** is a gear, a per-cell mask in a square box: eight square teeth, one pointing straight up,
about as wide as they are deep, round a hole three tenths of the radius across. The teeth point
straight out, so the diagonal four step on a square grid, chosen over upright blocks.
Its proportions are shares of the box because the box is always square, so the outline plays the
same on every board. It came out harder than ARCANE at ARCANE's schedule, as DONUT did, and ships a
point and a half below it, on ARCANE's curve (24.1 stuck over the ladder and 82% cleared against
23.9 and 82%; 60 seeds, 26 September 2026). It is the first ladder with a box of its own past the
global 64x32: 45 square, inside the same 2,048 cells.

**CARD** is a playing card, a per-cell mask in a box kept at a card's 5:7: rounded corners, and
four suit-shaped holes where a Four's pips sit, spade and heart above, diamond and club below and
upside down. The suits are drawn cell by cell, 11 wide and 10 to 12 tall, the same size on every
board (`SUIT_ART`, with its copy in `ladders.py`): drawn as curves at this size they read as
blobs. It started at 48x68 and was made smaller, 30x42 growing a sixth each way to 35x49 (984 to
1,439 cells), twice an ordinary board; the tall box would be clipped by the continuation's global
64x32, so the continuation keeps board 10's card. It sits on ARCANE's forced-guess curve per
board, which on a board this size means sparser per cell: at ARCANE's schedule it was stuck 51.3
times over the ladder and cleared 62% (60 seeds). Ramps shifted down stayed flatter than ARCANE's,
too many guesses early and too few late, so it ships on a ramp from 4.2 density points below
ARCANE's to 3.7 (23.1 stuck and 85% against 23.9 and 82%, and board 10 4.9 stuck against 5.1; 120
seeds, 26 September 2026).

**VALENTINES** is a heart, a per-cell mask filling a square box: the classic heart curve, the
same the card's heart suit is cut with, stretched to the box's exact extents. At ARCANE's
schedule it came out gentler than ARCANE (17.4 stuck over the ladder, 85% cleared), and ships a
density point above it, on ARCANE's curve (23.3 and 80% against 23.9 and 82%; 60 seeds, 25
September 2026), topping out at 35.5%.

**STAR** is a regular five-pointed star, point up, as large as its box allows; each point narrows
to a single cell. The star fills only a third of its box, so its boxes are large for the cells
they hold, and board 10's is already past the global ceiling, so the continuation keeps it. Its
ten corners are written out as numbers, not computed, so the two copies of the predicate agree
exactly. At ARCANE's schedule it came out harder than ARCANE (32.5 stuck over the ladder, 76%
cleared), and ships two density points below it, on ARCANE's curve (24.6 and 84% against 23.9
and 82%; 60 seeds, 25 September 2026).

## DUNGEON

Three kinds of cell, and the difference is the whole mode: a **room** is where creatures live; a
**hallway** is one cell wide and always empty; a **door** is the room cell a hallway arrives at,
also empty, and it carries a **pocket**: the room cells orthogonally beside a door that are
themselves against a wall are empty too. So a corridor is somewhere you can always walk, and
stepping off one into a room is the moment you are exposed. `dungeonMap` returns the
classification, because it cannot be recovered from the finished grid.

Rooms are sized from the cell budget with `ROOM_COUNT` pinned at seven, so board 10 is a bigger
version of board 1 rather than a different game. Hallways are kept one wide by costing both elbows
of an L and by `thinHalls`, which takes cells back one at a time while the map stays connected;
corner pinches are refused after the fact. `MIN_SPAWN_SHARE` (0.55) bounds how much of the board
is room floor, because creatures are dealt into room floor alone and the rooms play denser than
the nominal density; the invariant test bounds the density a room actually plays at.

**The crawl rule**: `reach: 2`. You may open a cell, or target a spell, only within two steps of
open ground, counted as a walk through `neighbours()` (so it stops at a wall and needs no special
case for hex or a seam) and measured outward from the candidate. Marking and pencilling are
exempt. Its stated exception keeps the zero-damage guarantee: `sealedIn()` lifts the radius when
nothing within reach can be opened at your level (five boards in 2,280 needed it; with it, none in
5,700). Everything that drives the game headlessly has to know the rule: the tier-order player
walks, and the honest player is limited in what it may open and gamble on.

A wall stops information dead, so every room is its own puzzle and the number of forced guesses is
set by how many rooms there are. The empty scaffold of hallways and doorways then makes each guess
cheap. The schedule (13 to 26.5%) is the only one derived from a play measurement rather than
inherited, and it has been re-derived every time the mode changed. `ROOM_COUNT` moves the guesses
and barely the danger; HP is the lever for deadliness.

Reveal pushes the frontier here, because opened cells are what reach is measured from, which is
why DUNGEON carries Exercise too: a forced guess there is a guess on what is in front of you.

## PETRI DISH

A round dish, a disc of square cells, that opens with its three largest blank areas (`'islands'`)
and carries the crawl rule at a single step: you may open only a cell touching ground you have
uncovered, so each colony grows from its edge. A reach of one on its own is refused, because the
board would advance a ring at a time and no deduction could be acted on until the cascade happened
to arrive beside it; it is accepted here paired with **marks that extend it** (`reach_marks`). A
covered cell you have marked counts as uncovered ground while it is itself within reach of ground
really uncovered, so naming a creature on the frontier lets you reach past it, and marks cannot be
chained across the dish. Nothing checks the mark is right, because the answer would tell you
whether it was. The sealed-in exception is DUNGEON's, and it reads open ground only, never marks,
or marking a cell and watching the rule lift would say what lay beyond it (decision 0039).

Measured, both rules make the dish gentler, not harder. At HIVE's schedule the plain circle was
stuck 22.3 times over the ladder; three islands took that to 6.5, the one-step reach to 14.6, and
both to 4.6 with 99.8% cleared (60 seeds, 25 September 2026). A guess on this board is always a
frontier cell beside numbers, so it is cheap. It ships two density points above HIVE's schedule,
on HIVE's forced-guess curve (11.5 stuck against 12.2, 150 seeds), topping out at 37%, and still
clears 99.9%: HP, not density, is the lever if it should be deadlier. No spells.

## PATROL

The creatures walk. A tier-t creature walks the edge of a square t cells a side, one cell per
action, clockwise from the square's top-left corner, where every creature starts: t cells right, t
down, t left, t up, home after 4t moves. Every open (a cascade and a fight count once) and every
**Wait** (`W`, a second on the clock) is a move; a mark or a note is not. There is no Sweep:
keeping up with numbers that change every move is the ladder, and a button that reads them would
play it for you (decision 0063). The routes never share a cell, so two creatures never meet and a
beaten creature lies where nobody else walks, still counted in the numbers as it is everywhere.
The numbers are the sums round each cell as the board stands this move, worked out again after
every step (`src/engine/patrol.ts`).

A creature that walks onto ground you have uncovered covers the cell again while it stands there
(`occupied`), drawn as a **?**: every rule and proof reads it as unknown, and clicking it fights
it. When it walks on, the cell is uncovered ground again, with anything written on it rubbed out.
A **mark is a route**: a mark of tier t draws a tier-t creature's whole route with the marked
cell as its top-left corner, on every covered cell of it, so the mark guard covers everywhere that
creature can step; the same mark again takes it off, and where routes cross a cell shows the
higher. A route is not a claim about where a creature stands, so nothing that proves a cell safe
reads marks here (`Game.marksAreClaims`). Notes are ordinary.

The price is density. Every creature holds its route for good, four cells a tier, and NORMAL's tier
mix averages about nine route cells a creature, so NORMAL's 21 to 27% would need more route than
the board has cells. Routes that never cross were chosen over that density, and the deal packs
at most 8.5% reliably: PATROL runs NORMAL's boards, tiers, HP and gates on a ramp from 6.5 to
8.5%. At that density the opening uncovers most of the board (409 of 480 cells on board 1, 586 of
800 on board 10), so most creatures walk in plain sight as a ?, and the honest player, taught to
read the board afresh after every move and to wait out a stuck point, was never stuck and cleared
every board (60 seeds, 25 September 2026; NORMAL: 2.0 stuck over the ladder, 99% cleared). The
difficulty is keeping up with a board that changes every move, which no instrument here measures
(decision 0040).

## CHECKERBOARD

Light squares hold even tiers, dark squares odd, and empty ground goes anywhere (pinning tier 0 to
one colour would make every square of the other provably occupied). Because a number is a sum, the
light cells behind it total an even number, so **the parity of a number belongs entirely to its
dark neighbours**. `hiddenCap` in `checker.ts` is that argument as the one number Sweep needs (the
most tier one covered cell can hide), decided per neighbour rather than per ring, and a number with
one covered dark neighbour and an even hidden sum proves that square empty at any level. It roughly
doubles what Sweep offers and cannot run away.

The balance the mode promises lives in the quantities: `ladders.py` apportions each parity its own
half of the budget, `config.ts` refuses halves that differ by more than one, the ladder is six
tiers (three odd, three even), and the board must have an even number of cells. The pencil refuses
the wrong parity for a square (`noteCandidates`); marks do not, by decision.

Tuned to HIVE's forced-guess curve at 27.5 to 38.5%, the one dial that had to be measured rather
than inherited (the honest player from `sim:spells`, by 20 September 2026). The colour rule is a
large, constant, free read: at NORMAL's schedule of the time (25.0 to 33.0%) the player was cornered
0.0 times on board 1 and 0.6 on board 10 and cleared every board, a ladder with nothing in it.
Walked up until the curve matched HIVE's, the other ladder that packs an easier board, it gives 0.3
forced guesses rising to 2.9, against HIVE's 0.3 to 2.8 and CROSS's 0.3 to 2.4. It runs past the
34% ceiling because that was measured on boards where a covered cell could be any tier; here its
colour has already ruled out half of them, so the same density carries about half the ambiguity
(HIVE at 35% and ARCANE at 34.5% sit past it for smaller versions of the same reason). Its clear
rate falls much more slowly than its guess count rises, 92% of board 10 against HIVE's 80%: a guess
whose parity you know is a cheap guess, DUNGEON's doorway finding from another direction.

## PAIRS and DOMINOES

Every creature has exactly one creature neighbour, which forces the occupied cells into dominoes
that may not touch. A creature's number **is** its partner's tier. `ringIsFree` in `pairs.ts` is
both Sweep proofs in one: if the partner is within your level, or already open, every other
covered neighbour is empty ground. Neither can run away, because a freed ring holds one partner and
blank ground. `pairCandidates` gives the pencil empty ground beside a pair that has met, and nothing
beside a lone creature, whose number the board hides (decision 0061). DOMINOES takes every one of
those hooks from the pairing rule by reference (decision 0029); a domino board that read any of them
differently would lose the deduction silently.

The rule spreads creatures evenly, so openings are the smallest in the game and the ladder's axis
is *size*, not density: non-touching dominoes jam at about 25%, and the quota must land exactly, so
`choosePairs` throws rather than returning a short board. HP and lock barely move it.

PAIRS was tuned with the honest player from `sim:spells` by 20 September 2026, and its density is
bounded at both ends. The ceiling is structural: dominoes that may not touch cannot exceed two cells
in six (33.3%), a random lay-down jams far below that (24.8 to 25.6% over 200 seeds across the
ladder's sizes), and C_k assumes the quota lands exactly, so the schedule stops where placement is
reliable: at 26% it places on every seed within 40 restarts, at 28% on one seed in four. The floor
went the opposite way to the guess. The exclusion ring round each pair spreads the creatures evenly,
and clustering is what makes a zero region, so the opening is 30 to 65% smaller than a uniform
board's at the same density (6.9% of the board against 10.0% at 20.6%), and the cells hiding
nothing drop from 18.8% to 10.7%. Inside the four points left, density does almost nothing: 20% to
25% on a fixed board moved the forced guesses from 0.0 to 1.5 and left the first six boards at 0.0,
the failure ARCANE had before it was retuned, while growing the board across the same span gives
0.2 rising to 2.1, the curve wanted; deduction here is local, so a bigger board is more places to
be cornered. Density is still scheduled, since every point helps, but it does not carry the
ladder. HP is not a dial either: the characteristic gamble is "one of these k cells holds a
tier T", with T read off a beaten creature's number, so a wrong guess is one known, lethal blow,
and the ladder at HP 12 and at 14 clears the same share of every board as at 10.

**DOMINOES** deals the pairs as a full double-six set, every pairing {a, b} once, so the
distribution is flat by construction, six tiers always, and the tile order from `choosePairs` must
survive the deal. No blanks: a [0|x] tile breaks the one-neighbour rule. Density is nearly the
whole dial (18.5 to 23.5%), and it gets harder by getting *smaller* between set counts. A beaten
creature's number is not drawn on these two ladders (decision 0012), though the engine and the
proofs still read it.

## SPRINKLE DONUT

DONUT's ring with every creature's place shown. The creatures stand in pairs, each beside its
partner, and each pair is drawn as one sprinkle lying across its two cells, in the palette's `hot`,
so the player knows where every creature is and has only its tier to find. Unlike PAIRS's, the
pairs may touch, and like PAIRS's they are tier-blind: a pair says nothing about the tiers in it.
The sprinkle is the pairing's whole job, the look and the way two touching pairs are told apart
(`src/engine/placement/sprinkles.ts`, decision 0046). Partners may be diagonal, as on PAIRS, so a
sprinkle lies at any of four angles. It carries PETRI DISH's growth rule, a reach of one that a
mark beside uncovered ground extends (decision 0039), from DONUT's single opening, so the player
eats round the ring from one place. At these densities that opening is small, a blank cell and its
ring, on the rim on a third of boards, and on 1 to 3% no blank at all and the safest single cell;
the sprinkles make any of them a foothold, since every neighbour is shown. No spells: Census would
count what the board already shows.

Showing the places makes every number a Census: the hidden sum and how many creatures share it.
`shownCap` is that as Sweep's per-cell bound, the biggest of k creatures under a hidden sum s being
at most s - (k - 1), and `emptied` is the plain ground, which Sweep opens a ring at a time, so one
press opens every empty cell the frontier can reach. The pencil offers empty ground on a plain
cell and anything else on a sprinkle. A beaten creature's number is an ordinary sum here, so
hovering shows it. What breaks it: a sprinkle drawn where no creature stands, or a creature left
without one, would make every proof lie; the fault finder holds every creature to a partner beside
it, paired back, and `test/sprinkles.test.ts` holds the cap and `emptied` to never calling a
creature free, however far a board is played. The graded player reads the places at a glance
(grade 0, the sprinkles) and counts them under every number (grade 1, the Census bound).

The rule gives away so much that density is the whole dial, and it has a cliff. At DONUT's
schedule (29 to 36.2%) a grade-2 player cleared 98 to 100% of every board; at a flat 55% it
cleared 98% of board 1 and 88% of board 10, at 65% 45% and 15%, and at 75% nothing (40 seeds a
board, 26 September 2026). It ships at 56.4 to 59.1%, where a grade-2 player clears 93% of
board 1 falling to 68% of board 10 (60 seeds), the placement ladders' human target, stepping two
creatures a board within each box because a smooth ramp this shallow would repeat a board once the
quota rounds to an even number. The honest player, which never bounds a sum by its count, finds
it harder (90% of board 1 falling to 40% of board 10), as it finds the round DONUT. The pairs lay
down at any density up to 90%, so the packing never binds.

## PACKS and CONGA LINE

Creatures stand in connected packs of one of every tier, and no two packs touch (touching is
`neighbours()`, so a diagonal counts). `missingFrom` is the Sweep proof: the strongest tier a
pack has not shown yet; when that is within your level, or nothing is missing, the ring is free.
Computed over the component of *open* creatures, which errs safe. `packCandidates` gives the pencil
the tiers the neighbouring pack has not shown. CONGA LINE takes all of it by reference. Density is
the dial (22.5 to 31.6%), and the board grows a row or column every step for granularity.

PACKS was tuned with the honest player from `sim:spells`, taught the pack rule, by 20 September
2026: at 120 seeds a board, 0.2 forced guesses rising to 5.2, and 99% cleared falling to 70%,
DOMINOES's 70% at the top, the other ladder reached by clearing PAIRS. A pack of six on a 480-cell
board is 1.25 density points, so a schedule held on one size rounded neighbouring boards to the
same board; a column or a row a step gives every board its own pack count. The first guess was
NORMAL plus a little (26 to 34%), since packs leave so much ground open, and it cleared 35% of
board 10 at 7.2 forced guesses: on a flat curve a tier 6 is as common as a tier 1, so an open board
is still an expensive one to guess on. The guess count runs well ahead of the clear rate, 5.2
against DOMINOES's 2.2 at the same 70%, the signature of CHECKERBOARD and DUNGEON: a guess beside a
pack is capped by the tiers it has not shown, so it is cheaper. More guesses, each worth less.

**CONGA LINE** strings each pack into an orthogonal line led by the tier 6, with no member
orthogonally beside any but its neighbours in the line; at six, "no 2x2" and "a true line" are the
same rule. So two open creatures side by side are consecutive, which is why the board ties them
(`drawBonds`). `beyondReach` is the proof that does something: a line only continues from its
ends. The three leader-shape proofs are sound but gave the honest player nothing new in 386 stuck
points. Square and unwrapped only. Every proof claims EMPTY, so the test that matters is `never
calls a creature empty, whatever is open`. Ships at PACKS's schedule, capped at 33.5% by its
packing ceiling.

## WORKOUT

NORMAL's boards with deeper gates and Exercise alone, priced by `WorkoutRule`: 30 mana, 10 dearer
every cast, 10 cheaper per level gained, never below 30, and a kill on a borrowed level pays
double EXP. Anything pricing a spell must ask `Game.spellCost`, not `SPELLS[id].cost`. Double EXP
only ever adds, so the four facts hold; `config.ts` refuses a multiplier below 1. Measured, it
barely moves difficulty; the lever if it should cast more is `relief`.

Tuned with the honest player from `sim:spells`, 40 seeds a board (21 September 2026). At NORMAL's
own density the deeper lock barely registered on boards 1 to 5, and the player cast Exercise once
or twice a board, spending a tenth of its mana. Two points denser, with the full lock from board 4,
gives 0.1 forced guesses rising to 5.7 spell-less, and clears 100% falling to 85% casting Exercise
at each forced guess, a mean of 96.6% over the ten against NORMAL's 98.8% (spell-less, the same
player). The double EXP moved very little: a player who also farms it, taking every named creature
at or one past its level on a charge whenever the price is back at 30, casts about five times a
board rather than two and clears the same share, because the cheap casts are rationed by level-ups
and a five-tier board has four. The spell earns its clear rate by making forced guesses
survivable, as on ORACLE and DUNGEON; the EXP is what makes casting it feel good.

## SUDOKU

9x9, tiers 0 to 8 as the nine digits, so every row, column and box holds exactly one empty cell
and those nine are the opening (`'empties'`). Digits 1 to 9 cannot work: at 100% density every
pre-revealed cell is a pre-killed one and thirty of them hand the player level 8. Quantities are
fixed at nine of each, so `C_k` is identical on every board and the whole ladder is the givens
count (26 down to 15, lock 3 to 7). Every board is generated guess-free against the propagator in
`sudoku.ts`, because a tier 8 at LV1 costs 56 HP against 14 to 20: a 50/50 here is not hard, it is
broken. Sweep is a harvester of givens (strict) and marks (assisted), because the neighbour-sum
proof finds nothing at this density; the Sudoku rule itself is deliberately absent from
`safeCells`, or Sweep solves the board in one click. Givens are unerasable. The pencil refuses tier
0. The board draws a wash on alternate boxes and a heavy rule on box edges.

## BLIND and HUGE x BLIND

Search boards: one HP, level 0, won by uncovering every empty cell, the creatures untouched until
the win uncovers them. BLIND climbs 5 to 7 tiers over its ladder. It opens at 70 boards cleared, one
step after every other counted ladder (decision 0036), and its Full Run heal rounds down to nothing,
so a run there is a single-mistake run.

## SEER

BLIND's boards with Reveal, Census and Beacon (`search: true` and a `spells` list together), on
the Magic column at 35 boards cleared, so a player meets the one-mistake game with a net before
BLIND takes it away. Nothing is ever killed, so exploration is the whole income: the starting 75
plus about 100 mana on board 1 rising to 185 on board 10, which the affordability test in
`test/spells.test.ts` counts honestly (kills pay nothing on a search board). Reveal on a creature
writes a given, which the search counters subtract as a flag; Beacon and Reveal's ring both go
through `checkSearchWin`, so a cast can finish the board. Exercise is left out on purpose: a level
lent at level 0 would make a tier 1 a free kill on a board whose creatures are never fought, and
that is the one way magic could break a search board.

Runs denser than BLIND (19.4 to 21.4% against 16.5 to 19.7%) to sit on BLIND's target with the
spells spent: a grade-4 graded player spending mana clears 80% of board 1 falling to 30% of board
10 (40 seeds, 27 September 2026), where BLIND's own density with spells cleared 98% falling to 80%.
The climb is flatter than BLIND's because the mana grows with the board. Every guess is lethal, as
on BLIND, so the whole value of the spells is the guesses they replace (decision 0054).

## AUGUR

ARCANE's boards and schedule with Census and Augur, the two spells that only answer questions:
neither opens a cell nor names one, so every guess stays the player's. Augur is Echo from the
design reference, built under a name whose letter is free (decision 0006): the tier of every
creature among a cell's covered neighbours, strongest first (decisions 0062 and 0087), drawn as a
cream column down the cell's right-hand edge, the mirror of Census's corner. It is read off the ring
as it stands (`augurNow`): the answer as cast less each creature opened since, which the board
already shows, so a creature killed leaves the list. Sweep reads the first as a proof
(`provenByAugur`: at or below your level the ring is free); the graded player's `augur-cap` trick
also leaves each cell only the listed tiers, rules out empty ground where the list fills the ring,
and places a tier where only as many cells can hold it as the list names; the readers take the
count from it as they take Census's, and the honest player caps its guesses with the first. What
would silently break it: an answer that counted open neighbours, which would list creatures already
on show and make the count wrong, or one stored as cast and never read afresh, which would keep a
beaten creature in it.

Measured with a scratch tool at the graded player's stuck points on AUGUR (60 seeds a board, 30
September 2026): one cast of the list over the best number in hindsight freed a cell at 93% of them,
and over the number where it was likeliest to free one, at 25%, against 20% for the strongest alone
and 17% for the count. It costs 50, Census and the old Augur together (decision 0087). The old
figure, 1 cast in 67 freeing a ring (decision 0055), measured a player that cast only where a whole
ring could come free, not the answer.

The ladder is ARCANE's boards and density with a lock deeper (3, then 4 from board 4) and
EXTREME's HP, 10 falling to 8 (decision 0088). At ARCANE's lock and HP the graded player was stuck
0.6 times a board and cleared everything, so an answer had nothing to settle. Here a grade-4 player
spending mana on the new aim (`src/sim/aim.ts`) clears every early board, 88% of board 9 and 61% of
board 10, the hard ladders' target; without spells 80% and 57%, with a guess more on each top
board (80 seeds, 30 September 2026). Density stays at ARCANE's ceiling, where it was measured to
move nothing (decision 0056); lock 5 measured the same as lock 4 on five tiers, and HP 7 the same
as 8.
