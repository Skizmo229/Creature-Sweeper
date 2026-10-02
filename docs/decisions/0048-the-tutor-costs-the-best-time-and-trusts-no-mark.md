# 0048. The tutor costs the best time and nothing else, and trusts no mark

2026-09-26. Status: adopted. A hinted clear keeps the fewest hints until a best time exists since
0065.

## Context
Milestone 5 puts the catalogue of tricks (`docs/strategies.md`) inside the game, first as a tutor:
`H` shows the next provable move on the live board and says why, built on the graded player's
tricks (`docs/teaching-plan.md`, Part 1). Two questions shaped it. What a hint costs: nothing, a
Sweep-like charge, or the record book. And whether the tutor may believe the player's marks, which
the reader subtracts as claims because the graded player writes only proven ones, while a person
writes guesses and the catalogue names the trusted wrong mark as the fatal error.

## Decision
A hinted board is cleared, unlocks the next and may be perfect, but sets no best time; there is no
other cost, no charge and no meter. The tutor trusts no mark: it reads a marked cell as covered
and unknown, and may name it differently from the mark, saying so. A mark the press has itself
proven is believed from then on within that press, and nothing is taught about it. The tutor is
on every ladder, EASY included, and is a presentation setting, not a gameplay dial.

## Consequences
A player asking why is doing what the game wants, so the best-time rule alone keeps the tutor out
of the record book; `recordClear` and `recordRun` take `hinted`. Everything the tutor says is
provable from open cells alone, so it can never expose a player through their own wrong mark.
Believing proven marks was found necessary while building: a tutor that believed nothing re-taught
the player's own correct marks on every press and never got past them. If the cost is ever
revisited, the hint counts per board and per grade are already kept, and are the first telemetry
the tuning plan asks for.
