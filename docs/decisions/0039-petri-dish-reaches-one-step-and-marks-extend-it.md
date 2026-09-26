# 0039. PETRI DISH reaches one step, and a mark beside open ground extends it

2026-09-25. Status: adopted.

## Context
The owner asked for a round board that starts with three separate openings and on which a player
may only click a cell next to a revealed one, and then asked that marked cells count as revealed
for that purpose. `config.ts` refused a reach of 1 outright: at one step the board advances a ring
at a time and no deduction can be acted on until the cascade arrives beside it, a different game
that should be chosen on purpose rather than reached by decrementing a number.

Marks counting as revealed has a hole: the game can never check that a mark is right without
telling the player whether it is, so a player could mark a frontier cell, then the next one past
it, and walk marks across the whole dish, switching the rule off. Asked, the owner chose that a
mark counts only while it touches uncovered ground.

## Decision
A ladder may set `reach_marks`. On it a covered, marked cell counts as uncovered ground for reach
while it is itself within reach of ground really uncovered (`withinReach` in `reach.ts`), so it
carries the reach one step past a named creature and marks never chain. A reach of 1 is accepted
only with `reach_marks`, and `reach_marks` only with a reach. The sealed-in exception
(`computeSealed`) reads open ground alone: if marks counted there, marking a cell and watching the
rule lift would reveal what lay past it. The opening is a new rule, `'islands'`: the three largest
zero-regions (`findOpenings`), which are separate by construction.

## Consequences
Measured on the dish at HIVE's schedule (honest player, 60 seeds, 25 September 2026), both rules
make the board gentler: stuck 22.3 times over the ladder as a plain circle, 6.5 with the islands,
14.6 with the one-step reach, 4.6 with both, clearing 99.8%. A guess is always a frontier cell
beside numbers, so it is cheap. PETRI DISH ships two density points above HIVE's schedule, on
HIVE's forced-guess curve (11.5 stuck against 12.2, 150 seeds), and still clears 99.9%; HP is the
lever if it should be deadlier. The honest player marks what it proves, so it uses the extension
as a player would. The zero-damage guarantee is held by the same exception as DUNGEON's, and
`test/invariants.test.ts` clears every PETRI DISH board without damage.
