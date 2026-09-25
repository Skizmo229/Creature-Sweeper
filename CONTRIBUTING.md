# Contributing

Creature Sweeper is a headless rules engine (`src/engine`), a canvas prototype around it
(`src/ui`), a set of measurement instruments that drive the engine (`src/sim`), and the Python
ladder generator whose output tunes all of it (`design/`). `README.md` is the front door.
`docs/refactoring-plan.md` is Milestone 3, the readability refactor, complete on 24 September
2026: what was measured, what changed and why.

## Setup

Node 22 (`.nvmrc`) and, for the ladder generator only, Python 3 with no packages.

```bash
npm ci
npm run dev
```

## Before handing over a change

```bash
npm run check
```

That is typecheck (twice: the second pass compiles the engine, the sims and the tests with no
DOM library at all, which is how the engine is proven headless), ESLint (a warning fails it, the
size warnings included), knip, the Prettier check, the test suite and the golden simulator
outputs. Each is also its own script:
`typecheck`, `lint`, `knip`, `format` / `format:check`, `test`, `sim:golden:check`.

If you touched `design/ladders.py` or `design/ladder_types.toml`, also run `npm run test:py`: the generator's own tests
(`design/test_ladders.py`, standard-library `unittest`, so still no packages). CI runs them beside
the check that `ladders.json` is what the generator produces.

## The four facts a change must not break

They are covered by `test/invariants.test.ts` and by `npm run sim`, and every one of them fails
**silently**: a board that violates one still generates, still renders, and cannot be finished.

1. **The tuning identity.** `C_k` is the total EXP from every creature of tier at most `k`. The top
   level thresholds equal `C_k` exactly, so those level-ups need every creature of the tier killed.
2. **The zero-damage guarantee.** At level `k` every tier at most `k` is a free kill, which pays
   `C_k`, which reaches level `k+1`. By induction every board is clearable without losing HP, so
   HP is a guess budget, never a combat resource. Nothing may heal inside a board.
3. **EXP must always be collected.** The gates *are* `C_k`, so anything that removes a creature
   without paying its full EXP strands a gate. No spell, item or rule may remove a creature.
4. **A cell's number is the sum of its neighbours' tiers**, not a count. Fewer neighbours means
   easier deduction, which is why edges are information and shapes are easier than rectangles.

## Golden simulator outputs

`test/golden/` holds what fourteen fixed-seed simulator runs print. `npm run sim:golden:check`
re-runs them and diffs. A change that is not meant to alter behaviour leaves every file
byte-identical. A change that is meant to (a retune, a rule change) re-records with
`npm run sim:golden` and says so in the commit message, with the diff as evidence of what moved.

## Refactor rules

1. One PR is one move. No behaviour change, no feature, no tuning. A refactor that also fixes
   something is two PRs.
2. Typecheck, lint, tests and the golden check pass, and the golden diff is empty or explained.
3. Comments move with the code. Nothing is deleted, only relocated to `docs/decisions/` with a
   reference left behind.
4. Pure file moves and renames go in their own commit, so the diff that follows is readable.
5. `docs/architecture.md` and `docs/extending.md` are updated in the same PR when a file moves or
   an extension point changes.
6. Review for legibility: can you find where something is decided in under a minute; does the
   file's top comment say what the file is; is any function over 100 lines; does any comment
   describe what the code used to do.

## Comment style

1. Every exported function, class and type has a docblock of one to three sentences saying what
   it does and its contract.
2. Why stays beside the code, one paragraph at most, at the decision point.
3. History ("used to", "was tried", "shipped briefly") goes to `docs/decisions/`, referenced by
   name from the code.
4. A number in a comment is either a named constant or a dated measurement attributed to the
   simulator that produced it; measurements live in `docs/tuning.md` or the design reference.
5. No commented-out code. Git history keeps it.

## Git

- One commit per move, with a message that says what moved and what verified it.
- `git config blame.ignoreRevsFile .git-blame-ignore-revs` makes blame look through the
  formatting-only commits listed there.
- Each change is a branch; the owner reviews and merges.
- Decisions that a later reader might reverse without knowing why go in `docs/decisions/`.
- Nothing that pictures the original game goes in the repository. `design/original-reference/`,
  `game_types.pdn` and `design/screenshots/` are untracked on purpose; see the README's licence
  section for why.
