# 0079. A record remembers the board it was set on

2026-09-29. Status: adopted.

## Context
A board's record (its clear, its perfect, its best time or fewest hints) was keyed by ladder and
rung, `easy#1`, and nothing else. A retune after release, which `docs/human-tuning-plan.md`
expects once play statistics come in, changes what board 1 is, and a best time set on the old
board would stand as the record for the new one: a time nobody could race, or one nobody would
have to. The pre-release audit of 28 September 2026 found it; the owner asked for it fixed.

## Decision
`boardFingerprint` (`src/engine/config.ts`) hashes the config a board is dealt from, FNV-1a to
eight hex digits, and `ladderFingerprint` a ladder's ten boards and its run pool. A clear and a
completed run are stamped with it. A record stamped with another tuning's keeps its clear, which
unlocked what it unlocked, and its run's depth and attempts, and offers no time, no perfect and
no HP, which were another board's; the next clear writes over it. A record from before stamps is
taken as this tuning's, so an update does not empty every tester's record book, and is stamped
by its next clear. The readers (`boardRecord`, `runRecord`) take the ladders table, so the stamp
is checked wherever a record is read: the board list, the clock's Time Attack, the ending.

## Consequences
A retune moves no best time and locks nothing: `boardsCleared` and the unlock chain read the
clear, which stays. The key is unchanged, so saves and codes read as before, and the sim's
statistics (`telemetry.ts`) still key by rung; a code's game version (decision 0080) tells a
retune's before from its after there. The fingerprint is cached per ladders table, since the
board list asks for every board of a ladder at once. Anything that changes `boardConfig`'s
output, a new field included, changes every fingerprint and so retires every time at once;
that is the intended reading of "the board changed", but a field added for another reason
should be added knowing it. `test/records.test.ts` holds the rule.
