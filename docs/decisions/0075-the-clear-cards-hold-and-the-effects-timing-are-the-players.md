# 0075. The clear card's hold and the effect's timing are the player's

2026-09-28. Status: adopted.

## Context
A board's first clear held its card back for two and a half seconds, by request, so the clear
effect played over the undimmed board (docs/ui.md); the effect played on every clear, at its own
pace, and a replay showed the card at once.

## Decision
Three presentation settings, each a ladder's own if wanted (0070): `victoryWhen`, every clear or
a board's first only; `cardHold`, what holds the card on a first clear with an effect to watch,
the effect's length as before, a click anywhere, or nothing; and `effectSpeed`, half to double,
which scales a physics effect's step as well as its length, so a tumble falls faster rather than
being cut short. A run's board counts as a first clear only if the save has no clear of it,
which Unlock everything can arrange.

## Consequences
The hold still applies to first clears alone: a replay's card comes at once whatever is chosen,
since the wait is for watching an effect over a board worth watching. "Until I click" leaves the
cleared board on screen for as long as the player likes, with Escape still leaving it. A
`.overlay.held-click` is transparent with its card out of sight, and the click that lets the card
in is the overlay's own.
