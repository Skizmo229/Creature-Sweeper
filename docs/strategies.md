# Playing well: the tricks, graded

How a person clears a Creature Sweeper board, written for two readers. A player wants the tricks
in the order they are worth learning; the graded player in `src/sim/graded.ts` (the instrument
Milestone 4 measures difficulty with, `docs/human-tuning-plan.md`) is built from exactly these
tricks, one technique per entry, so a developer can read the same page as its specification.
Section 10 maps each trick to its technique id. Every claim here is a fact about the rules, not
advice about odds; the odds are in section 8.

The grades are how much has to be held in the head at once. Grade 0 is a glance at one cell.
Grade 1 is one number and a little arithmetic. Grade 2 is two numbers together. Grade 3 is a
supposition followed a step or two. Grade 4 is counting the whole board. A grade-1 player who
never learns more can still clear a great many boards; the rest is what makes the hard ladders
clearable at all.

Diagrams: `?` is a covered cell, a number is an open cell showing it, `.` is an open cell showing
0, `k3` is a beaten creature of tier 3 (its glyph is visible), `m4` is a mark of 4. Each is a
patch of a five-tier board, drawn as the game would show it: nothing beyond the patch touches its
numbers, and the rest of the board holds a creature of every tier, and enough weak ones to be at
the level the text gives, unless the text says otherwise or a counter is shown (`LV 5 x01`: one
tier 5 left).

## 1. Three things to know before the first click

**A number is the sum of the tiers around it, not a count.** A 4 might be one tier 4, or two
tier 2s, or a 3 and a 1, or four tier 1s, and you are never told which. A 9 fits behind a cell
that has only eight neighbours. A Minesweeper player reads a 4 as four creatures, plays on it,
and concludes the board lied.

**Your level is a shield, and it is the only one.** A creature at or below your level dies in one
blow and costs nothing. Above it the cost is a staircase, `tier x (ceil(tier / level) - 1)`: one
tier over your level costs exactly that tier, two over is a cliff. At full HP on the common
10-HP ladders, a cost of 10 or more is death.

| tier at level | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| tier 2 | 2 | 0 | 0 | 0 | 0 |
| tier 3 | 6 | 3 | 0 | 0 | 0 |
| tier 4 | 12 | 4 | 4 | 0 | 0 |
| tier 5 | 20 | 10 | 5 | 5 | 0 |
| tier 6 | 30 | 12 | 6 | 6 | 6 |

Death is at 0 exactly, so a fight you survive costs less than your HP, strictly. At level 1 a
tier 4 or 5 kills you from full health; at level 2 a tier 5 still does. From level 3 nothing on a
five-tier board kills in one fight, and the game changes character: a guess becomes a price.

**Every board can be cleared without losing a point.** The EXP each level needs is always
already on the board among creatures you can kill for free (`docs/invariants.md`). HP is a
guess budget, spent on nothing but guesses and misreads. So the question at every moment is not
"what is this cell" but "is anything here above my level", and most of the tricks below are
ways of answering that without knowing the tier.

## 2. Grade 0: a glance

**The raw ring.** An open number at or below your level makes every covered cell around it
safe, however many there are: whatever is there adds up to that number, so no single one of
them is more. At level 2:

```
  ?  ?  ?
  ?  2  1
  ?  1  .
```

All five covered cells are free to open. Nothing needs adding up; you are only comparing the
number with your level. This is the trick that makes a board at Expert Minesweeper density
playable, and the one to learn first.

**The free kill.** A cell you have marked with a tier at or below your level is a creature you
can kill for nothing. Marks are made below your level and harvested when the level comes; keep
the harvest going, because levelling is what turns the rest of the board free.

**Met partner** (PAIRS, DOMINOES). Every creature has exactly one creature next to it. A beaten
creature that already touches another creature has found its partner, so everything else around
it is empty ground, at any level.

**Corridors** (DUNGEON). Hallways are one cell wide and always empty, and so is the room cell a
hallway arrives at. A thin passage between two rooms can be walked without a thought; a
one-cell notch in a room's wall is not a passage, it is room floor, and can hold a creature.

**The whole pack** (PACKS, CONGA LINE). A pack is one creature of every tier, standing together
and touching no other pack. A pack that has shown every tier is finished, and every covered cell
around it is empty ground.

**The sprinkles** (SPRINKLE DONUT). Every creature is drawn where it stands, each pair as one
sprinkle across its two cells. A covered cell with no sprinkle is empty ground, free at any level;
a cell under a sprinkle is a creature, never empty ground.

## 3. Grade 1: one number

**Subtract what you can see.** Open ground counts 0 and a beaten creature counts its tier, so
take them off the number first. What is left is what is still hidden, and it obeys the raw-ring
rule: at or below your level, the covered cells are all free; 0, they are all empty ground. At
level 2:

```
  ?  ?
  5  5
 k3  3
```

Each 5 sees a beaten tier 3, so 2 is hidden over the two covered cells, and both are free. Hovering
a beaten creature shows its own number, which you subtract the same way, except on PAIRS and
DOMINOES, where it is not shown.

**The last cell.** A number with exactly one covered neighbour left has named it: the cell holds
whatever is still hidden, exactly.

```
  .  4  4
  .  4  ?
  .  4  4
```

That cell is a tier 4, and every number around it says so. Mark it 4 and come back at level 4; until
then a mark above your level locks the cell so a slip cannot open it. This is the workhorse, and it
compounds: every cell named is a tier subtracted from every other number it touches, which names the
next.

**The counters.** The LV buttons show how many creatures of each tier are still alive. A tier
whose counter reads 0 is gone, so no number hides one: a 5 over two cells with no 5s left is a
4 and a 1, or a 3 and a 2. When every tier still alive is at or below your level, the whole
board is free and you can click anything. Read the counters before every guess.

**The lone dark square** (CHECKERBOARD). Even tiers stand only on light squares, odd tiers only
on dark, and empty ground anywhere. The light squares behind a number add up to an even amount,
so the number's parity is decided by its dark neighbours alone. If only one dark square around a
number is still covered and the hidden amount is even, that square is empty, at any level.

**The partner's tier** (PAIRS, DOMINOES, where the number is visible). A beaten creature's own
number *is* its partner's tier, because nothing else it touches is a creature. If it has one
covered neighbour left, that is the partner and you know its tier; if its number is at or below
your level, the whole ring is free.

**Count the sprinkles** (SPRINKLE DONUT). A number says how much tier is hidden around it, and the
sprinkles say how many creatures share it, as a Census would. Each is worth at least 1, so the
biggest can be no more than the remainder less one for every other: a 3 over three sprinkles is
three tier 1s, and a 5 over three is nothing above a 3.

## 4. Grade 2: two numbers

**Subtraction, or the 1-2-1.** When one number's covered cells all lie inside another's, take
the smaller from the larger: the cells only the larger one sees hold the difference, exactly.
This is Minesweeper's 1-2-1 with the numbers free to vary. Along a wall:

```
  ?  ?  ?  ?
  2  5  3  3
  .  .  .  .
```

At level 1, the 2 sees the first two covered cells and the 5 the first three, so the third is a 3.
The last 3 sees the third and fourth, and the first 3 sees those and the second, so the second is
empty. That leaves the first for the 2, and the fourth empty. The pattern to remember is `x, x+z, z`
over a wall: beneath it lies `x, empty, z`, whatever x and z are; when x is at or below your level,
the raw ring has given you the first two cells already. Four in a row, `a, a+b, a+b, b`, put empty
ground under both ends and `a, b` under the middle pair.

**Overlap.** Two numbers that share some covered cells but not all: the cells each sees alone
are bounded by the other. If a 3 and a 7 share two cells, those two hold at most 3, so the 7's
private cell holds at least 4; and since that private cell holds at most 5, the shared pair holds
at least 2, so the 3's private cell holds at most 1. This is the reasoning behind "the typical
miss" the complete deducer found in the honest player (`docs/tuning.md`), and it needs no
supposition, only a bound from each side.

**Bounds.** One number on its own says what each of its cells can be. A 9 over two cells on a
five-tier board is a 4 and a 5, so both are creatures, both are dangerous below level 4, and
neither is worth a guess. In general a hidden amount `r` over `k` cells puts at least
`r - (k - 1) x top` in every cell, where `top` is the highest tier still alive; when that is
above 0, every cell is a creature. Pencil the candidates in; the pencil is a shield, read by its
lowest candidate, so "4 or 5" locks a cell until level 4 and can never expose you.

```
  ?  ?
  9  9
  .  .
```

The counters sharpen it, because a tier with none left is no candidate. With only 2s and 5s left,
a 9 over three cells:

```
  9  ?
  ?  ?
```

None of the three can be empty, since two of them make 4, 7 or 10 from 2s and 5s, never 9; so all
three are creatures, and the only way to make 9 is 2 + 2 + 5. You know what is there and not
where, which at level 2 is two free kills and one that costs 10.

**Colour caps** (CHECKERBOARD). A light square hides at most the largest even amount at or
below what is hidden; a dark square under an odd amount may hide all of it, and under an even
amount with other dark squares in sight, all but the 1 its partner must carry. So half a
number's ring can be free while the other half is not, which is the shape of deduction that
belongs to this board alone.

**The pack's gap** (PACKS, CONGA LINE). A covered cell beside a pack holds one of the tiers that
pack has not shown yet, or nothing. A pack showing 6, 5 and 4 caps everything beside it at 3.
A pack missing exactly one tier with exactly one covered cell touching it has named that cell.

## 5. Grade 3: what if

**Suppose, then follow it.** When no number settles a cell on its own, suppose it holds a tier and
follow what that forces from one number to the next; a supposition that ends at a number that
cannot be made is false, and that tier is struck off the cell. Three 3s around one creature, at
level 2:

```
  3  ?  3
  ?  ?  ?
  ?  3  ?
```

Suppose the cell left of the middle is a 3. Then the top-left 3 is made and its other two cells
are empty, so the top-right 3 must be made by the cell right of the middle, and the bottom 3 would
see 6. So it is not a 3, nor by the same steps is the cell right of the middle, and at level 2
both are free. Two numbers along is about as far as anyone follows it at the board (and further
than the honest player, `src/sim/honest.ts`, ever went).

**A line's ends** (CONGA LINE). Each pack is a straight or bent line of one of every tier, led by
the 6, and no member is orthogonally beside any but its neighbours in the line. So a line only
continues from its two ends, the cells orthogonally beside a member in the middle of a known
stretch are empty, and any cell the missing members could not reach by walking from an end is
empty too.

## 6. Grade 4: counting

**Accounted for.** The counters say exactly how much tier is left on the board. Numbers whose
covered cells do not overlap each account for their own hidden amount, and once a set of them
accounts for all of it, every other covered cell on the board is empty, the untouched middle
included. Short of that, whatever is unaccounted for is spread over the cells outside those
rings, and if that remainder is at or below your level, all of those cells are free.

**The last of a tier.** When one creature of the top tier is left and some number cannot be made
without it, that is where it is, and nowhere else can hold one. One 5 left and a 9 over two
cells:

```
  ?  ?
  9  9        LV 5 x01
```

The 9 is a 4 and a 5, so the last 5 is one of those two, and every other covered cell on the
board is at most a 4. At level 4 all of it is free. The last few level-ups on every ladder are
exactly this hunt: the top thresholds are met by killing every creature of a tier
(`docs/invariants.md`), so the endgame is finding the last one, and the counters are the map.

## 7. The ladders' own tricks

- **EASY.** No Sweep button, on purpose: it is where the sum rule is learned. Boards are sparse
  and the opening large; the raw ring and the last cell clear most of it.
- **NORMAL.** The classic game and the calibration for everything else. Sweep appears, charged:
  ten cells opened by hand buy one press, and the button's label tells you how many cells are
  provable right now even before you press it.
- **EXTREME, ORACLE.** Strong tiers as common as weak ones, so no number is safely assumed and a
  guess is as likely to land on a 5 as a 1. Level 3 is the goal of the opening, because it is
  where death stops being one fight away.
- **WRAPAROUND.** No edges. Hover a cell near the seam and the highlight jumps to the far side;
  a number on the rim sees eight cells like any other. Measured, it is still the gentlest of the
  counted ladders, because zero regions run on round the seam and the opening is larger.
- **HIVE.** Six neighbours, so every number is lower and blank ground commoner; it runs denser to
  compensate. The tricks are unchanged; only the ring is smaller.
- **DONUT, CROSS, WRAPPED CROSS, DIAMOND, RAGGED CAVE.** Edges are information: a rim cell sees
  fewer cells, so work from the rim inwards. A cross's arms are corridor puzzles; stuck at the tip
  of one on WRAPPED CROSS, go round and work in from the other end.
- **GEAR, CARD, VALENTINES, STAR.** The same rule with more rim: a gear has edges outside and
  round its hole, a card has four holes cut where the suits sit, a heart tapers to a point, and
  each of a star's five points narrows to a single cell that sees almost nothing. Start at
  whichever edge the opening left you nearest and read inwards from every hole; a star's point
  is cleared from its tip, where a number over one or two cells names them outright, and the
  pentagon in the middle is the last and hardest ground. All four carry Reveal and Census.
- **PYRAMID.** The bottom two rows start face up: their empty ground open and every creature
  there shown with its tier, in gold, alive and waiting. A shown creature is a mark the board
  wrote for you, so subtract it from every number it touches from the first click, and take it
  as a free kill the moment your level reaches it; the base is your level-up larder. Work up
  the steps, each row a cell narrower on either side, so every row's ends are corners.
- **ULTRA HIVE.** HIVE's hexagons on a board that is itself a hexagon: six straight edges to
  read in from, and every number still the sum of six neighbours at most. Play it as HIVE with
  the rim's help.
- **SPRINKLE DONUT.** DONUT's ring with every creature shown, two to a sprinkle, and PETRI DISH's
  growth rule from a single opening. Nothing is ever a guess about *where*, only about *what*:
  open the plain ground beside you freely (Sweep does it a ring at a time), count the sprinkles
  under every number, and take the free kills the counts give you to level. The walls are pairs
  standing shoulder to shoulder; a mark on a sprinkle beside your ground lets you reach the cell
  past it, so name what you can and step over it. The sprinkles are tier-blind, so a pair's two
  halves need not match.
- **PETRI DISH.** A round dish that opens at its three largest blank areas, and you may only open
  a cell touching ground you have uncovered, so each colony grows from its own edge. A mark you
  make beside uncovered ground counts as ground for that purpose while it touches some: naming
  a creature on the frontier lets you reach one cell past it, and no further, since marks never
  chain. So the two habits that pay are naming what the last cell trick gives you, to carry the
  colony past it, and working all three colonies in turn, because a guess in one is always a
  frontier cell beside numbers and therefore cheap.
- **DUNGEON.** Walk the corridors first (grade 0). Doorways are empty, and so are the room cells
  beside a doorway that touch the wall, so the first step into a room is free and the second is
  the risk. You may only open within two cells of ground you have uncovered; marking is exempt,
  and if the board walls you in the rule lifts.
- **CHECKERBOARD.** The lone dark square (grade 1) and the colour caps (grade 2). The pencil
  refuses the wrong parity for a square; a mark does not, so a wrong-parity mark is your own.
- **PAIRS, DOMINOES.** Met partner (grade 0), and the partner's tier where the number is shown.
  A creature's ring empties fast once the cells around it open, so the last candidate standing
  is named without a guess. DOMINOES is a full double-six set: every pairing once, so a tile you
  have found is a tile you no longer fear, and the last tiles are known before they are seen.
- **PACKS, CONGA LINE.** The whole pack (grade 0) and the gap (grade 2); on CONGA LINE the
  bonds drawn between open members show the line, and its ends (grade 3).
- **PATROL.** The creatures walk. A tier-t creature paces the edge of a square t cells a side,
  one cell per action, clockwise from its top-left corner, and every open, every Sweep and every
  Wait (`W`, free) is an action; marking and pencilling are not. The board is sparse (6.5 to
  8.5%), so the opening uncovers most of it and most creatures walk in plain sight as a `?` on
  ground you have already cleared. Three habits and one warning. Read the numbers again after
  every move, because they are the sums as the board stands now, and what you proved a move ago
  may be gone; a `?` you can see is a creature you know the tier of once it has walked one side
  of its square, since a side is its tier long. When nothing is proven, Wait rather than guess:
  waiting is free, the creatures move, and new numbers arrive; one lap of the largest creature,
  four times its tier in moves, shows it on every cell it can stand on. A mark is a route, not a
  claim: marking a tier t on a cell draws that creature's whole square from that corner and locks
  every covered cell of it, which is how you fence off where a creature can step, and why Sweep
  reads no marks here. The warning: a mark on the wrong corner fences the wrong cells and locks
  ground that was safe.
- **WORKOUT.** Exercise lends one level for one fight; a creature named at one tier past your
  level is a free kill for the price of a cast, and pays double EXP for it. The price rises with
  each cast and falls with each level.
- **ARCANE, ORACLE, and the shapes with magic.** Reveal names a cell as a fact and opens the empty
  ground around it, so cast it on the cell you would otherwise guess. Census counts the
  creatures behind a number; sum plus count usually pins the layout, but only where the count
  changes the answer, so aim it at a large number over few cells. Exercise makes an unavoidable
  guess survivable rather than avoidable. Beacon opens the largest untouched blank region, when
  you can afford it.
- **SUDOKU.** Tiers 0 to 8 are the nine digits, so each row, column and box holds each once and
  the empty cells are the opening. The neighbour sums are worth about fifteen clues; the rest is
  Sudoku's own tricks, and every board is built to need no guess, because a wrong one kills
  several times over.
- **BLIND, HUGE x BLIND.** Level 0, 1 HP, no fighting: the board is won by uncovering every empty
  cell, and every creature is death. Only the tricks that prove a cell *empty* apply: the
  remainder of 0, subtraction to 0, and the counting tricks. Marks are flags and the counters
  subtract them.
- **SEER.** BLIND with Reveal, Census and Beacon, and denser for it. Nothing is killed, so
  exploring is the only mana: one Reveal in hand at the start, about one more earned over board 1
  and two over board 10. Every guess is death, so the spend rule is absolute: never gamble with a
  Reveal affordable. Reveal on the cell you would otherwise open blind; Census on a large number
  over few cells; Beacon when the frontier has closed and blank ground is left somewhere.

## 8. Guessing well

You will be forced to guess, and the hard ladders' top boards force it on everyone
(`docs/tuning.md`). What separates players is what the guess costs.

1. **Check the counters and take every free kill first.** Levelling is the cheapest safety
   there is: a cell that is a 3-or-5 today is a free kill at level 5. Before any guess, ask
   whether two more levels would make it unnecessary, and whether those levels are already on
   the board.
2. **Know the worst case.** The cell's ceiling is the smallest hidden amount among the numbers
   touching it, capped by the top tier still alive. Look the ceiling up in the table in section
   1 at your level: if the worst case would kill, do not click there.
3. **Prefer the cell that says the most.** Among survivable cells, the one touched by more
   numbers, or beside a large blank area, tells you more when it opens; a corner or rim cell is
   likelier to open blank ground.
4. **A guess you know something about is cheaper than one you do not.** This is the finding
   behind every placement ladder: a doorway read, a colour, a pack's gap all cap what a guess can
   be. A cell no number touches is worth the board's average, which the counters tell you: total
   tier left divided by covered cells.
5. **One tier over is cheap; two is a cliff.** At level 3 a tier 4 costs 4 and a tier 5 costs 5;
   at level 2 a tier 5 costs 10. So a guess whose candidates are all within one tier of your
   level is a price, and one that reaches two over is a gamble on your life.
6. **Spend mana before HP.** Reveal on the cell you would guess, or Census on the number over it,
   costs nothing that does not come back. Exercise before the fight you cannot avoid.
7. **Never trust a mark you did not prove.** The endgame kills more players through a wrong mark
   than through a bad guess: assisted Sweep opens whatever your marks leave provable, and a mark
   at or below your level is a cell you will open by hand without a thought. If a mark was a
   guess, pencil it instead.

## 9. Mistakes worth naming

- Reading a 4 as four creatures.
- Forgetting to subtract a beaten creature's tier from the number beside it.
- Reading a number as if the level were one higher than it is; the level's colour is the colour
  of the strongest creature it can beat.
- Trusting a wrong mark into the endgame.
- Reading the pencil the wrong way round: notes say what a cell might still be, and the game
  reads only the lowest one; a note of 5 alone locks a cell, a note of 0 and 5 does not.
- Guessing in the untouched middle when a rim cell with a number on it was available.
- Not checking the counters before a guess, when the tier that frightened you was already dead.
- On DUNGEON, forgetting that reach is measured from open ground, so a Reveal pushes the
  frontier and a mark does not.

## 10. For developers

Each trick is one technique of the graded player, `src/sim/tricks.ts`, at the grade this page
gives it. The engine's Sweep (`src/engine/sweep.ts`) performs the raw ring, the subtraction of
open tiers, the Census bound, the lone dark square and the colour caps, the pairing ring and the
pack ring, and the conga proofs, at the press of a key, so on a ladder with Sweep those are free
effort for a player; it does not subtract numbers from each other, name a last cell, or count.

Every diagram on this page is a board. `src/sim/diagrams.ts` holds what is under each, and
`test/strategies.test.ts` builds it with `Game.fromLayout` and holds the tutor to answering there
with the trick the diagram sits under, at that trick's grade, on the cells the board says.

| Trick | Technique id | Grade |
| --- | --- | --- |
| the raw ring | `raw-ring` | 0 |
| the free kill | `named-kill` | 0 |
| met partner | `met-partner` | 0 |
| corridors | `corridor` | 0 |
| the sprinkles | `sprinkles` | 0 |
| subtract what you can see | `residual-ring` | 1 |
| the last cell | `last-cell` | 1 |
| the counters | `counters` | 1 |
| the lone dark square | `lone-dark` | 1 |
| the partner's tier | `partner-number` | 1 |
| count the sprinkles | read by `census-ring`: the board shows the count a Census gives | 1 |
| the whole pack | read by `residual-ring`: a finished pack's numbers all leave 0 | 1 |
| subtraction, the 1-2-1 | `subtract` | 2 |
| overlap | `overlap` | 2 |
| bounds | `bounds` | 2 |
| colour caps | `colour-cap` | 2 |
| the pack's gap | `pack-gap` | 2 |
| suppose, then follow it | `what-if` | 3 |
| a line's ends | `line-reach` | 3 |
| accounted for | `accounted` | 4 |
| the last of a tier | `last-of-tier` | 4 |

What the instrument does not model, and this page does not pretend to: attention (it finds every
move of a grade and counts how many there were), arithmetic slips, wrong marks, deferring a
guess, and the spending policies. `docs/human-tuning-plan.md` section 10 says which comes next.

Sources for the outside material: the mamono sweeper community's guide at
<https://mzrg.com/mines/mamono.shtml> (the core loop, the safe ring, group sums, the Blind
pattern), a Japanese speedrunner's per-mode notes at <https://note.com/stairlimit/n/nc8219ffd2e22>
(memorise only what you cannot yet kill; the difficulty lives in the opening), the Minesweeper
pattern pages at <https://minesweepergame.com/strategy/patterns.php>, Sean Barrett's notes on
guessing at <https://nothings.org/games/minesweeper/>, Becerra's technique-tiered solvers
(Harvard, 2015) and Pelánek's studies of human Sudoku difficulty (FLAIRS 2011,
<https://arxiv.org/abs/1403.7373>), which are where the grades' shape comes from.
