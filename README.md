# Creature Sweeper

A remix of [mamono sweeper](https://hojamaka.com/games/mamono_sweeper/) (itself a remix of
Minesweeper) with heavy customisation, quality-of-life features, and a progression mode. Every
cell's number is the **sum** of the neighbouring creatures' tiers, you level up by defeating them,
and a fight at or below your level costs nothing. It is free to play, and its code is free
software (see [Licence](#licence)).

## Play it

Creature Sweeper is free to play in the browser on itch.io. Progress is saved in the browser;
**Back up / restore save**, on the list of game types, copies the whole save as a code to keep or
to carry to another browser.

Three rules:

1. **A number is a sum, not a count.** It adds up the tiers of the creatures around it: a 9 might
   be a 5 and a 4, or three 3s.
2. **Anything at or below your level dies for free.** Stronger creatures fight back.
3. **HP is a guess budget.** Every board can be cleared without taking damage. You spend HP only
   when you guess.

The game teaches the rest: a school of nine lessons, a field guide, and a tutor that shows the
next provable move and why. The same tricks, graded, are in
[`docs/strategies.md`](docs/strategies.md).

### Controls

| Action | Key or mouse |
| --- | --- |
| Open a cell | click |
| Mark a cell | right-click, Control-click, a long press on a touch screen, or a LV button then a click |
| Mark or pencil the cell under the cursor | a number key, as the Entry mode says; `Shift`+number does the other |
| Switch the Entry mode between mark and pencil | `N` |
| See a beaten creature's number (not on PAIRS or DOMINOES) | hover it; `U`, or the **Beaten** button beside Entry, shows every one at once, which is how a touch screen sees them |
| Sweep: open everything proven safe | `S`; no Sweep on EASY or PATROL |
| Sweep, trusting your marks too | `D` or `Shift`+`S` |
| Sweep one number's ring | click the open number, with the chord setting on |
| Cast a spell | its bracketed letter, offered cheapest first: `C`ensus, `A`ugur, `R`eveal, `B`eacon, `E`xercise |
| Ask the tutor for the next provable move and why | `H` |
| Open the field guide, at the tutor's trick if one is showing | `G` |
| Wait a move on PATROL, for a second on the clock | `W` |
| Zoom | scroll, `+` / `-`, or pinch |
| Pan a board bigger than the screen | drag |
| Fit the board to the screen again | `F` |
| Pause: the board, or the Full Run, waits on its tile with the clock stopped; a click on the tile carries on (not in a lesson) | `P` |
| Go on to a lesson's next step | `Enter` |
| Back out: an armed spell or tier first, then the board, asking whether to pause or abandon a Full Run or a game you have made a move in | `Esc` |

### Settings

Two kinds, kept apart.

- **Presentation** touches no rule and never affects a record. Every visual option is shown on a
  real board, and any of a board's look and sound can be chosen for one ladder alone.
  - Look: creature icons (a drawn pip shape, or any of 782 symbols from Dingbats and Wingdings 1
    to 3), a creature as its tier's digit, creature colours, board palette, the board's and the
    interface's fonts, digit and text size, the mark colour, the cursor highlight, how a beaten
    creature is drawn, reach shading on the crawl ladders, zoom, and a Low vision preset.
  - Sound: the pack, the volume, which sounds play, and a sound check that retunes them.
  - Feel: the glow and motion after a fight, the board-clear effect and what holds its card, the
    clock, the hint line, what a right-click and a long press do, whether Back pauses without
    asking, whether play statistics are kept, the chord, and the tutor.
- **Gameplay** dials change the rules: HP, Full Run regen, creature damage, mana regen, mana per
  creature, spell prices, starting mana, how Sweep is gated, hidden counters, Time Attack and how
  far below the best it races, and a time limit per board. Presets: Tuned, Relaxed and Brutal.
- A dial set easier than the tuned game records no clear, no unlock and no best time, and the
  game says so as you set it.

### Game types

35 ladders of ten tuned boards, each with a scaling continuation past board 10 (960 boards in
all) and a Full Run (all ten on one HP pool).

```
start       EASY -> NORMAL
counted     every 5 BOARDS CLEARED ANYWHERE opens the next ladder in each category:
boards      Normal     Shape          Magic     Special
  15        HUGE       WRAPAROUND     ARCANE    HIVE
  20        EXTREME    WRAPPED CROSS  WORKOUT   PAIRS
  25                   CROSS          ORACLE    DOMINOES
  30                   DIAMOND        DUNGEON   PACKS
  35                   DONUT          SEER      CHECKERBOARD
  40                   RAGGED CAVE    AUGUR     CONGA LINE
  45                   PYRAMID                  SUDOKU
  50                   GEAR                     ULTRA HIVE
  55                   CARD                     PETRI DISH
  60                   VALENTINES               PATROL
  65                   STAR                     SPRINKLE DONUT
  70        BLIND
combined    HUGE x EXTREME needs HUGE and EXTREME; HUGE x BLIND needs HUGE and BLIND
```

The menu shows the ladders in those four columns; Normal is the original game's seven modes. The
**Unlock everything** box on the list of game types opens every ladder, board, Full Run and
scaling board at once; clears and best times still count.

The cut-out shapes (DONUT, CROSS, WRAPPED CROSS, DIAMOND, RAGGED CAVE, PYRAMID, GEAR, CARD,
VALENTINES, STAR, DUNGEON) carry ARCANE's loadout; DUNGEON also carries Exercise and the crawl
rule, and PYRAMID starts with its bottom two rows face up and is climbed by PETRI DISH's crawl
rule. SEER is BLIND with Reveal, Census and Beacon: one HP, no fighting, exploration the only
income. AUGUR is ARCANE's boards with Census and Augur, the two spells that only answer
questions, a lock deeper and HP falling from 10 to 8. SPRINKLE DONUT is DONUT's ring with no
spells and every creature shown, two to a sprinkle, so only their levels are hidden; it grows
from one opening under PETRI DISH's rule. What each mode's rule is and what the engine deduces
from it is in [`docs/modes.md`](docs/modes.md).

## Building from source

```bash
npm install && npm run dev
```

Node 22 (`.nvmrc`). Python 3.11 or later, standard library only, for the ladder generator and the
design reference's build. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the rules for a change.

**Where to read next**

| Document | What it holds |
| --- | --- |
| [`docs/invariants.md`](docs/invariants.md) | the four load-bearing facts every change has to respect |
| [`docs/architecture.md`](docs/architecture.md) | the map, the data flow, how a board is born, how a click flows |
| [`docs/modes.md`](docs/modes.md) | each ladder's rule, what the engine proves from it, how it was tuned |
| [`docs/tuning.md`](docs/tuning.md) | the simulators, the retune method, the open questions |
| [`docs/ui.md`](docs/ui.md) | presentation rules: settings galleries, fonts, effects, sound |
| [`docs/extending.md`](docs/extending.md) | checklists for adding a spell, a placement rule, a shape, a ladder, a setting |
| [`docs/decisions/`](docs/decisions/README.md) | why things are the way they are, one record per decision, with an index |
| [`docs/glossary.md`](docs/glossary.md) | the vocabulary |
| [`docs/strategies.md`](docs/strategies.md) | how a person clears a board: the tricks, graded, for players and for the graded player |
| [`docs/refactoring-plan.md`](docs/refactoring-plan.md) | Milestone 3, the readability refactor (complete): what was measured and what changed |
| [`docs/human-tuning-plan.md`](docs/human-tuning-plan.md) | Milestone 4, tuning for the human player: the instrument, the measurements, the retune (closed 27 September 2026, decision 0058); re-measuring against play statistics is left |
| [`docs/teaching-plan.md`](docs/teaching-plan.md) | Milestone 5, teaching the tricks in the game with a tutor, a school and a field guide: built, play-testing left |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | setup, the check, the rules for a change, and how a release is cut |
| [`CHANGELOG.md`](CHANGELOG.md) | what each version changed |
| [`design/reference.html`](design/reference.html) | the design reference, a page to open in a browser: the original game's mechanics as verified, the ladders, the open questions (built from `design/page.template.html`) |

## Layout

```
creature_sweeper/
├─ src/
│  ├─ engine/     the rules engine: no DOM, no I/O, no timers; boards are pure (config, seed)
│  ├─ ui/         the game in the browser: canvas board, HUD, settings, save, sound, effects
│  ├─ sim/        headless measurement, all driving the real engine; cli/ holds the commands
│  ├─ main.ts     browser entry
│  └─ data.ts     Node-only loader for the ladder data
├─ test/          vitest; helpers.ts holds the shared fixtures; golden/ the simulator fingerprints
├─ scripts/       golden.mjs (behaviour-preservation harness), package.mjs (the itch.io zip),
│                 playtest.cmd (double-click: build, zip and play), pip_symbols.py (the icon
│                 symbols' fonts)
├─ public/        served as-is: FONT-LICENSES.txt
├─ design/
│  ├─ ladder_types.toml     each ladder's schedules            <- edit this to tune
│  ├─ ladders.py            generates the progression ladders  -> data/ladders.json
│  ├─ test_ladders.py       the generator's own tests (npm run test:py)
│  ├─ build.py              builds reference.html from the template and data/
│  ├─ page.template.html    design reference source  <- edit this
│  ├─ reference.html        built page                <- generated by build.py, do not edit
│  └─ data/                 generated JSON
└─ docs/          the documentation above
```

`docs/architecture.md` has the file-by-file map. `design/original-reference/`, `game_types.pdn`
and `design/screenshots/` are untracked on purpose (see Third-party reference).

## Commands

```bash
npm run dev               # play it
npm run check             # the six below, as CI runs them; about two and a half minutes
npm run typecheck         #   twice; the second pass has no DOM library (the engine, the sims,
                          #   the tests outside test/ui and what they import)
npm run lint              #   ESLint, failing on any warning; the size warnings are the
                          #   readability bar Milestone 3 set
npm run knip              #   unused files and exports
npm run format:check      #   Prettier, checking only (npm run format rewrites)
npm test                  #   the test suite, including the invariants
npm run sim:golden:check  #   re-run the fixed-seed simulator runs and diff against test/golden/
npm run test:py           # the ladder generator's own tests
npm run sim               # clear every board headlessly (-- 200 for more seeds)
npm run sim:run           # complete every type's Full Run
npm run sim:spells -- 40 dungeon   # what each spell is worth on one ladder, board by board
npm run sim:forced -- 30 oracle    # how many forced guesses a perfect deducer still faces
npm run sim:lethal -- 30 extreme   # whether any of those guesses could kill
npm run sim:human -- 40 normal     # what each board demands of a person, grade by grade
npm run sim:sudoku -- 8 --sweep    # SUDOKU build cost and how tight each board plays
npm run telemetry -- CODE # a player's play statistics (the CST1: code), one row a board
npm run build             # production build (relative paths, for itch.io)
npm run package           # build and zip dist/ into release/
npm run playtest          # package, then open the build in the browser (or double-click
                          # scripts/playtest.cmd)
```

CI runs `npm run check`, the generator's tests, and a check that the committed `ladders.json` is
what the generator produces.

When a schedule changes, run `python design/ladders.py` (it rewrites `design/data/ladders.json`)
and then `python design/build.py` (it rebuilds `design/reference.html`), and commit both. The
opening and placement experiments (`npx tsx src/sim/cli/opening.ts` and `placement.ts`, slow)
write the reference page's other data; run them, then `build.py`, only when what they measure
changes.

In dev, `window.cs` exposes the running app (`cs.play('normal', 3)`, `cs.current`, `cs.sync()`,
`cs.runFull('normal')`, `cs.currentRun`). Stripped from production builds.

## The load-bearing facts

Four findings constrain almost every decision, and all four fail silently. In one line each; the
full statements, what protects them and what breaks them are in
[`docs/invariants.md`](docs/invariants.md).

1. **The tuning identity.** The upper level thresholds equal `C_k`, the total EXP from every
   creature of tier at most `k`, exactly.
2. **The zero-damage guarantee.** Every board is clearable without losing HP, so HP is a guess
   budget, not a combat resource.
3. **EXP must always be collected.** Nothing may remove a creature without paying its EXP.
4. **Numbers are sums, not counts.** Fewer neighbours means easier deduction; edges are free
   information.

## Third-party reference

`design/original-reference/` holds a local copy of the original game's browser client, as its
site serves it, used to verify mechanics because its published description is incomplete and
partly wrong. It is reference only, excluded from version control, and must never be copied into
Creature Sweeper or a build. `game_types.pdn` and `design/screenshots/` are screenshots of the
original, untracked for the same reason: they are Hojamaka Games' expression. Facts and formulas
observed in any of it are free to use and are written up in the design reference; expression is
protected, and none of it has been taken.

## Licence

Copyright © 2026 Skizmo229 and contributors. In the game, the About card on the list of game types
says the same and links here.

**Code** (everything under `src/` but the fonts below, `test/`, `scripts/` and `design/*.py`, plus
the build and config files, `.github/` included) is licensed under the **GNU General Public
License, version 3 or (at your option) any later version** (`GPL-3.0-or-later`). See
[`LICENSE`](LICENSE).

**Design research and documentation** (`README.md`, `CLAUDE.md`, `CONTRIBUTING.md`,
`CHANGELOG.md`, everything under `docs/`, `design/ladder_types.toml`, `design/page.template.html`,
the generated `design/reference.html` and the ladder data under `design/data/`) is licensed under
**Creative Commons Attribution-ShareAlike 4.0 International**. See [`LICENSE-DOCS`](LICENSE-DOCS).

**Fonts** under `src/ui/fonts/` and `src/ui/pipfont/` are not ours: twenty-eight faces from Google
Fonts, and the four Noto faces the creature-icon symbols are cut from, each under the **SIL Open
Font License 1.1**, with every copyright notice and the licence in
[`public/FONT-LICENSES.txt`](public/FONT-LICENSES.txt), which ships beside them in every build.

Neither licence covers the third-party material described above, none of which is in this
repository. Creature Sweeper is an independent implementation, not affiliated with or endorsed by
Hojamaka Games, the author of mamono sweeper. Do play their games.
