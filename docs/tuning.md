# Tuning: the instruments, the method, and the open questions

Every density, lock depth and HP value in the game is a schedule in `design/ladder_types.toml`,
derived into boards by `design/ladders.py`, and checked by simulation. This page is how that is done and what is still unsettled. The full derivations
and the per-ladder findings are in the design reference (`design/reference.html`).

## The instruments

All in `src/sim/cli/`, all driving the real engine with fixed seeds, all deterministic.

| Command | What it measures |
| --- | --- |
| `npm run sim [-- seeds]` | Clears every one of the 689 boards with the omniscient tier-order player. Reports the opening and HP lost; exits non-zero if any board cannot be cleared at full HP. The regression gate for `ladders.py`. |
| `npm run sim:run` | Completes every type's Full Run ten boards deep on one HP pool. |
| `npm run sim:spells -- N [ladder]` | The honest player, spell-less and with each spell policy: forced guesses, HP lost, clear rate, HP saved per cast and per mana. `POLICY=gym` plays WORKOUT as a farmer. |
| `npm run sim:forced -- N [ladder] [a-b]` | The honest player beside a player that also takes the complete deducer's free moves, on the same seeds: what share of stuck points had a free move, how often a perfect deducer is still cornered, what share of boards is guess-free. Its `bad` and `hurt` columns must be zero. |
| `npm run sim:lethal -- N ladders` | The perfect deducer guessing the cell with the lowest proven worst case: could any forced guess kill? |
| `npm run sim:sudoku -- N [--sweep]` | SUDOKU build cost per givens count and the tightest round of each board. |
| `npx tsx src/sim/cli/opening.ts`, `placement.ts`, `topology.ts` | The opening, placement and topology experiments; the first two write `design/data/*.json` for the reference page. |
| `npm run sim:golden` / `sim:golden:check` | Records or diffs the text of fourteen small runs of the above: the behaviour-preservation harness. |

The **honest player** (`src/sim/honest.ts`) reads only what a player can see and deduces locally,
so every "cornered" figure it gives is an upper bound. The **complete deducer**
(`src/sim/solver.ts`) is the floor. At 57 to 97% of the honest player's stuck points the solver had
a free move; a perfect deducer is cornered 31 to 59% less on the plain and shaped ladders and 68 to
85% less on the placement-rule ladders, whose rules combine across numbers in ways local reading
never reaches. The honest player still ranks the plain and shaped ladders consistently with each
other; it does not rank the placement-rule ladders against them.

## The method

1. **Retune on a candidate file, never the real one.** Build a candidate `ladders.json` (import
   `ladders.py`, shift a schedule in memory, call `build()`), point the sims at it with
   `CS_LADDERS=path`, measure, and only then replace the real file, checked byte for byte against
   the candidate that was measured.
2. **Match a curve, and say which.** Every retune so far matched the honest player's forced-guess
   curve of a reference ladder (ARCANE's, HIVE's, CROSS's), because that is what "as puzzling as"
   means. A ladder meant to be as *deadly* would match the clear rate instead and land elsewhere;
   the two disagree wherever a forced guess is cheap.
3. **Teach the instrument the rule first.** A player who cannot see the checkerboard's colours, or
   walk the dungeon, measures a different game and tunes it far too sparse.
4. **Measure, don't argue.** Several findings contradicted the intuition: WRAPAROUND is the
   gentlest counted ladder; PAIRS opens smaller, not larger; the crawl rule costs HP, not deduction;
   the doorway pocket made DUNGEON easier; the lock, not HP or density, makes the hard ladders'
   top boards guess-decided.
5. **Diff the sim output when a refactor is meant to change nothing.** That is `sim:golden:check`.

## Ceilings and constants

- 34% density is the battle ceiling: past it a board stops being a puzzle. HIVE (35%), ARCANE
  (34.5%) and CHECKERBOARD (38.5%) sit past it for stated reasons (`docs/modes.md`).
- Placement ceilings: PAIRS 26% (`PAIR` jams at 24.8 to 25.6%), PACKS 36%, CONGA LINE 34%.
- Spell prices 30 / 75 / 150 / 300 (Census, Reveal, Exercise, Beacon), one global table on purpose:
  income (pools span 150 to 1,233) and demand (forced guesses 0.1 to 6.0 a board) already carry the
  variation between ladders. Starting mana is 75 because it is "one Reveal exactly"; anything that
  changes Reveal's price has to move it.
- `MANA_PER_EMPTY_CELLS = 4` is an untuned first guess. `EXERCISE_LEVELS` is 1 and must stay 1:
  damage is a staircase, so two levels clears two steps at once.
- The Full Run heal is half the pool, rounded down (so BLIND's pool of 1 heals nothing). A first
  guess; both ends are one number away in `run.ts`.
- The counted unlock schedule opens one ladder per menu category every five boards from 15, BLIND
  last at 50, in a hand-set order that does not follow difficulty (decision 0036). `test/unlocks.test.ts` walks it and fails if any gate is unreachable on tuned
  boards alone.

## What the spells are worth, measured

Measured 24 September 2026 with `npm run sim:spells` at 40 seeds over every board of every magic
ladder, each spell against playing spell-less on the ladders that offer it:

| Spell | Mana | HP saved a cast | HP saved a mana | Clear rate gained |
| --- | ---: | ---: | ---: | ---: |
| Reveal | 75 | 0.97 | 0.0129 | 5.1 points |
| Census, as played | 30 | 0.001 | 0.0000 | 0.0 |
| Census, where it demonstrably helps | 30 | 0.48 | 0.0158 | 0.8 |
| Exercise | 150 | 0.90 | 0.0098 | 2.5 |
| Beacon (ORACLE only) | 300 | (about 3 casts in 400 games) | 0.0083 | 0.0 |

- Beacon is cast at a stuck point, like Reveal and Census, and is almost never affordable there:
  at the first stuck point on each ORACLE board the player holds a median of 84 mana against its
  300, and can pay for it 2% of the time, while an untouched blank region (17 cells on average)
  is there to open 95% of the time. Its per-cast figure rests on too few casts to mean anything;
  what the measurement says is that at this price the spell is out of reach (open question 7).
- Reveal is the most valuable spell by a wide margin. Census is not weak, it is unaimable: cast
  where it demonstrably unlocks something it is worth more per mana than Reveal, but such a spot
  exists 0.1 to 0.3 times a board and a player hits it 2 to 9% of the time (an earlier
  measurement).
- Reveal's ring (the empty ground around its target) is 45% of the spell and gives nothing away.
  It cannot cascade off a creature, because every neighbour of a tier-N cell carries at least N.
- Exercise is close to Reveal per cast and the worst per mana: it makes the unavoidable guess
  survivable rather than avoiding it. At 150 it is out of reach on DUNGEON's first boards.
- Spell value is a hump: a spell only pays where a board is hard enough to corner the player and
  still winnable. ARCANE was retuned (26.5 to 34.5%) so its late boards have something to fix.
- The affordability test (`test/spells.test.ts`) makes two claims: every board's whole pool buys
  its cheapest spell more than five times and its dearest more than once. On the ladder data of
  24 September 2026 the floors are 7.5 and 1.5, both set by DUNGEON board 1.
- "Share of the pool spent" is the wrong measure of scarcity; the right one is what it would cost
  to buy out every moment a deductive player is cornered, as a share of the pool: 40 to 86% on the
  late boards, 2 to 30% on the early ones.

## Open questions, in order of weight

1. **The ladders have never been played.** Everything is derived and simulation-checked, not
   playtested. Playtesting may run alongside the refactor; tuning changes live in
   `ladder_types.toml` and `ladders.py`.
2. **Boards contain unresolvable 50/50s, and the solver can say which.** Guess-free
   generate-and-test is affordable early and impossible late: a perfect deducer finishes NORMAL
   94% guess-free, ARCANE 73%, DUNGEON 59%, DONUT 36%, and 0% of board 10 on EXTREME, HUGE x
   EXTREME and ORACLE. The weaker target, no forced guess that can *kill*, rescues ARCANE (97%)
   and DONUT (73%) but not EXTREME (7%) or the other two (0%). The top of the hard ladders needs
   construction, or a schedule change.
3. **The lock is what makes the hard ladders' top boards guess-decided.** Held one short of
   maximum, ORACLE 7 to 10 go from 23 / 3 / 0 / 3% cleared by a perfect player to 97 / 63 / 40 /
   47%, and EXTREME 9 to 10 from 20 / 7% to 60 / 60%; two more HP barely moves ORACLE; two short of
   maximum buys nothing more and runs the dial backwards. HUGE x EXTREME is deep everywhere and was
   retuned (lock 7 on boards 7 to 10 and density stepped back) to make board 10 winnable. EXTREME
   and ORACLE are left as they are pending a decision; the advice given was one short on both, with
   two more HP on ORACLE 7 to 10.
4. **The placement-rule ladders play easier than their tuning says**, because they were tuned
   against the honest player, which understands their rules worse than a strong human. Re-deriving
   CHECKERBOARD, PAIRS, DOMINOES, PACKS and CONGA LINE against the solver is open. PAIRS and
   DOMINOES also no longer show a beaten creature's number, which the instrument still reads.
5. **Reveal buys twice what Exercise does per mana** since the ring; pricing Reveal at 100 would
   level them. Left alone deliberately.
6. **Marks are not gated the way the pencil is** (a mark may claim the wrong parity on
   CHECKERBOARD). A decision, left open.
7. **Beacon is priced out of play.** At 300 it is affordable at 2% of ORACLE's stuck points
   (measured 24 September 2026, above), so ORACLE effectively offers three spells. Whether to
   reprice it, or to let it be the late, rare purchase it is, is a design call.
8. **Smaller:** BLIND's unlock timing (50 boards) is a guess; pinch-zoom has only met
   synthetic touch events; touch has no hover, so a beaten creature's number is unreachable on a
   phone.
