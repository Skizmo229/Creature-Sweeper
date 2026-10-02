# 0089. A GitHub release carries the itch.io zip and a one-file offline page

2026-10-02. Status: adopted. Follows 0068.

## Context
1.0.0 went up on itch.io on 2 October 2026, and the owner asked for it on GitHub too, with
"different versions". Asked what that meant, the owner chose two downloads of 1.0.0 over a release
for every 0.9.x tag. The itch.io zip does not play once downloaded: its script is a module, and a
browser that opens `index.html` from disk refuses to load it, so the page stays blank (Chrome,
"blocked by CORS policy", seen 2 October 2026).

## Decision
`npm run package` writes a second file beside the zip: `scripts/offline.mjs` folds the script, the
styles and every font into one HTML page that plays from disk. The fonts' notices, the one file the
game links beside itself, go in a comment at the top of the page, and the About card's link to
them goes to the copy at the version's tag on GitHub. Each version's tag gets a GitHub release
with both files attached; the 0.9.x tags have none.

## Consequences
The page is about 1.9 MB against the zip's 1.1 MB, its fonts being base64. A browser keeps the
page's save apart from the one on itch.io, so the backup code is how progress moves between them.
The script refuses a build it was not written for (a second script or stylesheet, another file
named beside the page, a font type it does not know, a script holding `</script`) rather than
write a page that opens blank, so a code-split chunk or a second relative link in the game will
need it changed. The notices link names the tag, so it resolves once the version is tagged and
pushed.
