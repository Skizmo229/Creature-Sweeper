# The modes: each rule, what it proves, and what it must never do

One section per ladder that has a rule of its own. Each says what the rule is, what the engine
deduces from it (the Sweep proof), what the pencil refuses under it, what would silently break it,
and how it was tuned. Measurements are summarised; `docs/tuning.md` and the design reference have
the full numbers.

The plain ladders (EASY, NORMAL, HUGE, EXTREME, HUGE x EXTREME) differ only in schedule. The magic
ladders (ARCANE, ORACLE) add spells. BLIND and HUGE x BLIND are search boards. The rest follow.

## Topology and shape

**WRAPAROUND** joins both pairs of edges (`wrap: 'both'`, a torus) and is the only variant that
is harder than a rectangle, because edges are free information. (`'horizontal'`, a cylinder, is
the gentler version no ladder currently uses.) Measured, it is nonetheless the
gentlest counted ladder at NORMAL's schedule (cornered 0.0 to 0.6 times a board). A wrapped axis
must be at least 3 cells, or a cell is its own neighbour. The seam is drawn dashed, per present
cell.

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

**WRAPPED CROSS** is CROSS on a torus. Wrapping a *shape* does the opposite of wrapping a
rectangle: a cross is nearly all rim, so it loses little information, and joining its four dead-end
arms into two loops lets a player stuck at one tip work in from the other. It is easier than CROSS
and ships 1.2 density points above it to sit on CROSS's curve. Gated on its two parents, not on a
board count.

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

**GEAR** is a gear, a per-cell mask in a square box: eight teeth, one pointing straight up, tapering
from root to tip, round a hole a third of the radius across. Its proportions are shares of the box
because the box is always square, so the outline plays the same on every board. Like DONUT it came
out harder than ARCANE at ARCANE's schedule (30.2 stuck over the ladder, 78% cleared), and ships a
density point below it, on ARCANE's curve (23.7 and 84% against 23.9 and 82%; 60 seeds, 25
September 2026). It is the first ladder with a box of its own past the global 64x32: 45 square,
inside the same 2,048 cells.

**CARD** is a playing card, a per-cell mask in a box kept at a card's 5:7: rounded corners, and
four suit-shaped holes where a Four's pips sit, spade and heart above, diamond and club below and
upside down. It starts at 48x68, as the owner asked, four to six times the size of an ordinary
board, and is the one ladder whose tuned boards are bigger than the continuation's global
ceiling, so its continuation keeps board 10's card. It sits on ARCANE's forced-guess curve per
board, which on a board this size means sparser per cell: at ARCANE's schedule it was stuck 53.3
times over the ladder and cleared 60%, and it ships on a ramp from one density point below
ARCANE's to three (24.4 stuck and 85% against 23.9 and 82%; 60 seeds, 25 September 2026). A club
is three lobes and a core; without the core one cell was left stranded between the lobes, which
the connectivity test caught.

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
cheap. The schedule (12.8 to 26.4%) is the only one derived from a play measurement rather than
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
down, t left, t up, home after 4t moves. Every open (a cascade and a fight count once), every
Sweep and every **Wait** (`W`, free) is a move; a mark or a note is not. The routes never share a
cell, so two creatures never meet and a beaten creature lies where nobody else walks, still
counted in the numbers as it is everywhere. The numbers are the sums round each cell as the board
stands this move, worked out again after every step (`src/engine/patrol.ts`).

A creature that walks onto ground you have uncovered covers the cell again while it stands there
(`occupied`), drawn as a **?**: every rule and proof reads it as unknown, and clicking it fights
it. When it walks on, the cell is uncovered ground again, with anything written on it rubbed out.
A **mark is a route**: a mark of tier t draws a tier-t creature's whole route with the marked
cell as its top-left corner, on every covered cell of it, so the mark guard covers everywhere that
creature can step; the same mark again takes it off, and where routes cross a cell shows the
higher. Because a route is not a claim about where a creature stands, Sweep reads no marks here,
and the "Sweep + marks" button is not offered. Notes are ordinary.

The price is density. Every creature holds its route for good, four cells a tier, and NORMAL's tier
mix averages about nine route cells a creature, so NORMAL's 21 to 27% would need more route than
the board has cells. The owner chose routes that never cross over that density, and the deal packs
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

Tuned to HIVE's forced-guess curve at 27.5 to 38.5%, past the 34% ceiling because a cell's colour
has already ruled out half the tiers. Its clear rate falls much more slowly than its guess count
rises: a guess whose parity you know is a cheap guess.

## PAIRS and DOMINOES

Every creature has exactly one creature neighbour, which forces the occupied cells into dominoes
that may not touch. A creature's number **is** its partner's tier. `ringIsFree` in `pairs.ts` is
both Sweep proofs in one: if the partner is within your level, or already open, every other
covered neighbour is empty ground. Neither can run away, because a freed ring holds one partner
and blank ground. `pairCandidates` gives the pencil: empty ground or exactly the partner's tier.
DOMINOES takes every one of those hooks from the pairing rule by reference (decision 0029); a
domino board that read any of them differently would lose the deduction silently.

The rule spreads creatures evenly, so openings are the smallest in the game and the ladder's axis
is *size*, not density: non-touching dominoes jam at about 25%, and the quota must land exactly, so
`choosePairs` throws rather than returning a short board. HP and lock barely move it.

**DOMINOES** deals the pairs as a full double-six set, every pairing {a, b} once, so the
distribution is flat by construction, six tiers always, and the tile order from `choosePairs` must
survive the deal. No blanks: a [0|x] tile breaks the one-neighbour rule. Density is nearly the
whole dial (18.5 to 23.5%), and it gets harder by getting *smaller* between set counts. A beaten
creature's number is not drawn on these two ladders, by request, though the engine and the proofs
still read it.

## PACKS and CONGA LINE

Creatures stand in connected packs of one of every tier, and no two packs touch (touching is
`neighbours()`, so a diagonal counts). `missingFrom` is the Sweep proof: the strongest tier a
pack has not shown yet; when that is within your level, or nothing is missing, the ring is free.
Computed over the component of *open* creatures, which errs safe. `packCandidates` gives the
pencil the tiers the neighbouring pack has not shown. CONGA LINE takes all of it by reference. Density is
the dial (22.5 to 31.6%), and the board grows a row or column every step for granularity.

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

Search boards: one HP, level 0, won by uncovering every empty cell, with the creatures still
hidden at the win. BLIND climbs 5 to 7 tiers over its ladder. It opens at 70 boards cleared,
one step after every other counted ladder (decision 0036), and its Full Run heal rounds down to nothing, so a run there is a
single-mistake run.
