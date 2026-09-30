# Changelog

What each version of Creature Sweeper changed, newest first (decision 0068).

## 0.9.2 — 2026-09-30

Fixes for the next round of play-testing, and a place to send what it finds.

- Play statistics have somewhere to go: the backup screen links a play-test report on GitHub, a
  form with a box for the code (decision 0085).
- The school: a lesson is untimed and played at the tuned dials, whatever the settings say, so
  its words hold; a refused click prices the fight as it would go, and says when it would kill;
  a lesson's card is shown once.
- A paused game's check also covers what Census and Augur said, a sprinkle's partner and the
  sweeps left, and a game paused on 0.9.1 still resumes (decision 0084).
- A save with one field of the wrong shape loads the rest instead of failing at every start, and
  cancelling REPLACE SAVE? brings the pasted code back.
- A clear with Sweep off counts, whatever the charge slider says, and a ladder's own creature
  colours survive a reload and stay that ladder's.
- A right button let go off the board no longer swallows the next click, a pinch that loses a
  finger no longer jumps the zoom, and a card or window that closes gives the focus back.
- Escape on the crash card goes back to the list, Abandon run on the board-clear card asks first,
  and the tutor prices a guess through the creature-damage dial.

## 0.9.1 — 2026-09-28

The settings, the looks and the pre-release fixes, for the next round of play-testing.

- Thirty settings more, each visual one shown on a real board: a creature as its tier's digit,
  digit size, the mark colour, reach shading on the crawl ladders, the clock, the hint line, what a
  right-click does, a long press to mark on a touch screen, the glow and the motion after a fight,
  when the clear effect plays, what holds its card and its speed, the tutor's style and grade,
  which sounds play, and six gameplay dials (spell prices, starting mana, hidden counters, a sweep
  budget, a chord, a time limit). Presets (Tuned, Relaxed, Brutal; Low vision), a fullscreen
  button, and any of a board's look and sound chosen for one ladder alone.
- Five sound packs, seven board-clear effects, five creature icons, three looks for a beaten
  creature and two faces; seventeen ladders wear new defaults (decision 0078).
- A record remembers the board it was set on, so a retune moves no best time; the backup and
  statistics codes say which version wrote them; a save this version cannot read is set aside,
  never written over.
- A deal a seed refuses is dealt from the next seed, and an error nothing caught shows a card with
  the message and a way back, not a dead page.
- A key with Ctrl, Cmd or Alt held goes to the browser, and a Control-click marks, as on a Mac.
- 0.9.x stays the play-testing line whatever a cut adds; minors count from 1.0.0 (decision 0083).

## 0.9.0 — 2026-09-28

The first numbered version: the game as built through Milestone 5, for play-testing.

- 35 ladders of ten tuned boards, each carrying on past board 10, and a Full Run for each.
- The tutor's hints, the school's nine lessons and the field guide.
- Presentation settings, each visual one shown on a real board, and seven gameplay dials; a dial
  set easier than the tuned game records no clear, unlock or best time.
- Paused games, the save backed up as a code, and play statistics kept on the device.
- The Beaten toggle (`U`): the number under every beaten creature at once, which is how a touch
  screen sees them.
- An About card: the version, the credit to mamono sweeper, the licence, and the source on GitHub.
