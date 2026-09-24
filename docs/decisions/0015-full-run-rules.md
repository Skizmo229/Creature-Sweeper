# 0015. Full Run: level, EXP and mana reset each board; one pool; half heal, rounded down

2026-09-21. Status: adopted (replaced the parked Ironman).

## Context
Thresholds are `C_k` of a specific board, so a level carried forward would arrive at board 2 near
its ceiling. A run-long mana pool would make the late boards the ones where spells are free.

## Decision
A fresh `Game` per board; only HP crosses a boundary; one max HP for the run (`run_hp`, board 1's);
half the pool healed after each cleared board, rounded down, so BLIND's pool of 1 heals nothing
and a run there is a single-mistake run. A run records itself, never its boards, and its clock
starts once. `run.ts` passes the unscaled pool because `Game` applies the HP dial itself.

## Consequences
The zero-damage guarantee survives ten deep (`npm run sim:run`). The heal fraction is a first guess
that only playtesting settles. HP regen as a dial is Full Run only, because healing inside a board
would turn HP into a combat resource.
