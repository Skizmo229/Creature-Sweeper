# Extending the game: checklists

Each list is every place a change has to reach, in the order to make it. They were built by
walking the code for concrete tasks and writing down everything that had to be touched. The
placement list was rewritten for the registry and the spell list walked again on 25 September
2026, after Milestone 3; the files and names in every list were checked against the tree that day.

Whatever you add: run `npm run check`, and if the change is meant to alter behaviour, re-record
the golden outputs and say so in the commit.

## Adding a spell (11 files at the simplest, 20 for one like Census)

A spell that only acts, like Beacon, is steps 1, 2, 6, 7 and 8. One that leaves an answer on a
cell, feeds it to Sweep and draws it, as Census does, is every step.

1. **The spell.** Its id in `SpellId` and its record (name, cost, `targeted`, blurb) in `SPELLS`,
   `src/engine/spells.ts`. The keyboard shortcut is the name's first letter (`spellKey`), so the
   name cannot start with another spell's letter or one the board uses: `S` (Sweep), `D` (assisted
   Sweep), `F` (fit) or `N` (entry mode). `test/spells.test.ts` fails on a clash with a spell, `S`,
   `D` or `F`, but not with `N`, which the board reads after the spell letters: a spell named with
   an N would silently take the entry-mode key.
2. **What it does.** Its entry in `SPELL_EFFECTS`, `src/engine/cast.ts`, which the compiler asks
   for, and the function it names: it returns the events and a `detail`, or a `blocked` reason.
   `Game.cast` already makes the checks every spell shares (offered, affordable, on the board, in
   reach) and does the paying. A spell never removes a creature or skips its EXP
   (`docs/invariants.md`, fact 3).
3. **What it leaves on a cell**, if anything: a field on `Cell` in `src/engine/types.ts` and its
   empty value in `makeCell`, `src/engine/grid.ts`, as `census` has.
4. **What Sweep proves from it**, if it gives information, or the player has to turn the answer
   into marks by hand (Census's original failure): a proof in `src/engine/sweep.ts` beside
   `provenByCensus`, and a block in `test/sweep.test.ts`. `safeCells` visits open cells only, so a
   proof about a covered cell needs a pass of its own.
5. **What it draws**, if anything: a painter beside `drawCensus` in `src/ui/board/paint.ts`,
   called from `render()` in `src/ui/board/view.ts` where `drawCensus` is, and a colour in
   `src/ui/theme.ts` clear of the annotation colours and of every look's `hot` (decision 0032).
   The button, the shortcut, the hint and the sound come from `SPELLS` with no more work.
6. **The honest player** (`src/sim/honest.ts`): a policy and its entry in `SPELL_POLICIES`, which
   the compiler asks for. `spendAtStuckPoint` casts a spell that takes no target as it is, aims
   Reveal at the guess and any other targeted spell like Census; teach it the aim if that is wrong.
   If the spell informs, `src/sim/deduce.ts` must read its answer too (`safeToOpen`, `bestGuess`),
   or the ladder is tuned against a player who cannot see it, and the docblock and header of
   `src/sim/cli/spellvalue.ts` name what the deduction reads.
7. **Ladder data.** The `spells` list of each type that offers it, and the blurbs that name
   spells, in `design/ladder_types.toml`; then `python design/ladders.py`. Starting mana is "one
   Reveal exactly", so a spell cheaper than Reveal changes what the opening pool means. Price it by
   measuring (`npm run sim:spells -- 40 <ladder>`) until its HP saved per mana matches Reveal's in
   `docs/tuning.md`. If a ladder in `test/golden/` gains it, re-record with `npm run sim:golden`.
8. **Tests and docs.** A block in `test/spells.test.ts`, whose shortcut test and `magicConfig`
   list every spell (the affordability test reads the data). The README's controls line and test
   count; `docs/glossary.md`: its entry, the Spells entry, and strict Sweep's list if it informs;
   `docs/tuning.md`: the price list and the value table; "the four spells" in
   `docs/architecture.md`; the spell table and status note in `design/page.template.html`, then
   `python design/build.py`; and a decision record for its design and measured price.

## Adding a placement rule (8 hand-edited files with its ladder, from about 19)

The rule itself is two files and a test. The ladder that carries it adds its data, its look,
and the two test lists that pin the ladder set.

1. **The rule.** A module in `src/engine/placement/` ending with a `PlacementRule` record.
   `rule.ts` is the contract, and each member's docblock says what it owes; the compiler lists
   every hook still missing. Start from the nearest rule: `uniform.ts` is the minimum, `pairs.ts`
   a rule with a proof. The members that bite:
   - `validate`: refuse a row that would generate perfectly and quietly not be the mode (a quota
     that does not divide, an odd cell count, a wrapped or hex board the rule cannot live on).
   - `deal`: decides where, never how many; land the quota exactly or throw. The helpers in
     `deal.ts` cover the shuffle-and-take and writing a layout down.
   - `ringProof`, `emptied`, `cap`: a proof that claims EMPTY is a free sweep into a creature if
     it is ever wrong, and none may run away.
   - `candidates`: never refuse the tier a cell holds, and never do the player's deduction
     (decision 0010).
   - `groups`: a rule in the pairs or packs family takes that family's hooks by reference, as
     `dominoes.ts` and `congo.ts` do, so the two cannot disagree.
2. **The registry.** One line in `RULES` in `src/engine/placement/registry.ts`. That line is
   the name: `Placement` is `RULES`'s keys.
3. **The honest player** (`src/sim/honest.ts`) reads the rule through its hooks and `groups`.
   Teach it anything a player can see that the hooks do not carry, or the ladder is tuned against
   a player who cannot see the rule. The solver needs nothing unless a proof is not a reading of
   one cell's neighbours; if it is, it belongs in `emptied`.
4. **Tests.** `test/placement.test.ts` already deals every board of the new ladder and holds the
   rule to its quota and its fault finder, and `test/candidates.test.ts` already walks its pencil.
   Add `test/<rule>.test.ts` for what is particular to it, above all "the proof never calls a
   creature empty, whatever is open".
5. **Ladder data.** A type in `design/ladder_types.toml`, and its distribution path in
   `design/ladders.py` if the rule fixes the distribution; then regenerate `ladders.json`,
   `placement-rules.json`, `opening.json` and the reference page. That is a new ladder too:
   follow "Adding a ladder" below for its unlock, its look, and the ladder count and list in
   `test/invariants.test.ts` and `test/unlocks.test.ts`.
6. `docs/modes.md`: a section saying the rule, the proof, the pencil, and what breaks it.

## Adding a shape

1. A line in `SHAPES` in `src/engine/shape/registry.ts`. That line is the name: `BoardShape` is
   `SHAPES`'s keys.
2. The record. A per-cell predicate goes in `shape/fixed.ts` through `predicateShape`, and is
   parameterised in cells, never in fractions of the board. A seeded shape (like the cave and the
   dungeon) gets a module of its own ending with a `ShapeRule`: `seeded: true`, its parameter is
   the exact cell count, the generator must spend exactly that many, and `refuseHexAndWrap` is
   its `validate` unless it can be argued otherwise. `ladders.py` chooses the count per board.
   `test/shape.test.ts` already holds the new shape's build to its own count.
3. `ladders.py`: `shape_present` / `shape_cells` carry a copy of the predicate so the generator
   can apportion creatures; the test `agrees with the ladder generator on how many cells a shape
   leaves` guards the two copies.
4. Connectivity must be asserted: the opening reveals one region.
5. The continuation refuses a candidate whose `C_k` went backwards; check the shape's cell count
   is monotone in the box, or the ladder stops early.
6. `drawSilhouette` and `drawSeams` in `src/ui/board/overlays.ts` work from the mask; check a
   wrapped edge.
7. Measure it (`sim:spells` against a reference ladder's curve) rather than reasoning about it.

## Adding a ladder (type)

1. A `[[type]]` in `design/ladder_types.toml`: id, name, tint, archetype, axis, blurb, and the
   ten-element schedules (the schema is written at the top of the file and enforced on load).
   Regenerate `ladders.json`.
2. An unlock: `requires`, or a slot on the counted schedule (`UNLOCK_BOARDS`, steps of five), or
   `requires_runs`. `test/unlocks.test.ts` fails if a save can be stranded.
3. An entry in `LOOKS` in `src/ui/looks.ts`: palette (with a pip shape of its own), face, sound
   pack and clear effect, with the reason for each. The face is any bundled one; a ladder may
   share a face with another (decision 0031), so no new font is needed. `test/fonts.test.ts`
   fails until the entry exists. Then the ladder count in `test/invariants.test.ts`.
4. The reference page's unlock graph places type-gated variants by rule; a counted one needs its
   lane entry.
5. Measure it against the ladder it is nearest to.

## Adding a gameplay dial

1. `GameplaySettings`, `DEFAULT_GAMEPLAY` and a direction in `isAtLeastAsHard` in
   `src/engine/settings.ts`. A dial may never reach EXP, a threshold, or whether a creature dies
   and pays out.
2. Apply it in `Game` unconditionally (a Full Run passes the unscaled pool for this reason).
3. `test/settings.test.ts`: the tier-order player must still clear every battle ladder without
   being hit at the dial's harshest setting, and end on the same EXP and level.
4. The settings screen row, and the three places that say "easier than the tuned game records
   nothing".

## Adding a presentation setting

1. `PresentationSettings`, its default and its reader in `src/ui/settings.ts` (the reader ignores
   unknown keys, so old saves need no migration; a retired setting can simply go).
2. A row in `src/ui/settingsscreen/` (`look.ts` for a setting that is drawn, `effects.ts` for one
   that plays itself), called from `screen.ts`, as a gallery of real boards where the setting is
   visual, with any "game type default" option naming what it resolves to. An example board is
   drawn at `ctx.chipCell` (or `ctx.demoCell`), never at `CHIP_CELL` itself, so the preview size
   reaches it.
3. `BoardDisplay` in `src/ui/board/view.ts` if the renderer reads it, and `App.boardDisplay`.
4. `test/preview.test.ts` if it has an example board.

## Adding creature-icon symbols, and a font to draw them

The custom icon's symbols are a table, and the faces that draw them are cut from it (decision
0035), so a symbol needs no code.

1. Its entry in `src/ui/pipsymbols.json`, in the set it belongs to: its position in that font
   (null in Dingbats), its code point, and its Unicode name in sentence case. A new set is a new
   entry in `sets`, which becomes a tab; a set laid out other than as a Wingdings font or the
   Dingbats block needs its chart position worked out in `settingsscreen/symbols.ts` (`position`).
2. If none of the four sources draws it, an open-licence font that does (SIL OFL, as every
   bundled face is): add it to the sources in `scripts/pip_symbols.py`, after the others, with
   its output file's name in `NAMES` and its URL in the docstring.
3. Rebuild the faces: `python scripts/pip_symbols.py` with the sources in order (fontTools and
   brotli needed). It fails if any symbol is in none of them, and rewrites `src/ui/pipfont/`.
4. A new source's copyright line in `public/FONT-LICENSES.txt`, and its file in `SOURCES` in
   `test/pipsymbols.test.ts`, whose counts change with the table.
5. Look at it drawn: a symbol is scaled by its measured ink, but a very wide or very fine one can
   still read poorly at a thumbnail's size, and the gold halo on tiers 6 to 9 strokes its holes.
