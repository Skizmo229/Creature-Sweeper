# 0064. A Wait on PATROL costs a second

2026-09-28. Status: adopted. Amends 0040.

## Context
PATROL's Wait lets the creatures take a step and does nothing else. It shipped free while the
ladder was tested (decision 0040), and free, it is the answer to every stuck point: wait until a
creature walks off the cell you need, at no cost. The owner asked on 28 September 2026 for every
Wait to put one second on the timer.

## Decision
`BoardActions.doWait` puts `WAIT_SECONDS` (1) on the board's clock before it makes the move,
through `BoardClock.addSeconds`, which moves the clock's start back a second. The engine owns no
clock, so the price lives with the clock, in the UI; the move itself is unchanged, and a replayed
game's moves carry no time. The Wait button, the hint line, the blurb and the field guide say what
it costs.

## Consequences
Moving the start back rather than keeping a tally means everything that reads the clock sees the
second with nothing else taught: a paused game keeps it (it is charged before the move, so the
keeper's write after that move already holds it), a Full Run carries it to the end of the run, the
play statistics count it in the board's seconds, and Time Attack's countdown loses it, so a wait
can run the clock out on the next frame. It costs time, never HP, so the zero-damage guarantee and
every simulator figure stand (the simulators keep no clock); the golden outputs are byte-identical.
The lever, if a second is too cheap to change how the ladder plays, is the constant.
