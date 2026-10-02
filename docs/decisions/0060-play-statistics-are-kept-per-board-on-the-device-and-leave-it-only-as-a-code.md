# 0060. Play statistics are kept per board on the device, and leave it only as a code

2026-09-27. Status: adopted. The code names the version that wrote it since 0080, and goes into a
play-test report on GitHub since 0085.

## Context
Milestone 4 (`docs/human-tuning-plan.md`) tuned the ladders against the graded player, and found
that on the plain, shaped and placement ladders the instrument cannot fail: a reader who never
misses a move and never trusts a wrong mark clears them all. What those ladders cost a person is
scanning and slips, which nothing measured. Step 4.8 asked for telemetry to calibrate the trick
costs and restate those targets, and the owner asked for it to be built.

Nothing was recorded beyond clears, best times and Full Run attempts, in the save, whose `CS1:`
code is in the wild and must not grow.

## Decision
A third store, `creature-sweeper.telemetry.v1` (`src/ui/telemetry.ts`, `telemetrystore.ts`),
separate from the save and never inside its code. Per board, over every attempt that ended:
attempts, cleared, lost and abandoned; what dealt each death (the tier, or `time`); HP lost;
cells opened by hand; of those, guesses; sweeps; casts; hints; seconds. Attempts on dials at
least as hard as the tuned game and attempts on easier dials are kept in separate buckets, since
only the tuned game calibrates the graded player.

A guess is a cell opened by hand that was not in `safeCells({ useMarks: false })` at that moment:
the honest definition, marks untrusted, the same the `sim:forced` instrument uses. The recorder
(`src/ui/game/recorder.ts`) asks the board before each open, which costs what the Sweep button's
label already costs on every refresh.

A paused board taken up is tallied from where it was taken up; the moves before were tallied in
the session that made them and were never written, since the attempt had not ended. A lesson
board is never tallied. An attempt ends at a clear, a loss or an abandon; a pause is not an end.

The statistics leave the device only as a `CST1:` code on the backup screen, copied by the
player and pasted to the owner, whom `npm run telemetry` gives a table, one row a board, in the
columns `sim:human` reports for the same board. Nothing is sent anywhere. Reset progress clears
them with everything else.

## Consequences
The instrument now has a counterpart: the guess rate and the clear rate of real play on a board,
beside the graded player's at each grade, say what grade a person plays at and how often they
slip. Adding a column means a new field in `BoardStats`, `Attempt` and the reader, and the
version stays 1 while the reader tolerates its absence. Changing the meaning of a column, or the
key, is a version 2 with a migration, as the save's would be. What is still unmeasured is
scanning time per move, which needs a per-move record this store deliberately does not keep.
