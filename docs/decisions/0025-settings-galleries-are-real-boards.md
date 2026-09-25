# 0025. Every visual setting shows real boards, and picking one rebuilds the screen

2026-09-22. Status: adopted.

## Context
A dropdown naming an option asks the player to imagine the result. An approximation would have been
a quarter of the code and would have started lying the first time cell drawing moved.

## Decision
Every tile is a genuine `Game` drawn by the genuine `BoardView` from a fixed config and seed;
`preview.ts` builds boards and renders nothing so a Node test can check them. Icons, palette and
font show Default and User choice, with the full gallery in a picker inside the settings element.
A pick rebuilds the whole screen (the galleries are drawn in terms of each other) and carries the
scroll; the zoom slider, sound and the clear effect update in place. The clear-effect demo runs over
a genuinely won board carrying one of every tier the real board uses.

## Consequences
About twelve thumbnails per rebuild instead of seventy. Every "game type default" names what it
resolves to. Anything added to `preview.ts` stays DOM-free. The cursor-highlight examples, hex for
everyone at first, follow the player's ladder by request: square on square ladders, hex on HIVE.
