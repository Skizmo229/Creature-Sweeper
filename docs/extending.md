# Extending the game: checklists

Each list is every place a change has to reach, in the order to make it. They were built by
walking the code for three concrete tasks and writing down everything that had to be touched; the
counts at the top are what those walks measured before Milestone 3, and shrinking them is what the
milestone's phases 2 and 3 were for. The placement list has been rewritten for the registry; the
others are still the map.

Whatever you add: run `npm run check`, and if the change is meant to alter behaviour, re-record
the golden outputs and say so in the commit.

## Adding a spell (15 files today)

1. **Engine.** Add the id to `SpellId` and an entry (name, cost, `targeted`, blurb) to `SPELLS`
   in `src/engine/spells.ts`. The keyboard shortcut is the name's first letter (`spellKey`), so a
   name that starts with the letter of an existing spell, of `S` (Sweep), `D` (assisted Sweep),
   `N` (entry mode) or `F` (fit) cannot ship; `test/spells.test.ts` fails on a clash with the
   spells and Sweep, and the UI checks the board's keys first.
2. Add a `case` to `Game.cast` in `src/engine/game.ts`. The case must set `detail`. If the spell
   stores anything per cell, add the field to `Cell` in `types.ts` and to `makeCell` in
   `grid.ts`.
3. If the spell gives information, teach `Game.safeCells` to act on it, or the player has to
   translate the answer into marks by hand (Census's original failure). A spell must never remove
   a creature or skip its EXP (`docs/invariants.md`, fact 3).
4. **Ladder data.** Add it to the `spells` list of each type that offers it in
   `design/ladder_types.toml`, regenerate `ladders.json`, and update the type blurbs that name
   spells.
   Starting mana is "one Reveal exactly"; a spell cheaper than Reveal changes what the opening
   pool means.
5. **UI.** The button, the shortcut, the hint and the sound come for free from `SPELLS`. Anything
   the spell draws needs a draw pass in `BoardView` beside `drawCensus`, and a colour in `theme.ts`
   that stands apart from the palette's annotation colours.
6. **Measurement.** `src/sim/honest.ts` needs a policy for when to cast it and how to read its
   answer (an unknown targeted spell is currently aimed like Census), and an entry in
   `SPELL_POLICIES` there, which the compiler asks for and `src/sim/cli/spellvalue.ts` reads its
   columns from. Without these its price is a guess.
7. **Tests and docs.** A block in `test/spells.test.ts`; the affordability test reads the data.
   `docs/glossary.md`, the README's controls line, the design reference's spell table.

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
   visual, with any "game type default" option naming what it resolves to.
3. `BoardDisplay` in `src/ui/board/view.ts` if the renderer reads it, and `App.boardDisplay`.
4. `test/preview.test.ts` if it has an example board.
