# 0080. The save survives a version it cannot read, and a code says which version wrote it

2026-09-29. Status: adopted. Follows 0022 and 0060.

## Context
`Progress.load` read a save it could not parse, or one whose version was not 1, as a fresh start,
and the first write, which the first visit's rules card makes at once, overwrote it: a damaged
save, or one a newer build had written, was gone. The backup (`CS1:`) and statistics (`CST1:`)
codes carried a format version and a date but not the game's version, so a code from a tester
could not be told from a build. Both were findings of the pre-release audit of 28 September 2026.

## Decision
A stored value this build cannot read is set aside under its own key (`keptKey`, the store's key
with `.unreadable`) as it loads, before anything can write, and the fresh save takes its place;
the ladder list says so until Reset progress, which clears the kept value with the rest. The play
statistics are kept the same way. Both codes carry `game`, the version that wrote them, given by
the backup screen so the code modules stay free of `package.json`; a decoded code returns it, the
restore question names it beside the date, and the statistics reader prints it. A code from
before is read as it was.

## Consequences
Nothing a player had is erased by an update or a corruption; what this build cannot read waits
where a later build, or a person with the browser's storage open, can reach it. A build that
raises the save's version should read the kept key as well as the live one, since the older build
in between will have started afresh. The kept value is not exported: the backup code carries only
what parses. `test/ui/setaside.test.ts`, `test/savefile.test.ts` and `test/telemetry.test.ts`
hold the rules.
