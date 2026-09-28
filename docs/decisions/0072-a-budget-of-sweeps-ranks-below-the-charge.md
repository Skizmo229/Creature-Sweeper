# 0072. A budget of sweeps ranks below the charge and records nothing

2026-09-28. Status: adopted. Extends 0014.

## Context
Sweep's modes were on, charged and off, in that order of hardness (decision 0014). A budget of
so many sweeps a board is the natural fourth mode, but three sweeps a board is more than ten
cells a sweep buys on a small board and less on HUGE, so it has no order against the charge.

## Decision
'budget' is a `SweepMode`, with `sweepBudget` sweeps a board, gated in `src/engine/sweepgate.ts`
beside the charge. It ranks between on and charge: harder than unlimited access, not comparable
to the default, and so a dial that cannot be called harder, which records nothing and is named
"Sweep" in the reasons. A sweep that found nothing is not spent, as a charge is not.

## Consequences
A player who wants a budget plays for the boards, not the record book, and the settings screen
says so live. If a later measurement finds a budget that is provably no easier than the charge
on every ladder, the rank can move; the test that a budget records nothing is where it would
have to change.
