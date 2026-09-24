# Creature Sweeper: notes for AI sessions

A remix of **mamono sweeper** (itself a Minesweeper remix) with heavy customisation, QOL and a
progression mode, intended for freeware release. This file is short on purpose: the knowledge
that used to live here is in `docs/`, where a human can find it too.

## Read first

1. `README.md`: what it is, how to run it, the layout.
2. `docs/invariants.md`: the four load-bearing facts. All four fail silently.
3. `docs/architecture.md`: the map, the one-way data flow, how a board is born, how a click flows.
4. `docs/refactoring-plan.md`: **Milestone 3, the current one.** Features are paused until it
   lands; check which phase is current before proposing work.

Then as needed: `docs/modes.md` (each ladder's rule and proof), `docs/tuning.md` (the instruments
and the open questions), `docs/ui.md` (presentation rules), `docs/extending.md` (checklists),
`docs/decisions/` (why things are the way they are), `docs/glossary.md`, `CONTRIBUTING.md`.

## Rules for a session

- **The engine stays headless.** Nothing under `src/engine` touches the DOM, I/O or timers; the
  second typecheck pass has no DOM library and will fail the build. Tests and `preview.ts` are
  compiled the same way.
- **Never remove a creature or skip its EXP**, in any spell, item or rule. Never heal inside a
  board. Never let a gameplay dial reach EXP or a threshold. (`docs/invariants.md`.)
- **Notes can protect the player; they must never expose them.** Read a pencil mask by its
  lowest candidate only.
- **Tuning data flows one way**: edit `design/ladders.py`, regenerate `ladders.json`, never edit
  the JSON. Retune on a candidate file (`CS_LADDERS=path`) and measure before replacing it.
- **Measure, don't argue.** When a simulator can settle a design question, run it. Several past
  findings contradicted the intuition.
- **Run `npm run check` before handing anything over.** If a change is meant to alter behaviour,
  re-record the golden outputs (`npm run sim:golden`) and say so in the commit; otherwise they
  must be byte-identical.
- **Work on a branch, one commit per move; the owner reviews and merges.** Never push. Refactor
  commits change no behaviour and fix no bugs. Bugs found go to GitHub Issues, drafted for the
  owner's approval before posting.
- **Comments say what; a paragraph says why; history goes to `docs/decisions/`.** No commented-out
  code. Numbers in comments are named constants or dated measurements. (`CONTRIBUTING.md`.)
- **Anything that classifies ladders by a property** (placement, shape, spells) has bitten three
  times; go through the existing predicate or, after phase 3, the registry.
- **Anything that drives the game headlessly must know every rule** the player can see (the
  crawl rule, the checkerboard's colours), or it measures a different game.
- **Nothing that pictures the original game goes in the repo.** `design/original-reference/`,
  `game_types.pdn` and `design/screenshots/` are untracked on purpose; rules and formulas are free
  to take, expression is not.
- **Bash heredocs in this environment collapse `\n` escapes** and very long commands are cut off.
  Use the Write/Edit tools for any file with escapes, and split long shell scripts.

## Dev handle

`window.cs` in dev exposes the running app: `cs.play('donut', 1)`, `cs.current`, `cs.sync()`,
`cs.cellSize`, `cs.runFull('normal')`, `cs.currentRun`. Private methods are callable at runtime,
which is the fastest way to verify a UI change from the console. Stripped from production builds.
