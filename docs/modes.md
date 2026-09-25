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
hidden at the win. BLIND climbs 5 to 7 tiers over its ladder. It is gated on three Full Runs
completed on different types, and its Full Run heal rounds down to nothing, so a run there is a
single-mistake run.
