# 0046. SPRINKLE DONUT shows every creature, in pairs that may touch

2026-09-26. Status: adopted.

## Context
The owner asked for a variant of DONUT on the same ring: every creature's cell marked in a colour
of its own, so the player knows where every creature is and has only the levels to find; the
creatures paired as on PAIRS, except that pairs may touch; PETRI DISH's growth rule, starting in
one area and eating round the ring; and a white-iced look with pink sprinkles where the creatures
are. Asked the open questions, the owner chose: pairs as on PAIRS, any two tiers together (over
twins of one tier, or a beaten creature revealing its partner); the Special column, last, opening
at 65 boards cleared; and no spells, since Census would count what the board already shows. The
owner chose the look (vanilla glaze over warm dough) from three drawn options on the same board.

Once pairs may touch, PAIRS's readings go: a creature's number is no longer its partner's tier but
the sum of its partner and any pair beside it. So the pairing says nothing about tiers here; it is
drawn, each pair one sprinkle across its two cells, which is what tells two touching pairs apart.

## Decision
A placement rule, `sprinkles` (`src/engine/placement/sprinkles.ts`): pairs laid greedily among the
cells, a partner any neighbour through `neighbours()`, diagonals included, touching allowed,
tier-blind, each cell told where its partner stands (`Cell.partner`). The rule shows every
creature (`PlacementDisplay.showsCreatures`): the pencil offers empty ground on a plain cell and
any tier on a sprinkle, `emptied` is the plain ground, and `cap` is the Census bound read off the
sprinkles, s - (k - 1) for k creatures under a hidden sum s. The renderer draws each pair as a
sprinkle in the palette's `hot`, over the tiles and under the marks, which is why the board now
draws in passes. The ladder takes DONUT's boxes and ring, no spells, a single opening, and PETRI
DISH's reach of one with marks that extend it.

The instruments are taught what the player sees: the graded player reads the sprinkles at a
glance (`sprinkles`, grade 0) and counts them under every number (the Census bound, grade 1); the
honest player and the complete deducer read the rule's `cap`, `emptied` and pencil.

## Consequences
Showing the places gives so much away that density is the whole dial, and it has a cliff. At
DONUT's schedule (29 to 36.2%) a grade-2 player cleared 98 to 100% of every board. At a flat 55% it
cleared 98% of board 1 and 88% of board 10, at 59% 80% and 65%, at 61% 70% and 57%, at 65% 45% and
15%, and at 75% nothing (40 seeds a board, 26 September 2026). The ladder ships at 56.4 to 59.1%,
on the placement ladders' human target, a grade-2 player at 90% falling to 70%: it clears 93, 93,
87, 92, 85, 80, 80, 80, 70 and 68% of boards 1 to 10 (60 seeds), with 1.2 forced guesses on
board 1 rising to 5.4 on board 10, and the grade-4 player within two points of it on every board.
The honest player, which names a cell only when it is the last behind a number and never bounds
a sum by its count, finds it harder, as it found the round DONUT (decision 0045): 90% of board 1
falling to 40% of board 10 (40 seeds). The graded player is the instrument the human target is
set in (`docs/human-tuning-plan.md`).
Rounding the quota to an even number makes a gentle ramp repeat a board, so the schedule steps
two creatures a board within each box. The pairs lay down on the first attempt at every density
up to 90%, so the packing never binds, and the continuation holds board 10's density while the box
grows to 45 by 45.

Nothing touches EXP: the rule decides where, never how many, and every board clears without
damage under the growth rule, which `test/invariants.test.ts` holds. PAIRS's proofs are not
reused (`groups` is null); a rule that ever made the pairing tier-aware would reach `quantity`
and C_k, and would need its own proofs.
