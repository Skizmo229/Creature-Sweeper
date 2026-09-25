# 0029. Placement rules are records in a registry, and readers ask the rule

2026-09-24. Status: adopted. Supersedes 0011.

## Context
Placement was dispatched by name at 53 sites in 14 files, and each rule module exported a different
set of functions with different signatures, so there was no shape a new rule could copy. `isPaired`
and `isPacked` (0011) closed the two families, but a third family, or a reader that forgot to ask,
would still have been handed a board with none of its mode's deduction, silently. The refactoring
plan's walkthrough measured about 19 files to touch to add a rule.

## Decision
Every rule is a `PlacementRule` record (`src/engine/placement/rule.ts`), one module per rule, and
`RULES` in `registry.ts` is keyed by the whole `Placement` union. The contract covers everything a
reader needs: `validate` and `opening` (config), `deal` (the generator), `candidates` and
`coveredCanBeEmpty` (the pencil), `guessFree`, `cap`, `ringProof` and `emptied` (Sweep, the honest
player and the solver), `display` (the renderer), `pools` and `groups` (the instruments), and
`fault` (the tests). No reader outside the folder compares a placement's name, except the
placement experiment's scatter baseline. DOMINOES and CONGO LINE take their family's hooks by
reference, so the two cannot disagree.

## Consequences
A rule missing a hook, or a `Placement` name without a rule, is a compile error, and
`test/placement.test.ts` deals every board of every ladder and holds each rule to its quota and
its own fault finder. `groups` is the one place a family is named, for the honest player, which
reasons about a pair's partner and a pack's last member beyond what the hooks expose. Adding a
rule is now the checklist in `docs/extending.md`. The shape registry and the per-ladder
presentation record, the other two items of the plan's phase 3, are not done.
