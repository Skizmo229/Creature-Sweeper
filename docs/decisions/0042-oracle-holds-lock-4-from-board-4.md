# 0042. ORACLE holds lock 4 from board 4 to the top instead of deepening to 5 on boards 7 to 10

2026-09-26. Status: adopted.

## Context
The same open question as decision 0041, on the ladder that carries every spell. The graded
player at grade 4, spending mana as `docs/strategies.md` advises, cleared 35, 15, 3 and 5% of
boards 7 to 10 at 40 seeds, against a target of 60 to 70% for the top boards; the cliff sat where
the lock deepened from 4 to 5. The advice on record had been one short plus two HP on 7 to 10,
and both halves were measured on candidate files.

## Decision
`lock 3 3 3 4 4 4 4 4 4 4`. HP stays `8 8 8 8 7 7 7 7 6 6` and density 25.8 to 33.0%.

## Consequences
Boards 7 to 10 clear 95, 95, 83 and 60% at grade 4 with spells (forced guesses 2.6 to 5.3 a
board, lethal 0.1 to 0.8, from 8.7 to 11.8 with 1.9 to 3.3 lethal). The two extra HP on 7 to 10
carried board 10 to 78% and board 9 to 90%, past the target, so they were not taken; boards 7 and
8 at 95% are the gentle side of a binary dial, and density is the lever if they should bite
harder. The continuation past board 10 stays at lock 4. `test/spells.test.ts`'s pinned honest
stuck count for ORACLE board 10 is re-measured with `npm run sim:spells -- 40 oracle`; the
`boards`, `runs`, `spells-*` and `human-oracle` golden outputs that ORACLE appears in are
re-recorded. EXTREME took the same lever in decision 0041.

**Recounted, 2 October 2026.** The forced guesses above are the graded player's stuck column with
spells, which until then counted a stuck point again for every cast that settled nothing there.
Counted once a stuck point, boards 7 to 10 are stuck 2.4, 3.3, 4.1 and 4.5 times a board; the clear
rates and the guesses taken (0.7 to 2.0 a board) did not move. The old schedule's 8.7 to 11.8 was
counted the same way and was not measured again.
