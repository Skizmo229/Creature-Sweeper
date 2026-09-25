# 0033. The board and the interface each have a font setting

2026-09-25. Status: adopted. Narrows which face reaches the title (0021).

## Context
One font setting dressed the board's numbers and marks, the whole interface and, when a face was
forced, the game's title. The owner asked for a setting for the font of the HUD and the menus.

## Decision
Two settings. The board font (`font`) sets the board's numbers and marks. The interface font
(`interfaceFont`) sets everything in the DOM: the HUD, the menus, the settings screen and the
ladder list's names. Each defaults to the ladder's own face independently, as every presentation
setting's "game type default" does, rather than the interface following the board. Only a face
chosen for the interface reaches the title. A save from before the split reads its one font as
both, so no face a player had forced moves.

## Consequences
The board's setting keeps the key `font`, so saves and exported codes need no migration for it;
the interface's fallback to it, in `readPresentation`, is the only one. Anything new that sets
text asks for one of the two faces, `Settings.boardFont` for the canvas and
`Settings.interfaceFont` for the DOM, and must not assume they are the same face.
