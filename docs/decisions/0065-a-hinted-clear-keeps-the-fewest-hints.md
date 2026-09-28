# 0065. A hinted clear keeps the fewest hints until a best time exists

2026-09-28. Status: adopted. Amends 0048.

## Context
Decision 0048 made the best time the whole cost of the tutor: a hinted board is cleared and
unlocks the next, but writes nothing else. A player who needs the tutor on a board therefore
clears it and sees "Not cleared" on its tile, with no mark of how it went and nothing to improve
on. The owner asked on 28 September 2026 for a hinted clear to record how many hints it took
when no best time is set.

## Decision
A hinted clear with no best time on record keeps the fewest hints any clear has taken
(`fewestHints`, on a board's record and on a Full Run's), and the tile shows it where a best time
would go ("best 2 hints"). A clear without hints sets a best time and retires the hint count; a
hinted clear never touches a board that already has a best time. `recordClear` and `recordRun`
take the hint count rather than a flag.

## Consequences
The best time is still the tutor's only cost: a hint count is shown only where there is no time
to lose, and the first clear without hints replaces it. The field is optional and absent in older
saves, which read as never cleared with hints. The clear card's line is unchanged, since a hinted
clear still sets no best time. Nothing reaches the engine or the simulators; the golden outputs
are byte-identical.
