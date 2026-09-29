# 0082. Modifier keys are the browser's, and a Control-click marks

2026-09-29. Status: adopted. Extends 0067's consequence to every key.

## Context
The board's shortcuts read the key alone: Ctrl+H spent a hint where the browser meant its
history, Cmd+S swept where it meant to save the page, and Ctrl+0 reset the board's zoom where it
meant the browser's. Only `U` checked (decision 0067). And a Mac's right click is a click with
Control held, which some browsers report as the left button with the key; the board opened the
cell. Both from the pre-release audit of 28 September 2026.

## Decision
A key with Ctrl, Cmd or Alt held never reaches the board (`BoardActions.onKey`); Shift still
inverts the entry mode for a keystroke, as it did. A press with Control held marks as a right
click does (`BoardInput`), and its lift opens nothing whether or not the key is still held, since
the mark was made when the button went down.

## Consequences
Every browser shortcut works on the game screen. Control-click marks on every platform, not only
a Mac, which costs nothing: the game gave Control-click no other meaning. The sound check's
keyboard already left modified keys alone. `test/ui/modifiers.test.ts` holds both rules.
