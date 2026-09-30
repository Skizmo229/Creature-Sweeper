# 0085. Play statistics go into a play-test report on GitHub

2026-09-30. Status: adopted. Follows 0060.

## Context
The play statistics leave the device only as a `CST1:` code the player copies (0060). The backup
screen told the player to paste it "to the developer" and never said where; the pre-release audit
of 28 September 2026 listed that, and where the codes go was left as the owner's call. On 30
September 2026 the owner chose a GitHub issue form with a box for the code, linked from that
screen.

## Decision
`.github/ISSUE_TEMPLATE/playtest.yml` is a play-test report: a required field for the code, and
two optional ones for what the player noticed and for their device and browser. The statistics
section of the backup screen links it (`PLAYTEST_REPORT_URL`), in a tab of its own, as every link
out of the game opens.

## Consequences
The game still sends nothing: the player pastes the code, and the form says that issues are
public and what the code holds (what each board cost, the version, when it was copied). The owner
reads a report's code with `npm run telemetry -- CODE`. The link works once the form is on the
repository's default branch, and it is built from `SOURCE_URL`, so a move of the repository moves
it too. A report arrives labelled `play-test` once the repository has that label.
