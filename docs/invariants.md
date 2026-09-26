# The load-bearing facts

Four findings constrain almost every design decision, and all four fail **silently**: a board
that violates one still generates, still renders, and simply cannot be finished. Each is covered
by `test/invariants.test.ts` and by the simulators, and this page says, for each, what it claims,
what protects it, and what would break it.

They were reverse-engineered from the original game's data, not invented; the derivations are in
the design reference (`design/reference.html`).

## 1. The tuning identity

Let `C_k` be the total EXP available from every creature of tier at most `k`. The upper level
thresholds of every board equal `C_k` *exactly*, so each of the last few level-ups requires
killing literally every creature at or below that tier. **Lock depth** is how many of the top
thresholds are such full-tier-clear gates, and it is the main difficulty dial of a ladder.

- **Where it lives:** `design/ladders.py` computes the thresholds; `cumulativeExp` in
  `src/engine/config.ts` is the engine's reading of `C_k`.
- **What protects it:** `ladder data > locks exactly the top lock thresholds to C_k` and
  `keeps every threshold at or below C_k` in `test/invariants.test.ts`.
- **What breaks it:** any change to a board's creature quantities that does not go through
  `ladders.py`, or a placement rule that cannot land its quota exactly (a cave or a PAIRS board a
  few cells short would not throw; it would sit one kill under its top gate on that seed only).

## 2. The zero-damage guarantee

At level `k` every creature of tier at most `k` is a free kill (one round, no retaliation). Those
kills pay `C_k` EXP, and the threshold to reach `k+1` is at most `C_k` by construction, so by
induction **every board is clearable without losing a single point of HP**, whatever the
distribution shape. HP is therefore a **guess budget**, spent on 50/50s and misreads, never a
combat resource spent on required fights.

- **What protects it:** `npm run sim` plays every one of the 704 boards with the omniscient
  tier-order player and exits non-zero if any cannot be cleared at full HP; `npm run sim:run` does
  the same ten boards deep for every Full Run; the tests do it on the tuned boards at three seeds.
- **What breaks it:** healing inside a board (which turns HP into a combat resource; the Full Run
  heal happens between boards for this reason); any rule about *where* the player may act, which
  can put the free kills out of reach. DUNGEON's crawl rule did exactly that on five boards in
  2,280, and the fix is the rule's stated exception, `Game.sealedIn`: when nothing within reach can
  be opened at your level, the radius lifts until something can. It reads `level` alone, not
  `level + exerciseCharge`, because the question is whether the *board* has sealed you.
- **What does not break it:** the gameplay dials. A free kill is free at any damage ratio and HP
  scaling moves the budget without making a required fight cost anything;
  `test/settings.test.ts` clears every battle ladder at HP x0, damage x3, no mana and no Sweep
  without being hit once.

## 3. EXP must always be collected

Because the gates *are* `C_k`, any effect that removes a creature without paying its full EXP
makes that gate permanently unreachable. This applies to every spell, item or mechanic that can
touch a creature, which is why no spell removes one: the whole set is information, protection and
movement. Exercise lends a level so the fight is fought and paid normally; WORKOUT's double EXP is
safe because it only ever *adds* (`config.ts` refuses a multiplier below 1).

- **What protects it:** the same simulations as fact 2, which reach max level exactly on every
  board (`reaches max level exactly, with only the top tier left to spend it on`).
- **What breaks it:** a "banish", "skip" or "trade" mechanic, or a kill that pays a rounded or
  partial reward.

## 4. A cell's number is the sum of neighbouring tiers, not a count

Everything about board shape follows from this. Fewer neighbours means fewer unknowns behind a
number and easier deduction, so edges and corners are *free information*. Wrapping a rectangle
deletes them and is the only variant that is harder; every cut-out shape is easier. (Wrapping a
*shape* is the exception that proves it: a cross is nearly all rim, and joining its arms makes two
loops out of four dead ends, which is easier. See `docs/modes.md`.)

Two consequences worth stating: a number can exceed 8 even though a cell has only 8 neighbours,
which is the thing a Minesweeper player gets wrong first and why the rules card leads with it; and
a placement rule that says anything about a tier says something about every number it sits
behind, which is why CHECKERBOARD's colour rule reaches the whole of deduction.

- **Where it lives:** `computeNumbers` and `neighbours()` in `src/engine/grid.ts`. Adjacency is
  in exactly one function; see `docs/architecture.md`.

## Rules that follow from the four

- **Notes can protect you; they must never expose you.** A pencil mask is read in one direction
  only: `lowestNote > level` guards a cell. Reading it the other way (`highestNote <= level` means
  safe) shipped briefly and charged a player 7 HP for a cell pencilled {2,3} that was a tier 7. A
  note means "the tiers I have not ruled out", not a claim; a mark is the claim.
- **Sweep must stay strictly weaker than any generator's solver.** On SUDOKU the boards are made
  by rejecting whatever the propagator cannot finish, so wiring that propagator into `safeCells`
  made Sweep clear every board in one click. Sweep there harvests the player's own marks and the
  givens, and pencil notes never regenerate, so it is bounded by the player's own work.
- **A sweep must never pay for the next one.** In charged mode only hand-opened cells bank a
  charge, and a cascade is one click and one charge. Enforced in `Game.sweep`, not in the button.
- **The gameplay dials are allowed nowhere near EXP or creature removal.** That is what keeps
  facts 1 to 3 true at every setting.
