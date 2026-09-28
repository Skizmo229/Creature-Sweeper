# 0071. A chord is a sweep of one ring at a sweep's price

2026-09-28. Status: adopted.

## Context
Minesweeper players chord: a click on a satisfied number opens its remaining neighbours. Sweep
is the game's chording, over the whole board and rationed by the charge (decision 0014), and a
click on an open cell did nothing. A chord opens less than a sweep, so the question was what it
should cost, since a free chord would hand out the rationed proof one ring at a time.

## Decision
`Game.sweepAt(x, y)` opens the covered neighbours of one open cell that `safeCells` proves safe,
and nothing beyond them, and is refused wherever a sweep is and on a covered cell. It is a move
of its own (`chord` in `src/engine/replay.ts`), so a paused board replays it. It spends what a
sweep spends: a whole charge, or one of a budget. The click that makes it is a presentation
setting (`chord`, off by default), because it opens nothing a sweep would not and costs the same,
so it can make no board easier and changes no record.

## Consequences
A chord that opens a 0 cascades as any open does, so cells outside the ring can open through
the cascade and never directly; `test/settings.test.ts` holds that. With the setting off a click
on an open cell is still refused by the engine and sounds as one, as it always did. The honest
player and the graded player do not chord; nothing they measure moves.
