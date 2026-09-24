# Creature Sweeper: codebase improvement plan

Status: adopted 24 September 2026 as **Milestone 3**. Written for the owner and for the reviewer
who read the code and found it hard to follow; kept for whoever joins later.

Everything numeric below was measured on commit `cd28494` (see Appendix B for how). Nothing in
the codebase was changed while producing this.

**Working agreements for the milestone** (decided 24 September 2026):

- Milestone 3 is all of phases 0 to 6. The targets in section 9 are its definition of done.
- Each step is worked on its own branch, one commit per move, with the full check run before
  hand-over. The owner reviews the diff and merges; nothing reaches `main` unreviewed.
- Code kept deliberately without callers is removed, not preserved. Each removal gets a note in
  `docs/decisions/` saying what it was and why it went; git history keeps the code itself.
- Bugs found along the way and open design questions are tracked as GitHub Issues, drafted here
  and approved by the owner before anything is posted.
- Features are paused until the milestone lands. Tuning changes (playtesting, `ladders.py`) may
  continue in parallel, in their own commits, never mixed with a refactor.

---

## 1. The short version

**Refactor in place. Do not start over.** The architecture is sound and was verified rather than
assumed (section 4). What makes the code hard to read is concentrated in a handful of files and in
where the knowledge lives, and both of those are fixed incrementally, behind the existing 409 tests
and the simulators. A rewrite would spend weeks re-earning that safety net and would arrive at the
same architecture.

**What "hard to decipher" actually is**, in order of weight:

1. **The knowledge is in the wrong place.** 1,793 lines of rules, history and hard-won findings
   live in `CLAUDE.md`, a file addressed to an AI assistant. There is no architecture overview,
   glossary, decisions log or contributing guide for a human. Several load-bearing rules exist
   nowhere else.
2. **Comments are essays.** A third of the source is comment lines, written as argument and
   history rather than as reference. The *what* is buried under the *why*, and some of the numbers
   in them have drifted from the code.
3. **Three god files and one 731-line function.** `App` is 1,896 lines and 52 methods,
   `BoardView` 1,219, `Game` 1,084, and `buildSettingsScreen` is a single function. Everything
   else is fine: 82% of the 579 functions are 25 lines or shorter.
4. **The per-ladder rules are dispatched by scattered conditionals.** Placement alone is branched
   on at 53 sites in 14 files. Adding a rule means finding all of them; CLAUDE.md itself records
   "anything classifying ladders by X" as a bug that has recurred three times.
5. **No hygiene tooling.** No lint, formatter, CI, docs folder or contributing guide. Dead code and
   commented-out code are kept deliberately, which reads as confusion to anyone who did not keep it.

**The plan** is six phases. Phases 0 and 1 (guardrails, then moving the knowledge into `docs/` and
shrinking CLAUDE.md) take about a week, change no behaviour, and are what a reviewer needs before
they can judge anything else. Phase 2 splits the four big files. Phase 3 is the one real design
change: a registry of placement rules behind a common interface. Phases 4 to 6 are ongoing hygiene.

**When:** phases 0 and 1 now, during this feature pause. Phase 2 before the next UI feature. Phase 3
before the next placement rule or ladder. Playtesting does not have to wait for any of it, because
tuning lives in `design/ladders.py` and `ladders.json`, which the plan does not touch until the end.

---

## 2. What the measurements say

### Size

| Area | Lines | Files | Notes |
| --- | ---: | ---: | --- |
| `src/engine` | 6,156 | 18 | headless rules engine |
| `src/ui` | 7,201 | 14 | plus 1,070 lines of CSS |
| `src/sim` | 2,700 | 12 | measurement instruments |
| `test` | 5,839 | 20 | 409 tests, 12.4 s wall clock |
| `design/ladders.py` | 1,316 | 1 | 630 of them one data literal |
| `design/page.template.html` | 2,904 | 1 | the design reference |
| `CLAUDE.md` | 1,793 | 1 | working notes for the AI |
| `README.md` | 401 | 1 | half of it design essay |

Forty-five commits, all between 20 and 22 September 2026. The first commit landed 44,270 lines.
That history explains the style: this was written in three days with an AI pair, and CLAUDE.md is
the pair's external memory. It was never written for a second human reader, and it shows in
exactly the ways the reviewer noticed.

### Function length

| Length (lines) | Functions | Share |
| --- | ---: | ---: |
| 1 to 10 | 340 | 59% |
| 11 to 25 | 136 | 23% |
| 26 to 50 | 66 | 11% |
| 51 to 100 | 22 | 4% |
| 101 to 200 | 13 | 2% |
| over 200 | 2 | 0.3% |

The tail is the problem, not the body. The fifteen functions over 100 lines are listed in
Appendix A; the eight worst are `buildSettingsScreen` (731), `solve` (331, sim),
`App.buildGameScreen` (175), `Game.safeCells` (159), `generateGrid` (146), `feasible` (145, sim),
`play` (139, sim) and `App.showTypes` (133).

### Classes

| Class | Lines | Methods | Fields |
| --- | ---: | ---: | ---: |
| `App` (`src/ui/app.ts`) | 1,896 | 52 | 31, 16 of them nullable |
| `BoardView` (`src/ui/boardview.ts`) | 1,219 | 36 | |
| `Game` (`src/engine/game.ts`) | 1,084 | 30 | |
| `Progress` | 203 | 19 | |
| `FullRun` | 143 | 5 | |
| `Settings` | 139 | 14 | |

### Comments

5,432 of the 16,057 source lines are comment lines (33%). By file the ratio of comment lines to
code lines runs from 12% (`sim/topology.ts`) to 293% (`engine/checker.ts`: 29 lines of code,
85 of comment). Inside the long functions: `Game.safeCells` is 77 comment lines to 69 of code,
`BoardView.drawOpen` 56 to 41, `Game.cast` 39 to 73.

Twenty-eight comment lines describe what the code *used to* do. Forty-two cite a measurement.
Three files still call Reveal "25 mana"; it has cost 75 since the reprice.

### Dispatch on ladder dimensions

| Dimension | Branch sites | Files |
| --- | ---: | ---: |
| placement (7 values) | 53 | 14 (engine, sim, ui, ladders.py, tests) |
| wrap | 15 | 3 |
| topology | 10 | 4 |
| search vs battle | 10 | 7 |

`isPaired()` and `isPacked()` hide which placements they cover, so a search for `'dominoes'` finds
almost none of what DOMINOES does.

### Tooling

No ESLint, no Prettier, no CI workflow, no `CONTRIBUTING.md`, no `docs/`, no Python tests. Thirteen
exports are referenced nowhere but their own definition; 61 exported names have no consumer outside
their own file. About 35 lines of commented-out code sit inside `BoardView.drawOpen` and a
commented-out settings row in `settingsscreen.ts`. Sixteen of the twenty test files load the ladder
data themselves and seven re-declare the same "Sweep on" override. `sim/spellvalue.ts` runs its
command line on import.

### Three simulated newcomers

To turn "hard to decipher" into numbers, three independent read-only walkthroughs were run, each
starting from the README as a new contributor with a concrete task. They were not allowed to read
CLAUDE.md until stuck.

| Task | Files read | Files to change | Where they got lost |
| --- | ---: | ---: | --- |
| Add a spell ("Echo") | ~24 | 15 (11 without per-cell state) | shortcut derived from the name collides with Exercise; sims hard-code the spell list; the rule "an information spell must feed Sweep" lives in three prose places, none of them `spells.ts`; four stale "25 mana" comments |
| Add a placement rule ("triads") | ~29 | ~19 hand-edited plus 4 regenerated | 53 branch sites; no common interface between `pairs.ts`, `packs.ts`, `congo.ts`, `checker.ts`; caller lists kept in prose disagree; a new ladder needs a new bundled font because a test demands one per ladder |
| Diagnose "Escape leaves a spell armed" | 6 read, 51 of App's 56 members touched to rule things out | | `App`'s four mode fields written 22 times across seven methods; `onKey` does not know which screen is showing; hint written 58 lines into `refresh` |

All three reached CLAUDE.md last, and all three said the same thing: the code has no checklist for
its own extension points, and the prose that stands in for one disagrees with itself.

---

## 3. Diagnosis

### 3.1 The knowledge is in the wrong place

Design knowledge lives in four places with overlapping content and no map between them: CLAUDE.md
(1,793 lines of gotchas, addressed to Claude), the README (401 lines, half of it essays on DUNGEON,
CHECKERBOARD and SUDOKU), the design reference page (2,904 lines of derivations), and 5,400 lines
of inline comment. Each was the right place for *something*, but nothing says which, so a reader
cannot tell where to look and an author cannot tell where to write.

Some rules that a contributor must not break are stated only in CLAUDE.md. Sampled: "a sweep must
never pay for the next one", "one sound per action, not per event", "every screen rebuild must call
`closeAsk()`", the crawl-rule exception, and the reason `markMode` uses -1. A human who has not
read 1,800 lines of notes will violate one of them, and most of them fail silently.

There is no glossary. The vocabulary is large and specific (ladder, type, board, run, tier, lock
depth, `C_k`, `alpha0`, opening, cascade, mark, pencil, given, census, reach, crawl, placement, shape,
topology, wrap, search board, honest player, complete deducer, stuck point, forced guess, tier-order
player, continuation, Full Run) and a reader meets all of it in the first file they open.

### 3.2 Comments are essays

The comments are the best thing about this codebase and also a large part of why it is hard to
read. They record *why* every decision was made and what was measured to make it, which almost no
codebase has. But they are written as argument and narrative, in one distinctive voice, and they
mix three different kinds of content that want three different homes:

- **What** a function does and its contract. Belongs in a short docblock. Often missing or at the
  bottom of a long paragraph.
- **Why** it is done that way. Belongs near the code, in one short paragraph.
- **History** (what it used to do, what was tried, what was measured, what was asked for). Belongs
  in a decisions log or the design reference, referenced from the code, not inlined.

`Game.safeCells` is the clearest example: 159 lines, of which 77 are comment. The five proofs it
applies are labelled "proven again", "proven a fourth way", "proven a fifth way" and "proven a
third way", in that order. Each would be a ten-line function with a name, and the argument for each
would be a paragraph in `docs/`.

The essays also drift. Reveal is "25 mana" in `game.ts`, `theme.ts` and a test comment; its
measured value is given as 0.39, 0.64 and 0.94 in three places; CLAUDE.md describes a three-part
mana test that the test file says was replaced by two parts. Nothing checks a number in a comment.

### 3.3 Three god files and one 731-line function

- **`src/ui/app.ts`** (1,973 lines) is screens, routing, keyboard handling, HUD refresh, the hint
  line, overlays, the save backup screen, the how-to card, the clock, Time Attack, the board-clear
  celebration, Full Run advancement and persistence. Four mode fields (`pendingSpell`, `markMode`,
  `notesMode`, `tierArmedByPencil`) are written from seven methods and kept mutually exclusive by
  every writer remembering the others. Each screen is a method that wipes the page and rebuilds it,
  so field references outlive the elements they point at (`hud` is never cleared).
- **`src/ui/settingsscreen.ts`** is one 731-line function holding 22 nested helpers. Finding who
  handles Escape there means searching, not reading.
- **`src/ui/boardview.ts`** (1,417 lines) is rendering, layout and zoom, pointer and pinch input,
  font metrics, and the sprite hand-off to the victory effects. The draw passes are already
  separate methods, which makes it the easiest of the three to split.
- **`src/engine/game.ts`** (1,138 lines) is state, the Sweep proof, spell casting, the crawl rule,
  combat resolution and the opening. The proof and the spells are each a self-contained module
  waiting to be cut out.
- **`src/engine/board.ts`** (864 lines) mixes the cell model and adjacency with the cave generator
  and the placement deal.

### 3.4 Ladder dimensions are dispatched by scattered conditionals

A ladder is described by seven independent dimensions (placement, shape, topology, wrap, opening,
search, reach, plus spells and a workout rule). The engine, the renderer, the honest player, the
solver and the ladder generator each branch on them in their own way. Placement is the worst: 53
sites in 14 files, and the per-rule modules (`checker.ts`, `pairs.ts`, `dominoes.ts`, `packs.ts`,
`congo.ts`, `sudoku.ts`) each export a different set of functions with different signatures, so
there is no shape a new rule can copy.

The CLAUDE.md notes record this exact failure recurring: `isPaired` "replaced five separate checks
that would have been five places to hand a domino board none of the mode's deduction, silently";
`isPacked` did the same for CONGO LINE; the unlock graph "only drew ladders it had a hard-coded
position for" and lost WRAPPED CROSS. A registry with a typed interface turns each of those into a
compile error.

Per-ladder presentation is the same pattern one level up: `theme.ts`, `typefaces.ts` and
`TYPE_IDENTITY` are hand-kept tables keyed by ladder id, `test/fonts.test.ts` demands a unique face
per ladder, and `test/invariants.test.ts` asserts there are exactly 24 ladders. A new ladder touches
all of them.

### 3.5 Hygiene

No formatter, so style is whatever the author typed. No linter, so nothing flags the 13 dead
exports or the commented-out blocks. No CI, so the two-pass typecheck and the sims run only when
someone remembers. The design page and `ladders.json` are regenerated by hand with no check that
they were. Test files re-declare their fixtures. `ladders.py` keeps 24 ladders as a 630-line dict
literal and builds boards through a function with thirteen positional parameters, with no tests of
its own; the TypeScript tests are its only check.

---

## 4. What is already good, and must survive

This is the part a reviewer who has only seen the surface may not credit, and it is the reason a
rewrite is the wrong call.

1. **The layering is real and enforced.** Over every import in `src/`, the engine imports nothing
   outside `src/engine`; `src/sim` never imports `src/ui`; `src/ui` never imports `src/sim`. The
   second `tsc` pass compiles the engine, the sims and the tests with no DOM library at all, so a
   stray `window` is a build error.
2. **Strict TypeScript, honestly used.** `strict`, `exactOptionalPropertyTypes`,
   `noImplicitOverride`. One `any` in 16,000 lines; four `as unknown as`.
3. **Boards are pure functions of (config, seed).** `Math.random` appears once, in the UI's
   seed picker. That is why every simulator is a regression oracle, and why this plan can promise
   byte-for-byte verification of each refactor step.
4. **Actions return events.** The renderer and the tests read the same thing, and there is no
   hidden channel between the engine and the screen.
5. **The tests encode the design.** 409 tests, most of them run against the real ladder data, and
   the four load-bearing facts are all covered. Twelve seconds wall clock.
6. **The measurement instruments exist**, and the habit of diffing their output before and after a
   change is already in use (CLAUDE.md records two such diffs). This plan turns the habit into a
   command.
7. **Data flows one way**: `ladders.py` to `ladders.json` to the engine. The engine never
   duplicates a tuning number.
8. **Most of the code is already the right size.** The problem is fifteen functions and four files,
   not the whole codebase.

---

## 5. Why not a rewrite

- A rewrite has to end at the same architecture, because the architecture is correct. The
  headless engine, the one-way data flow, the event model and the seeded determinism are what
  makes the sims possible, and they would be rebuilt as they are.
- The four load-bearing facts all fail silently: a board that violates one still generates, still
  renders, and cannot be finished. The 409 tests and the sims are the only thing that catches that.
  A rewrite starts with none of them passing, and every week until they do is a week the game can
  be quietly broken without anyone knowing.
- The findings in CLAUDE.md and the reference page are tied to this code's names. A rewrite would
  either carry the names across (in which case it is a refactor) or orphan the findings.
- What a rewrite is good for, a fresh conceptual model, is not needed. Nobody has argued the data
  model or the engine API is wrong; the complaint is about legibility, and legibility is repaired
  in place.

The one place a rewrite is *worth reconsidering* is the UI layer, and only after Phase 2. The
"wipe the page and rebuild it" model is workable but makes state lifetime hard to reason about. If,
once `App` is split into screens, that model still hurts, the screens can be re-platformed one at a
time behind the same engine and the same `BoardView`. That is a decision to make with evidence,
after Phase 2, not now.

---

## 6. The plan

Each phase is shippable on its own and leaves the suite green. Sizes are in focused working days
and are estimates.

### Phase 0: Guardrails (2 to 3 days, no behaviour change)

Goal: make every later step verifiable mechanically, so a refactor cannot silently break a board.

1. **CI** (GitHub Actions; the repo is already on GitHub): `npm ci`, `npm run typecheck`,
   `npm test`, `npm run sim -- 3`, and a check that `python design/ladders.py` reproduces the
   committed `ladders.json` byte for byte (the one-way data flow, enforced).
2. **Golden simulator output.** A `sim:golden` script that runs `sim`, `sim:run`, `sim:forced` and
   `sim:spells` at a small fixed seed count over a fixed set of ladders and writes the text to
   `test/golden/`, and a `sim:golden:check` that diffs. The seeds are fixed and the solver's budget
   is a node count, so the output is deterministic. Every refactor PR shows an empty diff. This is
   the single most important item in the plan: it is what lets Phase 2 and 3 move thousands of lines
   with confidence.
3. **Prettier**, `printWidth` 100 to match the existing style, applied in one formatting-only
   commit listed in `.git-blame-ignore-revs` so `git blame` stays useful. Prettier does not reflow
   comments, so the prose is untouched.
4. **ESLint** with `typescript-eslint` recommended rules, plus `max-lines-per-function` (warn at
   100) and `max-lines` (warn at 600) so the tail cannot regrow, and `knip` for unused exports.
5. **Remove the dead code**, recording each removal in the decisions log so "kept on purpose"
   becomes "recorded on purpose": the 13 unreferenced exports (`highestNote`, `soleNote`,
   `noteCount`, `withNote`, `withoutNote`, `seedFromString`, `hasFullRun`, `fullRunHp`, `allBoards`,
   `drawTierBadge`, `isPipShape`, `mixHex`, `neighbourCount`), `Game.started`, the commented-out
   blocks in `drawOpen` and `settingsscreen.ts`, and the `hoverDefeated` plumbing if the setting is
   not coming back. Git history keeps them; a note says where.
6. **`test/helpers.ts`** for the fixtures sixteen files currently re-declare.
7. **`CONTRIBUTING.md`**: setup, the commands, the four facts in five lines each, the PR rules from
   section 8, and the comment style from Phase 1.

Done when: CI is green on `main`, `sim:golden:check` passes, `knip` reports nothing, and a new
clone can run `npm run check` (typecheck, lint, test, golden) with one command.

### Phase 1: Put the knowledge where a human will find it (3 to 5 days, docs only)

Goal: a new contributor can learn the architecture, the vocabulary and the invariants in an hour
without reading CLAUDE.md, and an author knows where each kind of knowledge goes.

Create `docs/` with one file per kind of knowledge:

| File | What goes there | Comes from |
| --- | --- | --- |
| `docs/architecture.md` | the directory map; the one-way data flow; the layering rule and how it is enforced; how a board is built (shape, placement, numbers, opening); how a click flows (BoardView, App, Game, events, refresh); what each `sim:*` measures | README layout, CLAUDE.md "Architecture", new |
| `docs/glossary.md` | every domain term, one paragraph each, linking to the code that owns it | new; terms listed in 3.1 |
| `docs/invariants.md` | the four facts: statement, why, what protects it (test names), what would break it silently | CLAUDE.md "four load-bearing facts", README |
| `docs/decisions/NNNN-*.md` | one short record per decision: context, decision, consequences, measurement if any. Seeded from every CLAUDE.md "gotcha" and every "by request" | CLAUDE.md "Gotchas", the 28 history comments |
| `docs/tuning.md` | the retune workflow (`CS_LADDERS`, candidate files, byte-for-byte diffs), the ceilings, the open questions (never playtested, the lock cliffs, ORACLE 7 to 10, the solver-vs-honest-player gap) | CLAUDE.md "Open decisions" |
| `docs/ui.md` | fonts, effects, settings galleries, the presentation rules | CLAUDE.md UI notes |
| `docs/extending.md` | checklists: adding a spell, a placement rule, a shape, a ladder, a setting. Each is the list the three walkthroughs had to build by hand | the walkthrough reports |

Then:

- **CLAUDE.md shrinks to about 100 lines**: read `docs/architecture.md` and `docs/invariants.md`
  first; the handful of rules specific to AI sessions (no DOM in the engine, never remove EXP,
  measure rather than argue, the heredoc gotcha, nothing that pictures the original game); pointers.
  Nothing is deleted, everything is moved.
- **README becomes a front door**: what it is, how to play and run it, the layout table, the
  commands, links into `docs/`. Its design essays move to `docs/` or the reference page.
- The README's licence section lists `docs/` under the CC BY-SA set alongside CLAUDE.md.
- **The comment style rule** goes into `CONTRIBUTING.md`:
  1. Every exported function, class and type has a docblock of one to three sentences saying what
     it does and its contract.
  2. Why stays beside the code, one paragraph at most, at the decision point.
  3. History ("used to", "was tried", "shipped briefly") goes to `docs/decisions/`, referenced by
     name from the code.
  4. A number in a comment is either a named constant or a measurement dated and attributed to the
     sim that produced it, and measurements live in `docs/tuning.md` or the reference page rather
     than in the code.
  5. No commented-out code.

  As a worked example, the "proven a fourth way, by pairing" block in `safeCells` becomes a function
  `provenByPairing(cell, ring, level)` with a three-line docblock, and its twelve-line argument
  becomes `docs/decisions/0031-pairing-proof-does-not-cascade.md`.

Done when: a reader can answer "where is X decided?" for the twenty glossary terms from `docs/`
alone; CLAUDE.md is under 150 lines; the three walkthrough tasks each have a checklist.

### Phase 2: Split the four big files (8 to 15 days, no behaviour change)

Goal: no file over 600 lines, no function over 100 in the UI and engine, and each file has one
job its top comment can state in a sentence. In risk order, easiest first:

1. **`settingsscreen.ts`** becomes `src/ui/settings/`: `widgets.ts` (section, row, gallery,
   picker, choice row, slider, toggle), one file per setting group (icons, palette, font, text size,
   highlight, strike, sound, clear effect, zoom, gameplay dials), and `screen.ts` that assembles
   them. Pure extraction; the 22 nested helpers become module functions.
2. **`game.ts`** loses three modules: `sweep.ts` (`safeCells` and `markedSafe`, with the five
   proofs as named functions), `cast.ts` (`cast` and one function per spell), `reach.ts`
   (`inReach`, `sealedIn`, `computeSealed`). `Game` keeps state, `open`, marks, notes, `sweep`,
   `forfeit` and the events. Verified by the tests and the golden diff.
3. **`board.ts`** becomes `grid.ts` (cells, `neighbours`, `computeNumbers`, `inBounds`),
   `shapes/` (masks, the cave generator, with `dungeon.ts` moved in beside it), `generate.ts`
   (`generateGrid`) and `opening.ts`. `neighbours()` stays the one adjacency function.
4. **`boardview.ts`** becomes `src/ui/board/`: `view.ts` (public API and the render pass order),
   `layout.ts` (fit, zoom, pan, pinch, hit-testing), `input.ts` (the pointer handling from `attach`,
   emitting the same four callbacks), `draw/` (one file per pass: covered, open, notes, highlight,
   silhouette, seams, bonds, box rules, census), `digits.ts` (font metrics and the font wait).
5. **`app.ts`** last, because it has no tests. First add a browser-environment smoke test
   (Vitest with `jsdom` on that file only, so the engine tests stay DOM-free; `getContext` stubbed)
   that boots `App`, starts a board, presses keys and reads the hint and HUD text. Then split:
   `app.ts` becomes a router that owns the root, the single key listener, the current screen and a
   modal stack; `session.ts` holds what crosses screens (type, board, seed, game, run, progress,
   settings); `screens/ladders.ts`, `screens/boards.ts`, `screens/howto.ts`, `screens/backup.ts`,
   `overlays/ask.ts`; and `screens/game/` with `screen.ts`, `hud.ts` (`refresh`, the clock),
   `input.ts` (the four mode fields as one object with `armSpell`, `pickTier`, `toggleNotes` and
   `cancel`), `hint.ts`, `outcome.ts` (`finish`, `finishRunBoard`, `celebrate`). Every screen gets
   `dispose()`, so no field outlives its elements.

Each of the five is its own PR, or several. Comments move with the code and get the Phase 1 style
applied as they move. `docs/architecture.md` is updated in the same PR.

Done when: `max-lines` and `max-lines-per-function` produce no warnings in `src/engine` and
`src/ui`; golden diff empty after each step; the UI smoke test passes.

### Phase 3: A registry of placement rules (4 to 6 days; plus 2 to 3 for shapes)

Goal: adding a placement rule is one new file plus one registry line plus ladder data, and
forgetting a hook is a compile error.

```ts
// src/engine/placement/rule.ts
export interface PlacementRule {
  readonly id: Placement;
  /** Config-time checks; throws naming the board. */
  validate(cfg: BoardConfig): void;
  /** Lay the tiers into the grid from the spawnable pool. */
  deal(grid: Grid, cfg: BoardConfig, pool: number[], rng: Rng): void;
  /** Tiers a covered cell may still hold under this rule, or null for any. */
  candidates(game: Game, cell: Cell): number[] | null;
  /** Once-per-sweep precomputation, returning the ring and per-cell proofs. */
  proofs(game: Game): { ringFree(cell: Cell, ring: Cell[]): boolean; cellFree(cell: Cell): boolean };
  /** What the renderer needs: shading, bonds, whether to hide a beaten creature's number. */
  readonly display: PlacementDisplay;
  /** Structural fault finder, so tests loop over every rule. */
  fault(grid: Grid, cfg: BoardConfig): string | null;
}
export const RULES: Record<Placement, PlacementRule>;
```

- One file per rule under `src/engine/placement/`, built from the existing `checker.ts`,
  `pairs.ts`, `dominoes.ts`, `packs.ts`, `congo.ts` and `sudoku.ts`. `isPaired` and `isPacked`
  disappear into the hooks (`pairs` and `dominoes` share a `proofs`; `packs` and `congo` share
  `missingFrom`).
- `generateGrid`, `safeCells`, `noteCandidates`, `readPlacement`, the renderer, the honest player
  and the solver each call the rule instead of branching. Target: the 53 sites become about ten.
- A test asserts every placement named in `ladders.json` is a key of `RULES`, and the existing
  per-rule tests loop over the registry.
- The same treatment for shape (`ShapeRule`: `mask`, `spawnable`, `cellCount`), which `buildShape`
  already half provides, if the placement registry proves its worth.
- Per-ladder presentation (`theme.ts`, `typefaces.ts`, `TYPE_IDENTITY`) folds into one record per
  ladder so a new ladder is one entry, and the "one unique face per ladder" test becomes a decision
  recorded in `docs/decisions/` rather than a surprise.

Done when: the placement walkthrough's 19 files to touch is 8 or fewer; golden diff empty.

### Phase 4: The comment pass (continuous)

Not a big-bang. Every file touched by Phases 2 and 3 gets the style rule applied on the way
through, and `docs/decisions/` grows as history moves out. Files nobody touches are left alone
until someone does. The only up-front item is fixing the numbers that are already wrong (the "25
mana" comments and the three Reveal values).

### Phase 5: Test hygiene (3 to 5 days)

- Unit tests for the modules Phase 2 extracts (each proof in `sweep.ts`, each spell in `cast.ts`,
  `reach.ts`), which are fast and readable in a way the ladder-wide invariant tests are not.
- The UI smoke tests from Phase 2, extended to the Escape and mode cases the walkthrough found.
- Python tests for `ladders.py` (thresholds, `C_k`, the continuation rules) so the generator has a
  check of its own rather than only the TypeScript tests downstream.

### Phase 6: Data and tooling (3 to 4 days)

- `ladders.py`: the 630-line `TYPES` literal becomes a data file (TOML or JSON) with a schema, and
  `board_row`'s thirteen positional parameters become a dataclass. `build()` and `extend()` split.
- `honest.ts` and `spellvalue.ts` derive their spell lists from `SPELLS` instead of hard-coding
  them, and `spellvalue.ts` stops running on import (a `sim/cli/` folder with one entry per sim).
- `README`'s file map is generated or checked against the tree.

---

## 7. Sequencing, and the "when" question

**Now, during the feature pause:** Phase 0 then Phase 1. About a week. They change no behaviour,
they are what the reviewer needs in order to review anything else, and the golden harness from
Phase 0 is the precondition for everything after.

**Next:** Phase 2 in the order given. Do not add UI features until the `app.ts` split lands; a
feature added to a 1,900-line class is a feature that has to be moved twice.

**Then:** Phase 3, before the next placement rule, shape or ladder. Adding one to the current code
costs the 19-file walk the walkthrough measured, and the registry pays for itself on the first rule
added through it.

**Phases 4 to 6** ride along with whatever else is being touched.

**Playtesting does not wait.** The biggest open risk recorded in the notes is that the ladders have
never been played. Every tuning change lives in `ladders.py` and `ladders.json`, which Phases 0 to
5 do not move, and the engine's API (`Game.create`, `open`, `cast`, events) is unchanged by any
phase. Playtest and refactor can run in parallel as long as tuning PRs and refactor PRs stay
separate.

**Whether to restart** is answered in section 5: no. **When it would be revisited**: after Phase 2,
for the UI layer only, with the smoke tests as the measure.

---

## 8. Rules for every refactor PR

1. One PR is one move. No behaviour change, no feature, no tuning. A refactor PR that also fixes
   something is two PRs.
2. Typecheck, lint, tests and `sim:golden:check` pass, and the golden diff is empty or its
   non-emptiness is explained in the PR.
3. Comments move with the code. Nothing is deleted, only relocated to `docs/decisions/` with a
   reference left behind.
4. Pure file moves and renames go in their own commit, so the diff that follows is readable.
5. `docs/architecture.md` and `docs/extending.md` are updated in the same PR when a file moves or
   an extension point changes.
6. The reviewer reviews for legibility, which is the point. A checklist: can you find where X is
   decided in under a minute; does the file's top comment say what the file is; is any function
   over 100 lines; does any comment describe what the code used to do.

---

## 9. Targets

| Measure | Now | Target |
| --- | ---: | ---: |
| Files to change to add a spell | 15 | 6 or fewer |
| Files to read to be confident of that list | ~24 | 8 or fewer |
| Files to change to add a placement rule | ~19 | 8 or fewer |
| Placement branch sites | 53 in 14 files | about 10 |
| Longest function | 731 lines | 100 (warn), 150 (hard) |
| Largest class or file | 1,973 lines | 600 |
| CLAUDE.md | 1,793 lines | under 150 |
| Domain terms defined in one place | 0 | all of them |
| Comment lines describing past behaviour | 28 | 0 |
| Unreferenced exports | 13 | 0, enforced by `knip` |
| CI | none | typecheck, lint, test, sim smoke, ladders regeneration check |
| Time for a new contributor to first PR | unknown | measured with the next one |

The comment *share* is deliberately not a target. The rationale is worth keeping; the aim is to
move it, not to lose it.

---

## 10. Found along the way (not part of this plan)

The walkthroughs surfaced things worth a look, none of which this plan fixes:

- `App.onKey` does not know which screen is showing, and `this.game` is never set back to null.
  With Settings open over a board, Escape appears to cancel the spell on the hidden board, and a
  second Escape runs `leaveGame()`, which discards a single board without asking.
- `toggleNotesMode` can arm a tier while a spell is still armed, against the comment at
  `app.ts:949` that says the two are mutually exclusive.
- `test/fonts.test.ts` requires a unique bundled face per ladder, so a new ladder currently requires
  a new font file, a `@font-face` entry and a licence line. Worth deciding whether that is intended.
- Stale figures: "25 mana" in `game.ts`, `theme.ts` and `test/spells.test.ts`; three different
  values for Reveal's worth; the mana affordability test described differently in CLAUDE.md and in
  the test itself.
- The README's file map omits `app.ts`, `boardview.ts`, `theme.ts`, `progress.ts`, `hexgeom.ts`,
  `pinch.ts` and `savefile.ts`.
- `app.ts:463` and `app.ts:465` both assign `typeId`.

---

## Appendix A: the fifteen functions over 100 lines

| Lines | Comment lines | Function |
| ---: | ---: | --- |
| 731 | 167 | `buildSettingsScreen` (`src/ui/settingsscreen.ts:192`) |
| 331 | 30 | `solve` (`src/sim/solver.ts:172`) |
| 175 | 37 | `App.buildGameScreen` (`src/ui/app.ts:734`) |
| 159 | 77 | `Game.safeCells` (`src/engine/game.ts:242`) |
| 146 | 21 | `generateGrid` (`src/engine/board.ts:599`) |
| 145 | 8 | `feasible` (`src/sim/solver.ts:229`) |
| 139 | 23 | `play` (`src/sim/honest.ts:525`) |
| 133 | 18 | `App.showTypes` (`src/ui/app.ts:321`) |
| 120 | 39 | `Game.cast` (`src/engine/game.ts:866`) |
| 108 | 28 | `App.finish` (`src/ui/app.ts:1694`) |
| 107 | 11 | `main` (`src/sim/spellvalue.ts:122`) |
| 106 | 21 | `App.refresh` (`src/ui/app.ts:1521`) |
| 104 | 0 | `App.showSaveBackup` (`src/ui/app.ts:1025`) |
| 104 | 10 | `BoardView.attach` (`src/ui/boardview.ts:1216`) |
| 103 | 56 | `BoardView.drawOpen` (`src/ui/boardview.ts:1110`) |

The sim functions (`solve`, `feasible`, `play`, `main`) are measurement code and are lower priority
than the engine and UI ones; they are listed for completeness.

## Appendix B: how the numbers were produced

- Line counts: `git ls-files | xargs wc -l` on commit `cd28494`, fonts and binaries excluded.
- Function and class lengths: a script over the TypeScript compiler API (`ts.createSourceFile`),
  counting every function declaration, method, constructor, accessor and arrow function with a
  body. Arrow functions under three lines were excluded.
- Comment lines: lines whose first non-blank characters are `//`, `/*` or `*`.
- Branch sites: `grep` for `placement ===`, `placement !==`, `isPaired(`, `isPacked(`, the seven
  placement names as string literals, `shape ===`, `topology ===`, `wrap ===`, `.search`, `.reach`,
  across `src/`, `test/` and `design/ladders.py`, then read to confirm each was a dispatch.
- Dead exports: every `export` name searched across `src/` and `test/`; "unreferenced" means the
  only hit is the definition.
- The three walkthroughs were run by independent read-only agents given only the task and the
  README as a starting point, with instructions not to read CLAUDE.md until stuck and to say when
  they did. Their file counts are as reported; their line references were spot-checked.
- Baseline: `npm run typecheck` clean; `npm test` 409 passed in 12.4 s.
