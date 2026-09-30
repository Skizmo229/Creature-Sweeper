# 0084. A paused game's fingerprint carries its version

2026-09-30. Status: adopted. Amends 0057.

## Context
A paused game is checked on resuming by a fingerprint of the board its moves reach (0057), and one
that does not match is refused and its slot emptied. The fingerprint that 0.9.1 and every build
before it took left out four things the player is shown: a cell's Census count, its Augur answer and its
sprinkle partner, and the sweeps left of a budget. Census and Augur also feed Sweep's proofs. An
update that changed what one of them says, as 0062 changed Augur's answer on 28 September 2026,
would hand a paused game back with a different answer and pass the check. The multi-agent sweep of
28 September found this and left it unverified. Taking the four in changes every fingerprint, so a
plain fix would have refused every game paused before it.

## Decision
The fingerprint has a version, stored beside each paused game (`DIGEST_VERSION`, `digestVersion`).
Version 2 takes the four in. A game stored without one was paused by 0.9.1 or earlier and is
checked by version 1, which is kept exactly as those builds took it.

## Consequences
No game paused before the change is refused because of it; each is checked as before, blind to
the four as before, until it ends. The next thing the fingerprint learns raises the version and
keeps the one before; `test/replay.test.ts` holds version 1 to a copy of the 0.9.1 code on every
ladder. A version newer than the build's is read as the build's own and fails the check, as a move
the build does not know already does, so an older build never takes up a game a newer one paused.
