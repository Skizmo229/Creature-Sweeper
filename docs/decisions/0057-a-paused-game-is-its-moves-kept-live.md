# 0057. A paused game is its moves, kept live, one per board and one run per ladder

2026-09-27. Status: adopted.

## Context
The owner asked for a way to pause a board and come back to it at any time. Before this, leaving
a single board threw it away, and a Full Run could not be resumed at all (its leave button said
so). A run is the longest thing in the game, so it was the one most in need of it.

Two ways to keep a board were weighed. A snapshot writes out the state; the engine holds private
state beyond the grid (the crawl rule's cache, Sweep's charge, the exploration trickle, WORKOUT's
surcharge, PATROL's walkers), and a snapshot would have to name every field and would miss the
next one silently. A replay keeps the seed, the dials and the moves: a board is a pure function of
(config, seed), `Game.create` is the only place the engine draws a random number, and every move a
player makes goes through `BoardActions`. Measured 27 September 2026 by `test/replay.test.ts`: a
random mix of every move kind (7027 opens, 2552 marks, 2540 notes, 423 sweeps, 319 casts, 51 waits
landed) on the first and last board of every ladder at three seeds replays to the same events,
move for move, and the same state.

## Decision
A paused game is the seed, the dials it was dealt with and its moves (`src/engine/replay.ts`),
with the clock to the millisecond, the tutor's count and a fingerprint of the board the moves
reached. A run keeps its cleared legs instead of their moves (`FullRun.resume`). It is written
after every move, after a hint, and as the page goes away, and deleted the moment the game ends,
so it is never a checkpoint: a guess lost cannot be taken back by resuming. There is one slot per
board of a ladder, scaling boards included, and one run per ladder; starting a board or a run
that has a game paused takes it up, unless a seed is asked for.

Leaving a game with a move in it, or a run, asks: Pause, Abandon, or Keep playing. Pause (the
button, or `P`) leaves without asking, since nothing is lost. A board with no move made is not
kept. The clock stands still while a game is paused and the board is off screen, so a paused clear
still sets a best time. The dials are the ones the board was dealt with, whatever the settings say
on resuming; a clear is judged by those too. School lessons are not kept.

## Consequences
- An update that changes a ladder's data or a rule makes the replay reach a different board. The
  fingerprint (the config, every cell and the player's standing) catches it, and the game is
  refused and its slot emptied rather than handed back as a different board. A retune therefore
  costs the paused games on the ladders it touches; that is the price of never replaying wrong.
- A slot is its own storage key, carrying a token for the tab keeping it. A tab whose game has
  been taken up in another tab, or ended there, stops writing rather than bringing it back.
  Paused games stay out of the `CS1:` backup code, which would otherwise be a checkpoint, and the
  ladder list's erase takes them with everything else.
- A new move for the player must be a `Move` kind, made through `BoardActions`' `move`. An action
  that reached the engine any other way would not be kept, and the fingerprint would refuse the
  game on resuming. A new engine field that a move changes needs nothing: the replay reaches it.
- Anything in the engine that drew a random number after the deal would break every paused game.
  `test/replay.test.ts` is the guard.
