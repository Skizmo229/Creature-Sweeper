# 0038. PYRAMID's bottom two rows are dealt face up, as Reveal deals a cell

2026-09-25. Status: adopted.

## Context
The owner asked for a stepped pyramid board, rows two, four, six cells wide, that starts with its
bottom two rows revealed. Asked whether a creature standing there is shown alive or starts
already beaten, the owner chose alive. A beaten one would pay its EXP before the first click and
hand the player levels; a shown one keeps every kill the player's.

Every opening until now came from the placement rule (`PlacementRule.opening`), and every rule but
Sudoku's opens the largest blank area.

## Decision
A new opening rule, `'base'`: each cell of the bottom `BASE_ROWS` (2) rows is dealt as Reveal deals
its target. Empty ground opens and cascades; a creature is written as a given (gold, unerasable)
and stays alive and covered. None of it pays exploration mana, like any dealt opening. A ladder
names it with an `opening` field, read by `readOpening` in `config.ts`, which refuses an unknown
name and refuses to replace an opening a placement deals itself (Sudoku's).

PYRAMID ships at ARCANE's density schedule and not on ARCANE's forced-guess curve, because no
density a board survives reaches that curve. Measured with the honest player, 25 September 2026:

| Densities | Stuck over the ladder | Boards cleared |
| --- | ---: | ---: |
| ARCANE itself, 26.5 to 34.5% | 23.9 | 82% |
| PYRAMID at ARCANE's, 26.5 to 34.5% | 0.2 | 100% |
| PYRAMID eight points up, 34.6 to 42.5% | 4.0 | 100% |
| PYRAMID fifteen points up, 41.5 to 49.5% | 14.6 | 99% |

(60 seeds a board for the first two rows, 30 for the others.) The reason is the stepped edge: a
base cell there touches one covered cell above it, so its number reads that cell exactly, and the
next cell along is left with one unknown, so each row unzips the one above.

## Consequences
PYRAMID is decided by deduction rather than by guesses, as SUDOKU is by construction; its
difficulty is the work and the level gates, not HP. If it should be harder, the levers are
density past the 34% ceiling (above, and expensive), or dealing less of the base face up, which
is a change to what the owner asked for. `test/game.test.ts` holds the opening to its contract:
empty ground open and cascaded, every base creature a given, alive and covered, nothing paid.
