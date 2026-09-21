# Creature Sweeper

A remix of [mamono sweeper](https://hojamaka.com/games/mamono_sweeper/) — itself a remix of
Minesweeper — with heavy customisation, quality-of-life features, and a progression mode.

If this is ever released publicly it will be freeware.

`design/` is the **research toolchain** — mechanics, generated progression ladders, and the
simulations behind them. `src/engine/` is the **rules engine**: headless, seeded, and covered by
tests that encode the findings as executable specifications. `src/ui/` is a **playable
prototype** — canvas board, HUD, marks, Sweep, the full ladder and unlock chain, and a settings
menu.

```bash
npm install && npm run dev
```

**Design reference (published page):**
<https://claude.ai/artifact/8w8aAaG6MJ3LCnSbokJUXi>

---

## Layout

```
creature_sweeper/
├─ README.md
├─ CLAUDE.md                 working notes: invariants, gotchas, open decisions
├─ game_types.pdn            source screenshots of the original's seven modes — not tracked
├─ src/
│  ├─ engine/                the rules engine — no DOM, no I/O, no timers
│  │  ├─ rng.ts              seeded RNG; boards are pure (config, seed)
│  │  ├─ types.ts            cells, configs, events
│  │  ├─ combat.ts           damage, EXP, mana, levelling
│  │  ├─ board.ts            generation, neighbour sums, choosing the opening
│  │  ├─ notes.ts            pencil marks: a cell's candidate tiers, as a bitmask
│  │  ├─ spells.ts           the four spells, their prices and the mana economy
│  │  ├─ sudoku.ts           the Sudoku placement, and guess-free generation
│  │  ├─ checker.ts          the checkerboard placement: a square's colour fixes a tier's parity
│  │  ├─ pairs.ts            the pairing placement: creatures come in non-touching dominoes
│  │  ├─ dominoes.ts         the domino placement: the pairings are a full domino set
│  │  ├─ packs.ts            the pack placement: non-touching packs of six, one of every tier
│  │  ├─ dungeon.ts          the dungeon mask: rooms and hallways, laid out in 2x2 blocks
│  │  ├─ game.ts             state machine: open, mark, sweep, win/lose
│  │  ├─ run.ts              Full Run: ten boards, one HP pool, half-heal between
│  │  ├─ settings.ts         the player's gameplay dials, and what they may not touch
│  │  └─ config.ts           reads design/data/ladders.json into board configs
│  ├─ ui/                    the prototype — canvas renderer, screens, save data
│  │  ├─ settings.ts         the settings store, and what "game type default" resolves to
│  │  ├─ settingsscreen.ts   the settings form
│  │  ├─ preview.ts          the settings screen's example boards — real games, no rendering
│  │  ├─ sfx.ts              sound packs, synthesised rather than loaded
│  │  └─ victory.ts          the board-clear effects
│  ├─ sim/                   headless measurement, all driving the real engine
│  │  ├─ autoplay.ts         omniscient tier-order player
│  │  ├─ cli.ts              clears every board of every ladder
│  │  ├─ run.ts              completes every type's Full Run
│  │  ├─ opening.ts          measures the auto-opening -> data/opening.json
│  │  ├─ spellvalue.ts       what each spell is worth, played honestly
│  │  ├─ sudoku.ts           SUDOKU build cost, and the shape of its deduction
│  │  └─ topology.ts         compares square / cylinder / torus / hex
│  ├─ main.ts                browser entry
│  └─ data.ts                Node-only loader (kept out of engine/ on purpose)
├─ test/                     invariants as executable specs
└─ design/
   ├─ ladders.py             generates the 10-board progression ladder per game type
   ├─ placement.py           simulates placement rules and board topology
   ├─ build.py               injects generated data into the reference page
   ├─ page.template.html     reference page source  ← edit this
   ├─ reference.html         built page             ← generated, do not edit
   ├─ data/                  generated JSON (ladders, opening, placement)
   ├─ screenshots/           the .pdn layers as PNG, one per mode — not tracked
   └─ original-reference/    third-party source, REFERENCE ONLY, not tracked
```

Every script resolves its paths relative to its own location, so they can be run from anywhere.

## Commands

```bash
npm run dev       # play it
npm test          # 324 tests, including the invariants below
npm run typecheck # UI config, then an engine config with no DOM lib at all
npm run sim       # clear every board of every ladder headlessly
npm run sim -- 200
npm run sim:run      # complete every type's Full Run, ten boards on one HP pool
npm run sim:spells   # what each spell is worth, played honestly
npm run sim:sudoku   # SUDOKU: build cost per board, and how tight each one plays
npm run sim:sudoku -- 8 --sweep
npm run build
```

`npm run typecheck` runs twice on purpose. `tsconfig.engine.json` compiles the engine with no DOM
library, so a stray `window` or `document` under `src/engine` is a build error rather than
something discovered when it fails to run headlessly.

`npm run sim` is the tuning instrument: it plays all 517 boards with an omniscient tier-order
player and reports the opening size and HP lost. It exits non-zero if any board cannot be
cleared at full HP, so it doubles as a regression gate on `design/ladders.py`.

`npm run sim:run` chains those ten boards into one run and checks the composed claim: because a
run resets level and EXP on every board, each board is still the board `ladders.py` tuned, so the
zero-damage guarantee survives ten deep and a run can be completed without the heal ever mattering.
It exits non-zero otherwise.

`npm run sim:spells` is the other one, and it measures what the omniscient player cannot: it
plays the magic ladders with a player that sees only what a player can see, deduces what it can,
and guesses when it runs out — so the difference between spending mana and not spending it is
the spell's value. Two spells are priced correctly against each other when a point of mana buys
the same certainty through either.

Each spell is judged only on the ladders that offer it, and Exercise is judged differently from the
rest: it unlocks nothing a player could reason about, so scoring it on deductions unlocked would
score it zero. It is cast at the same moment the information spells are — the one where deduction
has run out — and judged on what the fight itself reports having spared.

`npm run sim:spells -- 40 dungeon` gives one ladder board by board, with a column per spell it
carries: how often a deductive player is cornered there, and what each spell is worth against it.

**Prices are meant to bite, and for most of this game's life they did not.** The test of whether a
price matters is not what share of a pool gets spent — that is as much about how often you want to
cast — but what it would cost to buy your way out of *every* moment a deductive player is cornered.
At the old 25/10/50/100 that was 1–32% of a board's whole pool, so no ladder could run out of mana
by playing well. At 30/75/150/300 it is 40–86% on the late boards and 2–30% on the early ones: the
introduction stays cheap, and by board 10 you must choose which moments to buy. It is one global
table on purpose — the variation between ladders is already carried by income (pools span 150 to
1,233) and by demand (forced guesses span 0.1 to 6.0 a board), and a per-ladder price would be a
third axis saying what those two already say.

In dev, `window.cs` exposes the running app (`cs.play('normal', 3)`, `cs.current`, `cs.sync()`,
`cs.runFull('normal')`, `cs.currentRun`). It is stripped from production builds.

**Controls:** click to open · right-click or a LV button to mark · number keys act on the cell
under the cursor, marking or pencilling according to the Entry mode · `N` switches that mode ·
`Shift`+digit does the other one for that keystroke · `S` sweeps what is proven safe ·
`D` also trusts your marks ·
a spell's bracketed letter casts it — `C`ensus, `R`eveal, `E`xercise, `B`eacon,
offered cheapest first ·
scroll or `+`/`-` to zoom in, `F` to reset · `Esc` backs out.

**Settings** are reachable from the ladder list and from the HUD mid-board, and are two separate
things. The **presentation** half — creature icons, board palette, font, sound pack, board-clear
effect, cursor highlight, the strike through defeated creatures, and the zoom ceiling — touches no
rule, so it can never affect a record; each one is either the game type's own answer, a value you
pick, or off. Every visual setting shows its options rather than naming them: the examples are real
boards drawn by the game's own renderer. There are eleven board-clear effects, and seven of them
animate the board's own creatures — dropping and bouncing them, sending them off in a Solitaire
cascade, swelling and bursting them, burning them away, or wiping them off — so picking one plays
it over a demonstration board that has genuinely been cleared. The **gameplay** half is seven dials that do change the rules: player HP, Full Run HP
regen, creature damage, mana regen, mana per creature, how Sweep is gated (always, charged by the
cells you open by hand, or off), and Time Attack, which replays a board counting down from your own
best time on it.

Settings that make the game *harder* record normally. Any setting easier than the tuned game means
a clear is not written down at all — no clear, no unlock, no best time — and the game says so
live in the settings screen, on the ladder list and on the clear overlay. None of the dials can
reach EXP, a level threshold, or whether a creature dies and pays out, which is what keeps the four
load-bearing facts below true at every setting; `npm test` asserts it by clearing every battle
ladder at one HP against triple-damage creatures without being hit once.

The engine is deliberately free of rendering, storage and timers so it runs unchanged in Node
and in a browser, and so difficulty tuning stays empirical rather than becoming guesswork.

## Regenerating

Order matters — `ladders.py` produces the data the other three consume.

```bash
python design/ladders.py       # fast
npx tsx src/sim/opening.ts     # slow: drives the real engine over every board
python design/placement.py     # slow: 18 configurations x 240 boards
python design/build.py         # fast
```

Editing only prose or layout? `page.template.html` then `build.py` is enough — the data files
only change when a ladder schedule does.

The opening measurement moved from Python to `src/sim/opening.ts` so it drives the real
engine: a second implementation only stays honest until the first one grows, and once boards
gained hex grids and wrapped edges the Python copy could no longer describe them.

Requires Python 3 with `numpy` and `scipy`. Re-exporting `screenshots/` additionally needs
`pypdn` and `Pillow`. Both that folder and `game_types.pdn` are untracked — they are pictures of
the *original* game, so they are third-party expression and are kept locally on the same footing
as `design/original-reference/`. A fresh clone will not have them, and `build.py` does not need
them.

## The load-bearing facts

Four findings constrain almost every future decision. The reference page has the full
derivations, and `CLAUDE.md` has the working notes; these are the ones worth not rediscovering
the hard way.

**The tuning identity.** Let `C_k` be the total EXP available from every creature of tier ≤ k.
In every one of the original's modes, the upper level thresholds equal `C_k` exactly — so the
last few level-ups each require killing literally every creature at or below that tier. Ladder
difficulty is driven by *lock depth*: how many of the top thresholds are full-tier-clear gates.

**The zero-damage guarantee.** At level k you can safely kill every tier ≤ k, which yields `C_k`
EXP, and the threshold to reach k+1 is at most `C_k` by construction. By induction, every board
is clearable without taking a single point of damage — whatever the distribution shape. HP is
therefore a *guess budget*, not a combat resource. Anything that breaks this invariant (healing
mid-board, spells that skip EXP) changes the whole risk model.

**EXP must always be collected.** Because the gates *are* `C_k`, any effect that removes a
creature without granting its full EXP makes that gate permanently impassable and silently kills
the run. This applies to every spell, item or mechanic that can remove a creature.

**Numbers are sums, not counts.** A cell shows the SUM of its neighbours' tiers. So fewer
neighbours means fewer unknowns means easier deduction — which is why edges are free information,
why wrapping a rectangle (deleting its edges) is the only variant that makes it *harder*, and why
every cut-out shape makes it easier. Wrapping a *shape* is the exception that proves it: WRAPPED
CROSS deletes almost no rim, because a cross barely has an interior, and what it really does is
join four dead-end arms into two loops — which makes it easier, not harder, and is why it runs
denser than CROSS.

## Game types

22 ladders of 10 boards each:

```
main line   EASY -> NORMAL -> { HUGE, EXTREME } -> HUGE x EXTREME (needs both)
magic       NORMAL -> ARCANE -> ORACLE
variants    unlocked by BOARDS CLEARED ANYWHERE, not by each other:
            WRAPAROUND 15 · DUNGEON 20 · CHECKERBOARD 25 · DIAMOND 30 · CROSS 35
            HIVE 40 · PAIRS 45 · RAGGED CAVE 50 · DONUT 55 · SUDOKU 60 · BLIND 65
combined    WRAPPED CROSS needs CROSS and WRAPAROUND; DOMINOES and PACKS need PAIRS
post-game   HUGE x BLIND needs HUGE and BLIND
```

Every type also scales past board 10. The continuation carries each ladder's own schedules on by
their average step per board and clamps them — 64x32, 34% density (30% for the search ladders), lock
depth at `T-1`, HP at the floor the ladder itself chose — and stops where a board would be identical
to the one before it. That lands in very different places: SUDOKU gets three more boards and stops
at its generator's floor, HUGE x EXTREME six because it is already at the wall, and the gentler
ladders run into the thirties. It is unlocked by clearing board 10 and picked with arrows on the
board screen. Those boards are not a separate mode — they are generated by the same code and hold to
the same invariants, and `npm run sim` clears all 598 of them at full HP.

Every type also has a **Full Run**, unlocked by clearing that type's board 10: all ten boards back
to back on a single HP pool, healing half the pool after each board you clear. Level, EXP and mana
reset on every board — thresholds are `C_k` of a *specific* board, so carrying a level forward would
make every board after the first free — which leaves HP as the only thing that crosses a boundary.
That reset is also why the zero-damage guarantee survives the chaining, and `npm run sim:run`
checks it does.

Two kinds of gate. A **type gate** ("clear NORMAL") is a readiness claim: that ladder teaches
something this one assumes, and a combined type needs both of its parents. A **board-count gate**
("clear 25 boards, anywhere") is a claim about time served, and it is what the counted variant
ladders use — they do not teach each other, so chaining them only forced a player who wanted the
ragged cave to grind three shapes they had no interest in first. Every cleared board counts once,
scaling boards included.

The cut-out shapes — DONUT, CROSS, WRAPPED CROSS, DIAMOND, RAGGED CAVE and DUNGEON — carry
ARCANE's loadout as well: Reveal, Census, and 75 starting mana. DUNGEON also carries **Exercise**.

DUNGEON is the one of those whose density was derived by measurement rather than inherited, and the
only one with rules of its own. Its map has three kinds of cell. A **room** is somewhere creatures
live. A **hallway** is one cell wide and always empty. A **doorway** — the room cell a hallway
arrives at — is empty too. So a corridor is somewhere you can always walk, and stepping off one into
a room is the moment you are exposed.

You also **crawl** it: you may only open a cell, or cast a targeted spell on one, within two steps of
ground you have already uncovered — counted as a walk, so it stops at a wall rather than reaching
through one. The cursor turns red over anything out of reach.

Two things pull against each other here, and the schedule is where they settle. A wall stops
information dead, so a room is a small board of its own: its numbers say nothing about the next room,
and a forced guess becomes a guess on what is in front of you rather than on the cheapest square
anywhere. But the empty corridors and doorways are a large free scaffold — the corridors cascade
open, and every doorway is a read into the room beyond. The second effect is the bigger one, which is
why the nominal density runs **13–26%**, well above the other shaped ladders. Creatures are packed
into room floor alone, so the rooms themselves play at 14–32%; that second figure is the one to check
against the 34% the rest of the game treats as a ceiling.

The result is a ladder of many cheap guesses rather than few expensive ones: a deductive player is
cornered 0.5 times on board 1 rising to 5.4 on board 10 — about ARCANE's rate — but still clears 83%
of board 10, because a doorway means the cell you are forced onto is usually one you know something
about.

It is also by a distance the ladder where Reveal is worth the most, because what it buys is a
foothold in the room you have been forced into, and the ring of cleared ground it leaves pushes your
reach — so a Reveal is how you get into the next room as well as how you see it.

Exercise is on that ladder for the same reason. A forced guess there is a guess on what is in front
of you, so what you want is not to avoid it but to survive it. It is the best spell in the game per
cast (0.91 HP against Reveal's 0.94) and the worst per mana (0.006 against 0.013), because it costs
twice as much.

The crawl rule carries one stated exception, and it is what keeps the zero-damage guarantee true:
**the dungeon never forces a fight you cannot win for free.** If the frontier is ever walled in by
creatures above your level, the radius lifts until something within reach can be opened at no cost.
Measured at reach 2, five boards in 2,280 ended walled in without it; with it, none in 5,700.

CHECKERBOARD is the gentlest of the variants and the only one that hands the player a rule rather
than taking something away. The board is coloured like a chessboard and a creature's tier decides
which colour it may stand on: **even tiers on the light squares, odd tiers on the dark.** Empty
ground goes anywhere, which is what keeps it a sweeper — pin tier 0 to one colour and every square
of the other is provably occupied before the first click.

Because a cell's number is a *sum*, that rule reaches much further than "this square is one of four
tiers". The light cells behind a number always total an even number, so **the whole parity of a
number belongs to its dark neighbours**, and a number with one covered dark square and an even
hidden sum has just proven that square is empty ground — at any level, without knowing anything
else about the board. Sweep acts on it, for the reason Census was eventually taught to: a rule the
game cannot act on is one the player has to translate into marks by hand.

The two colours carry within one creature of each other, so neither half is the easy half. That is
a constraint on the *quantities* rather than on placement — odd tiers have nowhere to go but the
dark squares — so `ladders.py` apportions each parity its own half of the creature budget, and it
is why the ladder runs six tiers instead of five: at five, three tiers are odd and two are even, so
the even pair would carry half the board between them and the distribution would buckle.

The density is the only dial that moved, and it moved a long way. At NORMAL's own schedule the
honest player from `sim:spells` was cornered 0.0 times on board 1 and 0.6 on board 10 and cleared
the whole ladder — a ladder with nothing in it. Walked up until the curve matched HIVE's, it lands
at **27.5–38.5%**: 0.3 forced guesses a board rising to 2.9, against HIVE's 0.3 to 2.8. That is
past the 34% the rest of the game treats as a ceiling, and deliberately so — 34% was measured where
a covered cell could be any tier, and here its colour has already ruled out half of them. The clear
rate falls much more slowly than HIVE's, 92% of board 10 against 80%, because a guess whose parity
you already know is a cheaper guess. More guesses, each worth less — which is DUNGEON's doorway
finding arrived at from a completely different direction.

SUDOKU is the odd one out. Its tiers obey Sudoku's rules over the digits 0-8, which fixes the
quantities at nine of each and so fixes `C_k` on all ten boards — density, tier count and
distribution stop being dials, and the ladder is tuned on how many cells you are told up front.
Tier 0 is a digit like any other, so exactly one cell per row, column and box is empty ground, and
those nine cells are the opening. Every board is generated guess-free, which no other ladder can
promise.

## Third-party reference

`design/original-reference/` holds the original game's client source, used to verify the
mechanics because its published description is incomplete and partly wrong. It is **reference
only** — third-party code that must never be copied into Creature Sweeper or included in a
build. It is excluded from version control by `.gitignore`; see the README in that folder.

`game_types.pdn` and `design/screenshots/` are screenshots of the original game, kept locally
for the same purpose and untracked for the same reason: they are hojamaka's expression, not
ours, so they are not ours to publish or to license.

Facts and formulas observed in any of it are fine to use, and are all written up in the design
reference. Expression is not. That line is not a courtesy — game mechanics, rules and formulas
carry no copyright, so the tuning identity, the EXP curves and every measured finding here are
ours free and clear however directly they were derived from watching the original. Only
expression is protected, and none of it has been taken.

## Licence

Two licences, because this repository holds two different kinds of work.

**Code** — everything under `src/`, `test/` and `design/*.py`, plus the build and config files —
is licensed under the **GNU General Public License v3.0**. See [`LICENSE`](LICENSE). If you fork
it and distribute your version, your source has to be available under the same terms. The whole
point of a freeware remix is that what comes after it stays free too.

**Design research** — `README.md`, `CLAUDE.md`, `design/page.template.html`, the generated
`design/reference.html` and the ladder data under `design/data/` — is licensed under
**Creative Commons Attribution-ShareAlike 4.0 International**. See [`LICENSE-DOCS`](LICENSE-DOCS).
Use the findings, quote them, build on them; credit this project and keep your version under the
same licence.

**Neither licence covers the third-party material described above**, none of which is in this
repository. Creature Sweeper is an independent implementation, not affiliated with or endorsed by
the author of mamono sweeper.
