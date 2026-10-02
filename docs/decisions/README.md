# Decisions

One short record per decision that a reader of the code might otherwise re-litigate or reverse
without knowing why it was made. This is where the *history* of the codebase lives, so that the
code itself can say what it does and, in a paragraph, why; anything longer or older points here.
The owner in these records is the maintainer, Skizmo229.

Numbered in the order they were written, never renumbered. The index at the end lists every
record; a new record adds its row there, and a change to a status line changes the row too.

Format, kept deliberately small:

```
# NNNN. Title, as a claim

Date. Status: adopted | superseded by NNNN. Then how it relates to other records, if it does.

## Context
What was true, what was being asked for, and what was measured.

## Decision
What was decided, in a sentence or two.

## Consequences
What it costs, what it protects, and what to check if it is ever changed.
```

The load-bearing rules of the game (the tuning identity, the zero-damage guarantee, EXP must
always be collected, numbers are sums) are not decisions and do not live here; they are in
`docs/invariants.md`.

## Status

A record is **adopted**, or **superseded by NNNN** once a later record reverses the whole of it.
A record that changes an earlier one says how on its status line:

- **Supersedes** or **Replaces** NNNN, or a named part of it: its rule stands in that one's place.
- **Amends** NNNN: changes part of it; the rest stands.
- **Extends** NNNN: adds to it, or carries it further.
- **Narrows** NNNN: limits where it applies.
- **Follows** NNNN: builds on it.
- **Settles issue #N**: closes that GitHub issue.

The earlier record then gets a pointer on its own status line, saying what changed and where ("No
Sweep on the ladder since 0063"), so that a reader who lands on it is sent on.

## Index

| No. | Decision | Status |
| --- | --- | --- |
| [0001](0001-remove-code-kept-without-callers.md) | Code with no caller is removed, not kept for later | Adopted. |
| [0002](0002-the-cave-is-grown-to-an-exact-count.md) | The ragged cave is grown to an exact cell count, never trimmed | Adopted. |
| [0003](0003-the-dungeon-has-three-kinds-of-cell.md) | The dungeon has three kinds of cell, and a doorway carries a pocket | Adopted. |
| [0004](0004-the-crawl-rule-and-its-exception.md) | The crawl rule has one stated exception rather than a rarer failure | Adopted. |
| [0005](0005-reveal-writes-a-given-and-clears-its-ring.md) | Reveal writes a given, and clears the empty ground around its target | Adopted. |
| [0006](0006-spell-order-and-shortcuts-are-derived.md) | The spell row is ordered by price and shortcuts derive from names | Adopted. |
| [0007](0007-the-board-is-outlined-as-a-silhouette.md) | The board is outlined as its silhouette, worked out per cell | Adopted. |
| [0008](0008-the-lv-palette-is-modal.md) | Pencil mode arms a tier, is labelled by the mode it is in, and governs the keyboard | Adopted. |
| [0009](0009-sentinels-for-none.md) | markMode is -1 for "none", and a notes mask of 0 means "no notes" | Adopted. |
| [0010](0010-the-pencil-refuses-only-what-the-rule-refuses.md) | The pencil refuses what the placement rule refuses, and nothing that takes deduction | Adopted. |
| [0011](0011-rule-families-are-asked-through-one-predicate.md) | Every reader of a rule family asks isPaired or isPacked | Superseded by 0029. |
| [0012](0012-hover-shows-a-beaten-creatures-number.md) | Hovering a beaten creature shows its number; the hover-level setting was retired | Adopted. See 0001 for the code removal; the pencil no longer reads the hidden number (0061); a toggle shows every beaten creature's number at once since 0067; a creature may be drawn as its tier's digit since 0074. |
| [0013](0013-spell-prices-tripled.md) | Spell prices are 30 / 75 / 150 / 300, and starting mana is 75 | Adopted. Beacon's price superseded by 0037. |
| [0014](0014-sweep-is-charged-by-default.md) | Sweep is charged by default, and easier settings record nothing | Adopted. A budget of sweeps a board, which records nothing, is a mode of its own since 0072. |
| [0015](0015-full-run-rules.md) | Full Run: level, EXP and mana reset each board; one pool; half heal, rounded down | Adopted (replaced the parked Ironman). |
| [0016](0016-the-clock-starts-when-the-board-is-dealt.md) | The clock starts when the board is dealt, not on the first move | Adopted. |
| [0017](0017-confirmations-use-an-in-page-overlay.md) | Confirmations go through Modal.ask, never window.confirm | Adopted. `App.ask()` moved to `Modal.ask` (`src/ui/overlays/modal.ts`) on 27 September 2026. |
| [0018](0018-the-counted-unlock-order-is-set-by-hand.md) | The counted unlock order is set by hand, in steps of five from 15 to 80 | Schedule superseded by 0036 (25 September 2026); counting boards stands. |
| [0019](0019-huge-x-extreme-retuned.md) | HUGE x EXTREME holds lock 7 on boards 7 to 10 and steps density back to pay for it | Adopted. |
| [0020](0020-shaped-ladders-on-arcanes-curve.md) | The shaped magic ladders sit on ARCANE's forced-guess curve | Adopted. |
| [0021](0021-every-ladder-has-its-own-typeface.md) | Every ladder has a bundled typeface, and the title wears Griffy | Adopted; the unique face per ladder is replaced by 0031, and the one font setting is split into the board's and the interface's by 0033. |
| [0022](0022-the-save-backs-up-as-a-code.md) | The save backs up as a CS1: base64 code | Adopted. An unreadable save is set aside, and the code names the version that wrote it, since 0080. |
| [0023](0023-board-clear-effects.md) | Board-clear effects: two families, pre-rendered glyphs, measured time | Adopted. |
| [0024](0024-sound-is-synthesised.md) | Sound is synthesised, built lazily, one sound per action, and mute is not OFF | Adopted. |
| [0025](0025-settings-galleries-are-real-boards.md) | Every visual setting shows real boards, and picking one rebuilds the screen | Adopted. |
| [0026](0026-damage-scales-per-blow.md) | Creature damage scales per blow, and the dials stay clear of EXP | Adopted. |
| [0027](0027-sudoku-design.md) | SUDOKU uses digits 0 to 8, generates guess-free, and keeps its rule out of Sweep | Adopted. |
| [0028](0028-milestone-3-refactor-not-rewrite.md) | Milestone 3 refactors in place rather than rewriting | Adopted. |
| [0029](0029-placement-rules-are-a-registry.md) | Placement rules are records in a registry, and readers ask the rule | Adopted. Supersedes 0011. |
| [0030](0030-board-shapes-are-a-registry.md) | Board shapes are records in a registry, like placement rules | Adopted. |
| [0031](0031-one-look-per-ladder-and-faces-may-be-shared.md) | Each ladder's look is one record, and two ladders may share a face | Adopted. Settles issue #5; replaces the one-face-each consequence of 0021. |
| [0032](0032-a-creatures-number-is-kept-apart-from-ink-and-the-annotations.md) | A beaten creature's number is kept apart from `ink` and from the annotation colours | Adopted. Recorded 2026-09-24, when the history moved out of the palette comments. |
| [0033](0033-the-board-and-the-interface-each-have-a-font-setting.md) | The board and the interface each have a font setting | Adopted. Narrows which face reaches the title (0021). |
| [0034](0034-the-example-board-shows-every-digit-and-every-colour.md) | The example board shows every digit and every colour a palette paints | Adopted. Replaces the choice, in the working notes of 24 Sep 2026, to leave the gallery thumbnails at 4x3. |
| [0035](0035-custom-icons-are-wingdings-unicode-equivalents-in-open-fonts.md) | Custom icons are Wingdings' Unicode equivalents, drawn in open fonts | Adopted. |
| [0036](0036-each-step-opens-one-ladder-per-category.md) | Each step of five opens one ladder per menu category | Adopted. Replaces the schedule in 0018; its reasons for counting boards stand. |
| [0037](0037-beacon-costs-85-priced-against-reveal.md) | Beacon costs 85, priced where a mana of it buys what a mana of Reveal does | Adopted. Replaces Beacon's price in 0013; settles the tuning open question it raised. |
| [0038](0038-pyramids-base-rows-are-dealt-as-reveal-deals-a-cell.md) | PYRAMID's bottom two rows are dealt face up, as Reveal deals a cell | Adopted. Climbed by the crawl rule since 0086. |
| [0039](0039-petri-dish-reaches-one-step-and-marks-extend-it.md) | PETRI DISH reaches one step, and a mark beside open ground extends it | Adopted. |
| [0040](0040-patrol-creatures-walk-routes-that-never-cross.md) | PATROL: creatures walk square routes that never cross, one cell a move | Adopted. No Sweep on the ladder since 0063; a Wait costs a second since 0064. |
| [0041](0041-extreme-holds-lock-3-to-the-top.md) | EXTREME holds lock 3 to the top instead of deepening to 4 on boards 9 and 10 | Adopted. |
| [0042](0042-oracle-holds-lock-4-from-board-4.md) | ORACLE holds lock 4 from board 4 to the top instead of deepening to 5 on boards 7 to 10 | Adopted. |
| [0043](0043-blind-runs-sparser-than-normal.md) | BLIND runs sparser than NORMAL, on a target of its own | Adopted. |
| [0044](0044-huge-x-blind-runs-sparser-than-huge.md) | HUGE x BLIND runs sparser than HUGE, on the one-mistake ladders' target | Adopted. |
| [0045](0045-donut-is-round.md) | DONUT is round, a six-cell ring six points denser | Adopted. |
| [0046](0046-sprinkle-donut-shows-every-creature-in-pairs-that-may-touch.md) | SPRINKLE DONUT shows every creature, in pairs that may touch | Adopted. |
| [0047](0047-donut-is-an-unglazed-donut.md) | DONUT looks like an unglazed donut | Adopted. |
| [0048](0048-the-tutor-costs-the-best-time-and-trusts-no-mark.md) | The tutor costs the best time and nothing else, and trusts no mark | Adopted. A hinted clear keeps the fewest hints until a best time exists since 0065. |
| [0049](0049-a-catalogue-diagram-is-a-patch-of-a-board-and-a-test.md) | A catalogue diagram is a patch of a board, and a test | Adopted. |
| [0050](0050-the-cursor-colour-is-the-players-and-its-red-is-not.md) | The cursor's colour is the player's, and the red of a click that would do nothing is not | Adopted. The refusal is crossed out as well as red since 0051, so a player who chooses a red gives up only its colour, and the drawing the consequences below ask for is made. |
| [0051](0051-a-click-that-would-do-nothing-is-crossed-out.md) | A click that would do nothing is crossed out, not only red | Adopted. |
| [0052](0052-the-long-pickers-sort-by-ladder-name-and-look.md) | The long pickers sort by ladder, by name, and by how the option looks | Adopted. |
| [0053](0053-a-creatures-colours-are-the-players-from-measured-presets-or-their-own.md) | A creature's colours are the player's, from measured presets or their own | Adopted. |
| [0054](0054-seer-is-blind-with-a-spellbook.md) | SEER is BLIND with a spellbook, denser, on BLIND's target | Adopted. |
| [0055](0055-augur-is-echo-built-and-priced-on-paper.md) | Augur is Echo, built, and priced at its paper value because value as played is nil | Adopted. The answer leaves out open neighbours since 0062, and lists every hidden tier, at 50 mana, since 0087. |
| [0056](0056-augur-ships-at-arcanes-schedule.md) | AUGUR ships at ARCANE's schedule, because density cannot move it | Adopted. A lock deeper, with EXTREME's HP, since 0088. |
| [0057](0057-a-paused-game-is-its-moves-kept-live.md) | A paused game is its moves, kept live, one per board and one run per ladder | Adopted. Its fingerprint carries a version since 0084. |
| [0058](0058-the-shapes-and-the-placement-ladders-keep-their-schedules.md) | The shapes and the placement ladders keep their schedules | Adopted. |
| [0059](0059-the-game-says-it-in-fewer-words-than-the-catalogue.md) | The game says it in fewer words than the catalogue | Adopted. |
| [0060](0060-play-statistics-are-kept-per-board-on-the-device-and-leave-it-only-as-a-code.md) | Play statistics are kept per board on the device, and leave it only as a code | Adopted. The code names the version that wrote it since 0080, and goes into a play-test report on GitHub since 0085. |
| [0061](0061-the-pencil-reads-no-number-the-board-hides.md) | The pencil reads no number the board hides | Adopted. Settles issue #10; replaces the pencil half of 0012's consequence. |
| [0062](0062-augur-names-the-strongest-hidden-creature.md) | Augur names the strongest hidden creature | Adopted. Amends 0055. The answer lists every hidden tier, not the strongest alone, since 0087. |
| [0063](0063-patrol-offers-no-sweep.md) | PATROL offers no Sweep | Adopted. Amends 0040. |
| [0064](0064-a-patrol-wait-costs-a-second.md) | A Wait on PATROL costs a second | Adopted. Amends 0040. |
| [0065](0065-a-hinted-clear-keeps-the-fewest-hints.md) | A hinted clear keeps the fewest hints until a best time exists | Adopted. Amends 0048. |
| [0066](0066-unlock-everything-ships-with-the-game.md) | Unlock everything ships with the game | Adopted. |
| [0067](0067-a-toggle-shows-every-beaten-creatures-number.md) | A toggle shows every beaten creature's number at once | Adopted. Amends 0012. Every board key leaves Ctrl, Cmd and Alt to the browser since 0082. |
| [0068](0068-releases-are-numbered-and-milestones-are-plans.md) | Releases are numbered, and milestones are plans | Adopted; while the game is play-tested every cut is 0.9.N whatever it adds, and the parts mean what is said here from 1.0.0 (0083). |
| [0069](0069-the-about-card-carries-the-licences-notices-and-the-source.md) | The About card carries the licence's notices and the way to the source | Adopted. |
| [0070](0070-a-ladder-can-have-settings-of-its-own.md) | A ladder can have presentation settings of its own | Adopted. |
| [0071](0071-a-chord-is-a-sweep-of-one-ring-at-a-sweeps-price.md) | A chord is a sweep of one ring at a sweep's price | Adopted. |
| [0072](0072-a-budget-of-sweeps-ranks-below-the-charge.md) | A budget of sweeps ranks below the charge and records nothing | Adopted. Extends 0014. |
| [0073](0073-hidden-counters-are-a-hard-mode-the-tutor-still-reads.md) | Hidden counters are a hard mode the tutor still reads | Adopted. |
| [0074](0074-a-creature-may-be-drawn-as-its-tiers-digit.md) | A creature may be drawn as its tier's digit | Adopted. Amends 0012's consequence. |
| [0075](0075-the-clear-cards-hold-and-the-effects-timing-are-the-players.md) | The clear card's hold and the effect's timing are the player's | Adopted. |
| [0076](0076-the-mark-colour-is-the-players-from-measured-presets-or-their-own.md) | The mark colour is the player's, from measured presets or their own | Adopted. Follows 0050 and 0053. |
| [0077](0077-a-touch-marks-by-a-long-press.md) | A touch marks by a long press, half a second by default | Adopted. |
| [0078](0078-more-looks-and-the-ladders-that-wear-them.md) | More looks, and the ladders that wear them | Adopted. Follows 0031 and 0070. |
| [0079](0079-a-record-remembers-the-board-it-was-set-on.md) | A record remembers the board it was set on | Adopted. |
| [0080](0080-the-save-survives-a-version-it-cannot-read.md) | The save survives a version it cannot read, and a code says which version wrote it | Adopted. Follows 0022 and 0060. |
| [0081](0081-the-game-does-not-die-silently.md) | The game does not die silently | Adopted. |
| [0082](0082-modifier-keys-are-the-browsers-and-a-control-click-marks.md) | Modifier keys are the browser's, and a Control-click marks | Adopted. Extends 0067's consequence to every key. |
| [0083](0083-the-play-testing-line-stays-0-9-x.md) | The play-testing line stays 0.9.x, whatever a cut adds | Adopted. Amends 0068. |
| [0084](0084-a-paused-games-fingerprint-carries-its-version.md) | A paused game's fingerprint carries its version | Adopted. Amends 0057. |
| [0085](0085-play-statistics-go-into-a-play-test-report-on-github.md) | Play statistics go into a play-test report on GitHub | Adopted. Follows 0060. |
| [0086](0086-pyramid-is-climbed-by-the-crawl-rule.md) | PYRAMID is climbed by the crawl rule | Adopted. Amends 0038. |
| [0087](0087-augur-lists-every-hidden-tier.md) | Augur lists every hidden tier | Adopted. Supersedes 0062's answer and 0055's price. |
| [0088](0088-augur-is-a-lock-deeper-with-extremes-hp.md) | AUGUR is a lock deeper, with EXTREME's HP | Adopted. Amends 0056. |
