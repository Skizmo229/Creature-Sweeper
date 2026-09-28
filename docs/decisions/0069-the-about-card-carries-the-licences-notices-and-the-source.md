# 0069. The About card carries the licence's notices and the way to the source

2026-09-28. Status: adopted.

## Context
Nothing in the game said who made it, what it remixes, what licence it is under or where its
source is: the credit to mamono sweeper, the line saying Hojamaka Games have no part in it and the
licences were only in the README, which a player on itch.io never sees. The GPL asks an interactive
program to show "Appropriate Legal Notices": a copyright notice, that there is no warranty, that the
program may be passed on under the licence, and how to read the licence. The release audit of 28
September 2026 found none of it in the build, and the owner asked for an About screen that links to
the GitHub repository.

## Decision
The list of game types carries an About button, before Reset progress, which opens a card in the
modal (`src/ui/screens/about.ts`): the version, the remix credit with Hojamaka Games' non-part in
it, the copyright line, the GPL's notices with a link to the licence, the source on GitHub, and the
fonts' licence with a link to `FONT-LICENSES.txt`, which ships beside `index.html`. Every link opens
a tab of its own.

## Consequences
A fork that keeps the card passes the notices on, as the GPL asks of a modified version. The links
leave the game for a new tab because on itch.io the game runs in a frame and GitHub will not load
inside one; that itch's frame lets a link open a tab is to be checked on the first upload. The
repository's address is written in `about.ts` and the README, so a renamed repository changes both.
