# 0061. The pencil reads no number the board hides

2026-09-27. Status: adopted. Settles issue #10; replaces the pencil half of 0012's consequence.

## Context
Decision 0012 stopped the board drawing a beaten creature's number on hover on PAIRS and
DOMINOES, where that number is its partner's tier. The pencil kept reading it: beside a lone
beaten creature, `pairCandidates` offered empty ground or the partner's tier, and the palette
struck out every other tier, so hovering there with the pencil armed spelled out the hidden
number. Notes may protect the player; they must never expose anything.

The graded player's `partner-number` trick was already gated on the number being shown, so it
measured the hidden-number game and the player could play a different one. Measured 27 September
2026, `sim:human -- 20 pairs` with and without `--peek`: byte-identical before and after the
change, and every golden output unchanged.

## Decision
Where a rule's display hides a beaten creature's number (`display.hoverShowsNumber` false),
`pairCandidates` says nothing beside a lone creature. The two readings the board does show stay:
a cell touching two open creatures, or beside a creature that has met its partner, is empty
ground. The graded player's `partner-number` trick reads the number itself, so `--peek` still
measures the number-shown game.

## Consequences
The pencil and the board agree on PAIRS and DOMINOES, and the graded player's two figures are the
two games a person could be playing. Sweep's partner proof (proof A in `ringIsFree`) still reads
the hidden number: a sweep that frees the ring tells the player the partner is within their
level, one bit rather than the tier. It protects rather than exposes, and is left. Reversing 0012
(drawing the number again) would bring the pencil's reading back by itself, since it follows the
display.
