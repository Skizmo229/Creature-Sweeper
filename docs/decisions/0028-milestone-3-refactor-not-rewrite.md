# 0028. Milestone 3 refactors in place rather than rewriting

2026-09-24. Status: adopted.

## Context
A reviewer found the code very hard for a human to decipher. Measured: knowledge in the wrong place,
essay comments, four god files, per-ladder rules dispatched by scattered conditionals, no hygiene
tooling. The architecture itself was verified sound.

## Decision
Refactor in six phases behind the tests and a golden-output harness; do not start over. The full
plan, measurements and working agreements are in `docs/refactoring-plan.md`.

## Consequences
Features are paused until it lands. Each step is a branch the owner merges. The one place a rewrite
would be revisited is the UI layer, after phase 2, with evidence.
