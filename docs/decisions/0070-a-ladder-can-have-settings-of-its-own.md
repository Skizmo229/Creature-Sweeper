# 0070. A ladder can have presentation settings of its own

2026-09-28. Status: adopted.

## Context
Every presentation setting was global or "game type default": a palette borrowed for one ladder
was borrowed for all, and a player who wanted DONUT in Gluten and everything else in Atkinson
had to choose on every visit. The owner asked for a "this ladder only" scope on each pick, the
one structural change in the batch of settings added on 28 September 2026.

## Decision
The settings screen carries a switch under its title: for every ladder, or for the ladder it
was opened from. In a ladder's scope a pick of anything a board looks or sounds like
(`LADDER_SCOPED` in `src/ui/presentation.ts`: icons, glyph, colours, palette, fonts, digit size,
the beaten look, the mark colour, the highlight, reach shading, the zoom, the sound pack, the
glows, the clear effect and its options) is kept as that ladder's own, over the settings for
every ladder, and `Settings.presentationFor(typeId)` resolves it; every reader of a scoped
setting goes through that. The interface, the volume, the sound check, the tutor and the ways of
playing cannot be a ladder's own; in a ladder's scope their sections wait for the other scope,
and a pick of one of them goes to every ladder. A line names what the ladder has of its own,
with a button to give it up; Reset presentation clears every ladder's.

## Consequences
The save carries each ladder's own under `ladders`, read as the presentation is read and kept
only where the save held a value, so a build without the scope ignores them and a ladder is
never handed every default as its own. The scope is module state on the settings screen, so a
pick's rebuild keeps it and it means "this ladder" whichever ladder the screen was opened from.
A setting added later must be filed as scoped or not; unfiled, it is for every ladder.
