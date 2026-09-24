# Extending the game: checklists

Each list is every place a change has to reach, in the order to make it. They were built by
walking the code for three concrete tasks and writing down everything that had to be touched; the
counts at the top are what those walks measured before Milestone 3, and shrinking them is what the
milestone's phases 2 and 3 are for. Until then, the lists are the map.

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
   `board.ts`.
3. If the spell gives information, teach `Game.safeCells` to act on it, or the player has to
   translate the answer into marks by hand (Census's original failure). A spell must never remove
   a creature or skip its EXP (`docs/invariants.md`, fact 3).
4. **Ladder data.** Add it to the `spells` list of each type that offers it in
   `design/ladders.py`, regenerate `ladders.json`, and update the type blurbs that name spells.
   Starting mana is "one Reveal exactly"; a spell cheaper than Reveal changes what the opening
   pool means.
5. **UI.** The button, the shortcut, the hint and the sound come for free from `SPELLS`. Anything
   the spell draws needs a draw pass in `BoardView` beside `drawCensus`, and a colour in `theme.ts`
   that stands apart from the palette's annotation colours.
6. **Measurement.** `src/sim/honest.ts` needs a policy for when to cast it and how to read its
   answer (an unknown targeted spell is currently aimed like Census); `src/sim/spellvalue.ts`
   needs a column. Without these its price is a guess.
7. **Tests and docs.** A block in `test/spells.test.ts`; the affordability test reads the data.
   `docs/glossary.md`, the README's controls line, the design reference's spell table.

## Adding a placement rule (about 19 files today; phase 3 makes it one)

1. Add the name to `Placement` in `src/engine/types.ts` and a module beside `pairs.ts` and
   `packs.ts` with: the chooser/dealer, a fault finder for tests, the pencil's candidates, and the
   Sweep proof.
2. `generateGrid` in `board.ts`: deal through the rule. The rule decides where, never how many.
3. `Game.safeCells` and `Game.noteCandidates` in `game.ts`: fold the proof and the candidates in.
   A proof that claims EMPTY is a free sweep into a creature if it is ever wrong; the test that
   matters is "never calls a creature empty, whatever is open".
4. `readPlacement` and the per-rule validators in `config.ts`: refuse a board that would generate
   perfectly and quietly not be the mode (a quota that does not divide, an odd cell count, a
   wrapped or hex board the rule cannot live on).
5. `isPaired` / `isPacked` in `pairs.ts` / `packs.ts` if the rule belongs to one of those
   families; otherwise every site that asks them (the generator, both proofs, the honest player,
   the renderer's bonds and hover suppression) is a site to check.
6. `src/sim/honest.ts`: teach the honest player the rule, or the ladder is tuned against a player
   who cannot see it. `src/sim/solver.ts` reads candidates through `noteCandidates` and needs a
   change only for a proof that is not local to one creature's neighbours.
7. `src/ui/boardview.ts`: shading, bonds, whether to hide a beaten creature's number.
8. **Ladder data.** A type in `design/ladders.py` (its distribution path if the rule fixes the
   distribution), an unlock slot on the counted schedule, and the per-ladder tables: `theme.ts`
   (palette and identity), `typefaces.ts` (a face of its own, which today means a new bundled
   font, `@font-face` and licence line; see issue #5), the exact ladder count in
   `test/invariants.test.ts`, the lists in `test/unlocks.test.ts` and `test/candidates.test.ts`.
9. Tests: a `<rule>.test.ts` beside `pairs.test.ts` (the rule holds on every board, the quota
   lands, the proof never lies), and regenerate `ladders.json`, `placement-rules.json`,
   `opening.json` and the reference page.
10. `docs/modes.md`: a section saying the rule, the proof, the pencil, and what breaks it.

## Adding a shape

1. Add the name to `BoardShape` in `types.ts` and the predicate (or generator) in `board.ts`,
   reached through `buildShape`. Parameterise in cells, never in fractions of the board.
2. If the shape is seeded (like the cave and the dungeon), its parameter is the exact cell count
   and the generator must spend exactly that many; `ladders.py` chooses the count per board.
3. `ladders.py`: `shape_present` / `shape_cells` carry a copy of the predicate so the generator
   can apportion creatures; the test `leaves exactly the cell count the ladder was tuned against`
   guards the two copies.
4. Connectivity must be asserted: the opening reveals one region.
5. The continuation refuses a candidate whose `C_k` went backwards; check the shape's cell count
   is monotone in the box, or the ladder stops early.
6. `drawSilhouette` and `drawSeams` in `boardview.ts` work from the mask; check a wrapped edge.
7. Measure it (`sim:spells` against a reference ladder's curve) rather than reasoning about it.

## Adding a ladder (type)

1. A `dict` in `TYPES` in `design/ladders.py`: id, name, tint, archetype, axis, blurb, and the
   ten-element schedules. Regenerate `ladders.json`.
2. An unlock: `requires`, or a slot on the counted schedule (`UNLOCK_BOARDS`, steps of five), or
   `requires_runs`. `test/unlocks.test.ts` fails if a save can be stranded.
3. `theme.ts` (palette, `TYPE_IDENTITY`), `typefaces.ts` (`TYPE_FONTS`), and the ladder count in
   `test/invariants.test.ts`.
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
2. A row in `settingsscreen.ts`, as a gallery of real boards where the setting is visual, with the
   "game type default" option naming what it resolves to.
3. `BoardDisplay` in `boardview.ts` if the renderer reads it, and `App.boardDisplay`.
4. `test/preview.test.ts` if it has an example board.
