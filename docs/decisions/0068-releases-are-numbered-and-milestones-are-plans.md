# 0068. Releases are numbered, and milestones are plans

2026-09-28. Status: adopted.

## Context
The work has been organised in milestones (3, the readability refactor; 4, tuning for the human
player; 5, teaching the tricks), each a plan in `docs/`. What a player plays had no name at all:
`package.json` said 0.0.0, the list of game types said "Prototype — Milestone 3" two milestones
after that one closed, and the itch.io zip was named by its date and commit. A public release needs
a name a player can quote in a bug report and a save can be checked against. The owner asked on 28
September 2026 whether to switch from milestones to version numbers, and chose 0.9.0 for the game
as it stands, with 1.0.0 for the public release.

## Decision
Each release is numbered MAJOR.MINOR.PATCH, written in `package.json` and nowhere else; the game
reads it from there (`src/ui/version.ts`). 0.9.x is the game while it is play-tested; 1.0.0 is the
public release. A patch fixes; a minor adds or retunes ladders, spells or settings; a major changes
the save's format, and brings the migration with it. A release commit raises the version and adds
its entry to `CHANGELOG.md`; the merged commit is tagged `v<version>`. Milestones stay what they
have been, plans for a body of work, and a plan may name the version it expects to ship in.

## Consequences
The version is shown under the title on the list of game types, in place of the milestone line, and
the itch.io zip is named after it. `npm version <x.y.z> --no-git-tag-version` raises it in
`package.json` and the lockfile together. Records do not yet carry a fingerprint of the board they
were set on, so a minor that retunes a ladder moves old best times onto a changed board; that
fingerprint, and the version inside the backup and statistics codes, are due before 1.0.0.
