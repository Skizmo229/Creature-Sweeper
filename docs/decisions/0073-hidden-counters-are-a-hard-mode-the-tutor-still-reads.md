# 0073. Hidden counters are a hard mode the tutor still reads

2026-09-28. Status: adopted.

## Context
The LV buttons say how many of each tier are left, which the catalogue's counting tricks read
(`docs/strategies.md`: the counters, the last of a tier). A hard mode that takes them away was
asked for. The tutor reads the counters through the reader, and its principle is that it sees
what the player sees (docs/teaching-plan.md, section 3).

## Decision
`countersHidden` is a gameplay dial: harder, so it records. The HUD draws the LV buttons as
tiers alone and never dims one for a tier that is gone. The tutor is left reading the counters,
and the setting's help says so: making the reader blind to them would change the instrument the
ladders were tuned against for a mode no measurement targets, and a hinted board sets no best
time whatever the hint read.

## Consequences
On a search board the counters are hidden too, so the marks placed are not counted back. A
player who wants the tutor honest under hidden counters can leave the tutor off; if that proves
wanted, the reader's `counters` would gain an option and the tutor a press without them.
