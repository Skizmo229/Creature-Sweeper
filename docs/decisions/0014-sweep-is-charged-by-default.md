# 0014. Sweep is charged by default, and easier settings record nothing

2026-09-21. Status: adopted.

## Context
With Sweep always on, no setting of the dial could be easier than default. Charging it (ten
hand-opened cells a sweep) inverted that: `'on'` became unlimited access to a rationed tool.

## Decision
Each gameplay dial has a direction (`isAtLeastAsHard`); Sweep ranks off > charge > on, with the
charge count compared too. Harder records normally; easier records no clear, no unlock, no best
time, and the settings screen, the ladder list and the clear overlay all say so. Only hand-opened
cells bank a charge, a cascade is one click, and the gate is in `Game.sweep`.

## Consequences
A blanket "modified" flag would have punished a player at HP x0.5. The alarm if the default is ever
flipped back is the test that a fresh board on the default has no sweep banked.
