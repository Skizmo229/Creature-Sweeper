# 0083. The play-testing line stays 0.9.x, whatever a cut adds

2026-09-29. Status: adopted. Amends 0068.

## Context
Decision 0068 named 0.9.x the game while it is play-tested and 1.0.0 the public release, and in
the same breath said a minor adds or retunes ladders, spells or settings. The first cut after
0.9.0 added thirty settings, five sound packs, seven clear effects, five creature icons, three
looks for a beaten creature and two faces, and by that rule would have been 0.10.0. The owner
asked on 29 September 2026 whether calling it 0.9.1 would be wise.

## Decision
It would. While the game is play-tested every cut is 0.9.N, whatever it adds: the line is the
owner's own name for that period, and "0.10.0" reads as older than "0.9.0" to a player who reads a
version as a decimal, which most will. From 1.0.0 the parts mean what 0068 says: a patch fixes, a
minor adds or retunes, a major changes the save's format and brings its migration.

## Consequences
The rule in 0068 and in CONTRIBUTING is read from 1.0.0. A code's `game` stamp (decision 0080)
tells cuts apart whatever they are called, and nothing in the save reads the version, so no
migration turns on it. 0.9.1 is the first cut under this rule.
