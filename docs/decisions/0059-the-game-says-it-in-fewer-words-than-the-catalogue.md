# 0059. The game says it in fewer words than the catalogue

2026-09-27. Status: adopted.

## Context
Milestone 5 put the catalogue (`docs/strategies.md`) in the game: the field guide copied its
paragraphs word for word and `test/guide.test.ts` held every sentence to it, the trick text quoted
its sentences, the school's lessons spoke them, and the ladder blurbs and the rules card were
written in the same expansive voice. `docs/teaching-plan.md` section 8, item 7, left open whether
the guide should have words of its own.

The owner's view, 27 September 2026: a lot of the game uses too many words to explain things, and
it should be more concise. The catalogue is the graded player's specification and a document for
a developer, where the reasons belong; a player reading a card or a lesson wants the rule.

## Decision
Everything the player reads is written in the game's own words, as short as still states the
rule: the rules card, the trick sentences (`src/sim/tricktext.ts`), the field guide's entries and
ladder notes (`src/ui/guide/`), the school's lessons, the ladder blurbs, and the tooltips, cards
and settings help. Rationale, repetition and the second sentence that restates the first are cut.

The catalogue keeps its length and stays the source of the guide's shape: the tests hold the
guide to its sections, its bold leads as headings, one entry per trick in the section of its
grade, every diagram in its trick's entry, and each entry's ladders to the ones the catalogue
names; the trick text to its names and sections; the ladder notes to section 7's headings and
order; and the lessons to speaking their trick's sentence. Only the word-for-word checks went.

## Consequences
A change to a catalogue paragraph no longer reaches the game by itself; a change to a rule has to
be made in both. A new trick still cannot ship without its catalogue entry, since the shape tests
would fail. Anything the player reads that is added later follows the same rule: the rule in a
line, the reasons in the docs.
