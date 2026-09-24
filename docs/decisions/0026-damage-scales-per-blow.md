# 0026. Creature damage scales per blow, and the dials stay clear of EXP

2026-09-21. Status: adopted.

## Context
Whether you survive round three depends on what rounds one and two took, so a damage dial applied
to the total would change which fights are survivable in a way the fight itself never resolved.

## Decision
`resolveBattle` takes a `bite` that defaults to the tier. At level 0 the player cannot reduce the
creature and at bite 0 the creature cannot reduce the player, which is returned as a stalemate
rather than guarded by an arbitrary round cap. No dial may add, remove or re-value a creature.

## Consequences
`test/settings.test.ts` clears every battle ladder at HP x0, damage x3, no mana and no Sweep
without being hit. Anything added to `GameplaySettings` has to clear that first.
