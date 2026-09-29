# 0081. The game does not die silently

2026-09-28. Status: adopted.

## Context
Two ways the page could stop dead, from the pre-release audit of 28 September 2026. SUDOKU's
placement gives up after 4,000 attempts at a guess-free board, deliberately (a board that fell
back to an easier setting would be mistuned with nothing to show for it), and board 13 refused 8
seeds in 2,000; `Game.create` was called unguarded, so a refused seed threw through the app to a
blank screen. And nothing listened for an error, so any other throw left the page as it was, with
no word of what happened and no way on but a reload.

## Decision
`dealGrid` (`src/engine/generate.ts`) deals from the seed asked for and, if the placement rule
refuses it, from the seed after, up to five in all, before letting the refusal through. The seed
asked for is tried untouched, so every board dealt before is dealt the same, and the same seeds
are tried in the same order, so a board is still a function of the seed it was asked for, which
is the seed the game keeps: a paused board and a replay deal the same board. `CrashWatch`
(`src/ui/overlays/crash.ts`) listens for the window's errors and unhandled rejections, stops the
clock and shows a card once per breakage: what broke in the error's own words, the version, where
to report it, and Back to the list, which rebuilds the screen and re-arms the watch.

## Consequences
The golden outputs are byte-identical: no seed they use was ever refused. A deal that refuses
five seeds in a row, or a config the rule cannot deal at all, still throws, and the card now
shows it. The card says what it can: an error from a script the browser will not name arrives as
"Script error." and is shown as that. The watch is its own class because `app.ts` is at the size
a file may run to. `test/deal.test.ts` refuses seeds through the dealer, and
`test/ui/crash.test.ts` throws at the window.
