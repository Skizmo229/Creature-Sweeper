# Presentation

The rules the UI follows and why. Nothing here touches a game rule; that is the point of the split
between `src/ui/presentation.ts` and `src/ui/settings.ts` (the presentation settings and their
store) and `src/engine/settings.ts` (the gameplay dials).

## Screens and input

- Every screen begins with `root.replaceChildren()`. Anything that must survive navigation, such
  as the mute speaker, lives on `document.body` instead. Every screen change calls `endVictory()`
  and closes the modal, or a frame loop or a modal keeps running against detached nodes.
- Confirmations go through `Modal.ask` (`src/ui/overlays/modal.ts`), an in-page overlay, never
  `window.confirm`: a suppressed dialog returns false instantly and the button silently dies.
  While a question is up, Escape answers it and every other key is swallowed. A question takes
  the place of the overlay that asked it, so that overlay passes `onCancel` to come back when the
  answer is no (the save backup card does, keeping the pasted code).
- A board's keys reach it only while it is on screen (`App.onKey` checks the game screen is
  built), never under the settings screen or after the player has left it (issue #6). On the
  settings screen Escape is Back, to wherever it was opened from; a picker open over it takes the
  first Escape itself. On a board, Escape backs out one thing at a time: the spell, the tier, then
  the board (a Full Run asks first).
- A key with Ctrl, Cmd or Alt held never reaches the board: it is the browser's (Ctrl+H is its
  history), and only Shift is the board's, inverting the entry mode for a keystroke. A click with
  Control held marks as a right click does, since a Mac's Control-click arrives as the left button
  with the key in some browsers; the press marks and its lift opens nothing (decision 0082).
- An error nothing caught shows a card rather than a dead page (`CrashWatch`,
  `overlays/crash.ts`): what broke in the error's own words, the version, where to report it and
  Back to the list, once per breakage; Back, and Escape, rebuild the screen and re-arm it
  (decision 0081).
- `.overlay` is `position: fixed`, because only the game screen is exactly one viewport tall.
- The LV palette is modal. Pencilling needs a mode *and* a tier, so entering pencil mode arms a
  tier (and hands it back on exit unless the player chose it); the toggle is labelled with the
  mode it is in (`Entry: Mark` / `Entry: Pencil`); pencil mode never falls through to opening;
  the hint line is rebuilt on every `refresh()` to say what a click does right now. The keyboard
  follows the same mode, and Shift inverts it for one keystroke. `markMode` is -1 for "nothing
  selected", because tier 0 is a real pencil choice. An armed tier and an armed spell are mutually
  exclusive; each arming clears the other.
- The cursor says whether *this* click would land (`BoardActions.clickLands`): reach while opening
  or casting, only annotation's own refusals while a tier is armed. A cell a click would land on
  is boxed in the player's highlight colour (the mark green by default); one it would not is
  crossed out instead, corner to corner of its tile, in red over the dark outline a mark wears, so
  the refusal reads by its shape where the red does not: under red–green colour blindness, on a
  tile as bright as the red, or for a player who picked a red highlight (decision 0051). No
  setting changes the red (decision 0050). It is never dashed, because on the board a dash is a
  wrap seam or the tutor's narrowed cell. The palette strikes through tiers the pencil refuses for
  the hovered cell.
- Two fingers pinch-zoom, and no lift in a touch that ever had two fingers down opens a cell. Only
  `pointerType === 'touch'` is tracked. The arithmetic is in `pinch.ts`.
- A finger held still on a covered cell for the long-press setting's time (`longPress`, half a
  second by default, 0 for never) does what a right-click does, and its lift opens nothing; a
  finger that wanders, lifts early or is joined by a second does not (decision 0077). What a
  right-click does is itself a setting (`rightClick`): cycle the mark up, down, through the tiers
  still on the counters, or clear it; the arithmetic is `nextMark` in `game/actions.ts`.
- A click on an open cell chords when the player asks (`chord`, off by default): the cell's ring
  swept at a sweep's price, through `Game.sweepAt`, a move of its own (decision 0071). Off, the
  click is refused by the engine and sounds as one, as it always was.
- Back, and Escape, pause a board with a move in it without asking while `backPauses` is on;
  pausing loses nothing (decision 0057), so the question is only ever a chance to abandon.
- The hint line under the board can be switched off (`hintLine`); the tutor and a lesson speak
  there whatever it says, and the line hides again when they stop.
- The board refits whenever its stage changes size (`ResizeObserver`), keeping a zoom the player
  chose; `F` and a window resize reset it. The zoom ceiling caps magnification only.
- The clock starts when the board is dealt. Time Attack counts down from the player's own best and
  reports expiry through `game.forfeit`; it is frame-driven, so a hidden tab registers expiry on
  its next frame.
- The ladder list is four columns, one per category (Normal, Shape, Magic, Special), each in the
  order its ladders open; they fall to two and then one as the screen narrows (decision 0036).
  Under the title it says the game's version, read from `package.json` (decision 0068).
- The ladder list's names are 1.5rem, by request, and never wider than their card. Each records its
  longest word in ems once its face has arrived (`fitNames`), and the stylesheet caps its size by
  the card's width, so CHECKERBOARD comes down a little at laptop width, and any long word at a
  large text size. A name with a space in it breaks there first.
- The menus' cards have heavy edges, by request: a 2px border on a game-type card, with an 8px strip
  of the ladder's colour down its left, and a 3px warm-grey edge on a board tile (a 1px border
  inside a 2px outline of the same colour, because a tile's border carries its state). A hover
  turns a card's whole edge the ladder's colour, a tile's outline included, and darkens a game-type
  card's strip so it still stands apart. Where the strip goes is a setting (`menuStrip`): the left
  edge by default, both vertical edges, all four, or none.
- The settings screen's Back button is pinned to the top of the window, so the way out is always
  in reach however far down the screen is scrolled.

## The board

- The board is outlined where it meets the background, as its silhouette (`drawSilhouette`),
  worked out per cell against the edge directions. Stroking every cell under the fills does not
  work because `tracePath` insets each cell by a pixel. Silhouette adjacency is deliberately not
  `neighboursOf`, which wraps; the seam is drawn dashed by `drawSeams`, per present cell.
- Absent cells and revealed empty floor must look different.
- A beaten creature shows its number while hovered, and every one does while the game screen's
  Beaten toggle is on (`U`; decision 0067), which is how a touch screen sees them. Neither happens
  on PAIRS or DOMINOES, by request, nor on a search board, where nothing is beaten. How it is
  drawn is a setting (`beatenLook`): dimmed and struck through, the game's own; struck; crossed
  out, the stroke and its mirror, dimmed or not; dimmed, which reads better at small cells, where
  a stroke crosses the pips and an X crosses them twice; greyed, dimmed and drawn in the ink with
  no colour, so the live creatures' colours stand out; or plain. A creature can
  be drawn as its tier's digit instead of its pips, or as both (`glyph`, decision 0074); the clear
  effects draw with the same look.
- Sudoku boards get a translucent wash on alternate boxes and a box rule about twice a cell edge,
  drawn in one pass; givens are gold (`GIVEN_COLOR`), player marks the mark colour: the green of
  the original unless the player chose another, from presets measured clear of every annotation
  colour or their own (`markColor`, decision 0076). Pencil notes are that colour dimmed, and wear
  a dark outline because the dimmed green alone measured 1.22:1 on EASY.
- A palette's `hot` (the number on a beaten creature) must be told apart from its `ink`, not only
  from the floor; the shipped minimum separation is 93 RGB units. Gold is unavailable for `hot`
  wherever givens are drawn, and BLIND's near-white `ink` leaves only saturation to separate on.
- Palette and icon are separate settings; the menus keep the ladder's own accent whatever the
  board wears.
- The board's numbers, marks and pencil notes are sized to one measured height times the digit
  size setting (`digitSize`, `Paint.digitScale`); a creature's digit and the corner badges keep
  their own sizes.
- On DUNGEON and PETRI DISH the cells the crawl rule keeps out of reach can be shaded
  (`reachShading`, `drawReach`), off by default: the rule made visible where the cursor shows it
  one cell at a time. It reads nothing but the geometry the rule reads, and a sealed-in board,
  entirely in reach, draws no shade.
- The cursor highlight has a fourth shape, 'seen': over a covered cell the open numbers and beaten
  creatures beside it, the setup of every subtraction; over an open cell what it sees. Its line's
  thickness is a setting (`highlightWidth`), and the cross over a refused cell is drawn with it.
- A board opens fitted to its stage, or at the zoom ceiling when the player asks
  (`startAtCeiling`), panning when it does not fit; F and a resize fit it as ever.
- The HUD says words (`Level`, `Next Level`, `TIME 12 LEFT`), no zero padding. The clock reads
  in seconds, in minutes and seconds, or not at all (`clock`), running underneath whatever it
  shows. The LV buttons hide their counts under the hidden-counters dial (decision 0073), and
  Sweep's button says how many of a budget are left. The level number
  and the LV buttons wear the tier's creature colour (`tierColor`), with the halo, gold unless the
  player's own colours say otherwise, as a stroke or border for tiers 6 to 9. Readouts are 1.9rem (1.7 on a phone), by request, so the HUD takes two rows on
  a laptop.
- The rules card leads with the sum rule and its proof (a number can exceed 8). Only EASY explains
  a death (`TEACHING_TYPE`); the loss note says "took your last N HP".
- The About card (the list of game types, `src/ui/screens/about.ts`; decision 0069) says the
  version, the remix credit, the copyright and the GPL's notices, and links the licence, the
  source on GitHub, the original and the font notices. It is the game's only place with links, so
  they wear the accent and an underline, and each opens a tab of its own: on itch.io the game runs
  in a frame, and GitHub will not load inside one.
- The tutor (`H`, the "[H]int" button beside Sweep; `src/ui/game/tutor.ts` is its face,
  `src/sim/tutor.ts` its reading; docs/teaching-plan.md) speaks in the hint line, in the ink
  rather than the hint's grey, and points on the board in violet (`TUTOR_COLOR`), which no other
  annotation uses: the numbers a proof read are ringed, the covered cells they see lit faintly, a
  safe cell washed in the mark green, a named cell ringed in its tier's colour with the tier
  written on it, a narrowed cell ringed dashed with its candidates (or "≤n" for a ceiling). A
  beaten creature a proof read has its number written on it unless the board is already showing
  it, hovered or with the Beaten toggle on. It opens nothing and trusts no mark. Each press shows
  the next lesson; any move on the board dismisses it; the dev handle's `sync` dismisses it too.
  Every press is a hint: the clear card says how many, and a hinted board sets no best time
  (decision 0048); until one is set, its tile shows the fewest hints a clear took instead (decision
  0065). A Full Run's cards say it too: a board of the run its own count, the completed run the
  run's. The button is a presentation setting (Gameplay section, "Tutor"), because it changes no
  rule and no record.
- The field guide (`src/ui/screens/guide.ts`, its words in `src/ui/guide/entries.ts`;
  docs/teaching-plan.md, Part 3) is the catalogue in the game, for reading: an overlay that scrolls
  inside itself with its head and Close pinned, a section per catalogue section and a row of jumps
  to them. Its shape is the catalogue's, held to it by `test/guide.test.ts`; its words are the
  game's own, shorter (decision 0059). Each diagram is the
  catalogue's board drawn by a non-interactive `BoardView` in the look of the ladder the player is
  on, with the tutor's own lesson for it laid over and what the tutor says there beneath, in the
  tutor's violet; the damage table is the engine's formula, the costs that kill from 10 HP in the
  danger colour. It opens from the rules card, the ladder list, and on a board from `G` or the
  "more [G]" at the end of what the tutor says, at the entry for the trick it is showing (at a
  guess, Guessing well), marked in violet down its left. Escape closes it and leaves the lesson.
  A ladder's board list has "How to play" it, which opens the guide led by the catalogue's note on
  that ladder (section 7, `src/ui/guide/ladders.ts`; its blurb where the catalogue has none) and
  its own tricks marked in its colour; `G` on a board leads with the board's ladder the same way.
- The school (`src/ui/screens/school.ts`, the lessons in `src/ui/school/`; docs/teaching-plan.md,
  Part 2) is offered from the ladder list and the rules card ("Take the lessons") and required by
  nothing. A lesson is played on the game screen, labelled with its title and without Sweep: its
  step speaks in the hint line, in the ink, the tutor's violet points at the step's proof, and
  Next (or Enter) moves on where the step waits to be told. A click nothing has proven is refused
  before the engine sees it, the reason in the danger colour ahead of the step (a cell proven above
  the level says what the fight would cost), except in lesson 8, where guessing is the lesson. `H`
  and `G` work as on any board. A lesson's end is written down (the save's `lessons`) and offers
  the next; nothing a lesson does touches a ladder's record.
- Pausing (decision 0057): a Pause button in the HUD and `P`; not on a school lesson. Back (and
  Escape) asks Pause, Abandon or Keep playing on a game with a move in it, or any run; a board
  with no move made is left without a question. A tile with a game paused on it is dashed in the
  ladder's colour and its badge says `Paused · HP h/m` (a run adds its board); the scaling tile's
  button says Resume. The ladder list's card counts the ladder's paused games. A game an update
  has changed is refused with CANNOT RESUME, which offers to start the board again.
- A ladder whose rules add a trick of its own (the guide's ladder-only entries, asked of the rules)
  shows a card in the rules card's style the first time its boards are opened: the catalogue's
  note on it and those tricks, in the guide's words, with a way into the guide. Once only (the
  save's `ladderCards`), and never required.

## Settings screen

- Every visual setting shows its options as tiles, and every tile is a real `Game` drawn by the
  real `BoardView` (`preview.ts` builds the boards; `settingsscreen/render.ts` renders them).
  Every tile in a gallery draws the same board from the same seed, so only the setting differs.
  The example boards open the highest tiers, show defeated creatures (the only way to show a
  glyph), and open numbered empty cells so a cascade does not clear the board.
- The standard example, which the icon, palette, board font and strike galleries draw, shows
  every digit from 0 to 9 in the ink and every colour a palette paints on a board (decision 0034).
  Its thumbnails hold the cursor over a beaten creature, highlight off, because hover is the only
  way an example draws `hot` (the Beaten toggle never reaches the examples). It is dealt by
  rejection from the fixed seed until a layout shows all ten digits, so a change to the generator
  moves it rather than breaking it.
- Icons, palette and the two fonts show two tiles, Default and User choice; the full gallery opens
  in a picker inside the settings element, which catches Escape in the capture phase.
- The palette and font windows can be sorted, by a row of buttons under the title (decision
  0052): by ladder, the default, under the ladder list's own column heads and in its order; by
  name; and then by how the option looks. A palette sorts by colour, round the wheel by the
  covered tile's hue, with the greys last and lightest first. A face sorts by style, under its
  kind (`FONT_KINDS`), and by ladder is filed once, under the first ladder in the list that wears
  it, after Atkinson Hyperlegible Next, which leads under "Easiest to read", and before any other
  face no ladder wears, filed last under "No ladder’s own"; its tile names every ladder that wears
  it, or, for a face none does, says what it is for (`blurb`). A sort moves the tiles already
  drawn. Each window reopens in the order it last showed, as the symbol window reopens on its set;
  the icon window, with seventeen tiles, has no sorts.
- The icon picker's last tile, Custom, opens a window of symbols in place of the picker: all of
  Dingbats and Wingdings 1 to 3, a tab per set, each laid out as its font's code chart, sixteen to a
  row, with gaps where the font has nothing, so a symbol is where anyone who knows the font expects
  it. Pointing at one, or focusing it, shows it on the standard example board; clicking chooses it
  and "Use this symbol" (or a double click) saves it. The arrow keys move through the chart. The
  window reopens on the set it last showed. Only one window is ever open, so Escape closes it alone.
- The interface font's tiles are the one gallery that is not boards: each is a copy of the HUD's
  first two readouts, in the real HUD's classes, set in its face. Picking one dresses the whole
  screen at once, so the page is its own example.
- Picking a visual option rebuilds the whole screen and carries the scroll position, because the
  galleries are drawn in terms of each other. Exceptions: the zoom slider redraws in place; sound,
  the glow after a fight and the clear effect play themselves and update their own tiles.
- The glow after a fight is shown on the standard example board in a stage of its own, and three
  buttons act out a clean fight, a level-up and a hit through `flashRim`, the game's own code,
  under the option chosen, so the difference between the options can be tried.
- The clear-effect demo runs over a genuinely won board carrying one of every tier the real board
  uses (`previewTiers()` reads the live game). Test deals a new board; picking an effect replays
  on the same one. The demo seed is module-level so it outlives a rebuild.
- Every "game type default" option names what it resolves to (the ladder's record in `LOOKS`,
  `src/ui/looks.ts`, read through `lookFor`).
- Text size scales the interface (root font size, everything in rem) and not the board, applied
  on release with a HUD copy following the thumb.
- Preview size (50% to 300%) scales every example board on the screen and in its windows, by
  request: the thumbnails, the glow and clear-effect demos and the custom icon's example. Not the
  zoom example, which is drawn at the size it sets. Cells are rounded to whole pixels. Like text
  size it applies on release, holding the row under the pointer, with one thumbnail following the
  thumb; tiles and the symbol window's side panel grow with it (`--chip-w`).
- The creature colours' gallery draws one beaten creature of every tier, 1 to 5 over 6 to 9
  (`tierSampleBoard`), as dimmed and struck as they are in play: the game's own five hues, the
  presets chosen by measurement (decision 0053), and a Custom tile, lit while the player's own
  colours are in force and keeping them while a preset is. Its window has a swatch for each tier
  and one, a ring, for the halo; the mixer of the highlight colour's window mixes whichever is
  chosen, a row of buttons starts again from any preset or the player's own, and the example
  redraws as they move. Only "Use these colours" saves. The colours are global, so no ladder's
  default names them; they reach the board, the level number, the LV buttons, the tutor's named
  cell and the clear effects' glyphs and confetti.
- The cursor-highlight gallery draws on the grid of the ladder the player came from and needs
  `BoardView.pinHover`, because a thumbnail has no cursor. So does the highlight colour's, in the
  player's shape of highlight (the default's while it is off): the game type's green, four presets
  chosen by measurement (decision 0050), and a Custom tile, lit while a colour of the player's own
  is in force. Its window mixes any colour from a slider for each of red, green and blue, each
  track showing the colours its slider reaches from where the others stand, with a number to type
  beside each and the hex; the example redraws in place as they move, and only "Use this colour"
  (or Enter in a field) saves and rebuilds. The colour is shown beside the red of a click that
  would do nothing, with a warning within `NEAR_REFUSAL` of it. Both galleries, and the window's
  example, show a refusal as well: the covered cells right of the lit one are out of reach
  (`highlightSampleLands`), so where the highlight lights a ring they are crossed out beside the
  boxes (decision 0051).
- Settings that make the game easier than the tuned default record nothing (no clear, no unlock,
  no best time), and the screen, the ladder list and the clear overlay all say so.
- Each gameplay slider is shaded by how far it sits from the tuned default, by request: toward
  white as it gets easier (pure white at the easiest end), toward black as it gets harder (pure
  black at the hardest). The readout beside it keeps the accent, since black text would vanish on
  the dark panel.
- The screen is four sections: Presentation (what a board looks and sounds like), Interface (the
  page around it), Sound (the volume, which sounds play, the custom pitches) and Gameplay (the
  dials, the chord, the tutor). Under the title a switch says whom the choices are for: every
  ladder, or the ladder the screen was opened from alone (decision 0070). In a ladder's scope only
  Presentation shows, a line names what the ladder has of its own, and a button gives it up;
  every row that saves goes through `ctx.set` or `ctx.pick`, which know the scope.
- Every slider carries a Reset to its default, lit only while it stands elsewhere, which moves
  it through the slider's own events so everything listening hears it.
- Presets are one-click bundles: Tuned, Relaxed and Brutal for the dials, each from the tuned
  game, and Low vision for the look. Fullscreen is a button, since a browser grants it from a
  click only, disabled where the browser does not offer it.
- The tutor's rows sit with the dials: whether it is offered, how much a hint says (the whole
  lesson, or only where to look: the numbers ringed and nothing concluded), and the dearest grade
  it tries, which says when nothing under it proves a move rather than calling the board a guess.

## Fonts

- Two settings: the board's font (its numbers and marks, on the canvas) and the interface's
  (everything in the DOM: the HUD, the menus, the settings screen, the ladder list's names). Each
  defaults to the ladder's own face, independently. Only a face chosen for the interface reaches
  the title, and a save from before the split reads its one font as both (decision 0033).
- Every ladder has a bundled typeface (twenty-five, plus two that no ladder wears, Atkinson
  Hyperlegible Next for anyone who wants the easiest one and Press Start 2P for the arcade, plus
  Griffy for the title alone). Latin woff2 files in `src/ui/fonts/`,
  licences in `public/FONT-LICENSES.txt`, `@font-face` in `fonts.css`. `test/fonts.test.ts` checks
  all of it, and that every ladder names a bundled face, which two ladders may share (decision
  0031).
- One more family is bundled for the creature icons, not for text: `Pip Symbols`, four faces cut
  from open Noto fonts to the 782 symbols the custom icon offers (`src/ui/pipfont/`, their
  `@font-face` in `pipfont/pipfont.css`, licences in the same file). `test/pipsymbols.test.ts`
  checks them as `test/fonts.test.ts` checks the rest; see the creature-icon bullet below.
- Every face is filed under a kind in `FONT_KINDS` (`src/ui/typefaces.ts`), for the font windows'
  Style order: sans serif, rounded, squared, condensed, serif (slabs included), monospaced or
  decorative. It is a judgement by eye, and a new face cannot typecheck without one.
- A face must have lining figures; Georgia's old-style figures made numbers jump. Check a
  candidate's OS/2 metrics with fontTools: Aladin and Gluten misstate cap height
  (`capHeightFix`) and Aladin its x-height (`exHeightFix`).
- The board sizes digits to a measured height (`DIGIT_HEIGHT`) and centres them on measured ink;
  the interface uses `font-size-adjust: ex-height 0.52`, with `--ex-fix` per face, and anything
  that sets a face inline must declare its own adjust. A face can arrive a frame late, so
  `BoardView` repaints once when it lands and caches metrics only after.
- The browser's own stylesheet resets the face and the adjust on a button or a select. A rule that
  gives a control back its face (`font-family: inherit`) gives back the adjust too, or its labels
  grow and shrink with the face; `test/fonts.test.ts` holds that.
- A field sized to what it holds is sized in `ch` for its text alone (`box-sizing: content-box`),
  because `ch` follows the face and its padding and spin buttons do not. The custom colour
  window's numbers, `7ch` with both counted in, clipped "255" in the five narrowest faces;
  `test/ui/highlightcolor.test.ts` holds the fix.
- No glyph in the chrome can be assumed: the settings button is a word, the mute speaker is inline
  SVG. Only Latin-1 and general punctuation are safe.
- A creature's pips can be a symbol rather than a shape (`icons: 'U+2764'`). Wingdings is
  Microsoft's and cannot ship, so the symbols are its Unicode equivalents, drawn from open fonts cut
  down to them (`src/ui/pipfont/`, the one family `Pip Symbols`, one face per source with a
  unicode-range each, so every symbol has exactly one face). `scripts/pip_symbols.py` rebuilds them
  from `src/ui/pipsymbols.json`; `test/pipsymbols.test.ts` holds the table, the faces and the
  licences together (decision 0035). A symbol is scaled so the longer side of its measured ink spans
  the pip, centred on it; a gilded tier's halo is its outline stroked at 0.6 of a drawn pip's,
  because stroking a symbol strokes its holes too. `BoardView` waits for the face of the symbol in
  use as it waits for its number font.

## Sound and effects

- Sound is synthesised. The `AudioContext` is built lazily on the first sound and resumed on every
  call; every entry point swallows its own failure; one sound per action, the loudest event wins.
  Muting is not the same as the OFF pack, and the speaker repaints itself on every settings change.
- Sounds can be silenced one by one (`silenced`, a list of events): the Sound section offers every
  sound, no sound per cell, or results only, and the sound check a box per sound. The mixer passes
  over a silenced event in play and auditions it still, and an action whose loudest sound is
  silenced makes its next loudest (`game/sound.ts`), so silencing the kill leaves the click.
- The speaker carries the Sound effects volume (the same setting, not a second one), hidden, by
  request, until the speaker is hovered or reached by Tab, and held open while its thumb is held.
  It drops beneath the speaker, because beside it the pointer would cross it on the way to the
  HUD's Settings and Back. Moving it unmutes: reaching for the volume is reaching to hear it. The
  settings screen's own slider follows it while that screen is open.
- The sound check (a button under the Sound effects gallery) plays any pack's sound through
  `Sfx.audition`, which ignores the chosen pack and the throttle but not mute. Keys assigned there
  play only while its window is open. Its keyboard (C2 to C7, equal temperament) retunes the last
  sound clicked or played by its key: every voice is scaled by one factor, so the first lands on
  the chosen note and the rest keep their intervals. Keys and pitches are saved in the
  presentation settings (`soundCheck`, sounds named `pack:event`), so a backup code carries them
  and Reset presentation clears them. The pitches reach the game's own mixer (`Sfx.setPitches`,
  from `applyPresentation`) only while "Custom pitches in play" is on, which it is not by default. Clicking the keyboard hands the computer's keys to it (A to
  K the white keys, the row above the black, Z and X the octave); Shift pressed and released alone
  swaps between that and the assigned keys, and Escape steps back one mode before it closes the
  window. Its volume slider (0 to 300% of each sound's level) is saved beside them and is passed
  to `Sfx.audition` alone, so the game's own sounds never hear it. Note names are green, apart
  from the ladder's accent.
- A clear uncovers every cell still covered, by request (`revealAllCells`): the empty ground a
  battle board never needed opened shows its number, and a search board's creatures, never
  fought, show as a loss shows them. The clear effect plays over the uncovered board.
- Two families of clear effect: ambient (confetti, burst, ripple, sparkle, fireworks) and icon
  (tumble, cascade, pop, burn and three wipes in `victory/icons.ts`; flip, spin, scatter, float,
  march and swarm in `victory/departures.ts`). Icon effects take the board's glyphs (`VictorySource`),
  pre-rendered per tier into an atlas at twice the cell size, and the board stops drawing them
  until the effect hands them back, even when cut short. Physics effects step by measured time
  clamped to 1/20 s; ambient ones keep a fixed step. Cascade never clears its canvas and fades the
  element instead. Sprites include creatures never fought, for the search boards. Burn clips the real
  glyph. Effects draw on their own layer, stacked inside the stage (`isolation: isolate`), so the
  clear card covers the effect, by request, rather than the effect's glyphs flying across the
  card's buttons.
- The first clear of a board holds its card back for two and a half seconds, by request, so the
  clear effect plays over the board itself, undimmed and with no card in the middle of it
  (`.overlay.held`). Until then the overlay is clear but still takes the pointer, so the board
  cannot be zoomed or panned out from under the effect and no hidden button can be pressed;
  Escape still leaves. A first clear is one the save had never recorded. A replay, a loss and a
  clear with the effect off (nothing to watch) show the card at once. A Full Run never holds one:
  its boards were all cleared before it opened, and between boards its clock is still running.
  What holds the card (the effect's length, a click anywhere, or nothing), whether the effect plays
  on every clear or a board's first only, and its speed, which scales a physics effect's step as
  well as its length, are settings (decision 0075).
- A fight that costs HP shakes the stage, and a level-up glows inside it. They are the stage's own
  animations, one slot each in its `animation` list, filled by the `shake` and `levelup` classes.
  Two rules setting `animation` would let one displace the other, and a class left on after its
  animation played would block the other for the rest of the board. Both follow the motion
  setting (`motion`): both, the glow alone, or neither, under the system's reduced-motion
  preference as ever; the settings screen's glow example plays them too.
- A fight lights the stage's rim, fading inward: green when it cost nothing, blue when it levelled
  the player up, red when it cost HP. One rim per action, since a sweep can fight several: red if
  any fight in it hurt, else blue if it levelled up, else green. The player can keep it for every
  fight, for level-ups and damage only (blue and red, no green), for damage only, or turn it off
  (`fightRim`); the
  shake and the level-up glow ignore it. The blue is deeper than the cyan of a spell's targeting
  outline, which sits in the same place. It is `.stage::after`, over the canvas so it shows
  however much of the stage the board covers, and deaf to the pointer. Only one of the three rim
  classes is on the stage at a time, or the later rule would keep its colour for good. It stays
  on under reduced motion, which drops the shake and the glow.

## Saves

- The save is `localStorage`, which itch.io's iframe may cap or clear, so **Back up / restore
  save** exports a `CS1:` base64 code (quotes survive chat apps, JSON does not). Import refuses a
  code that would load as a blank save. Changing `SaveData` means writing a migration; codes are in
  the wild. The settings reader ignores unknown keys, which is what lets a retired setting go
  without one. Each ladder's own presentation settings travel under `ladders`, kept only where
  the save held a value (decision 0070).
- A stored save this build cannot read, a newer version's or a damaged one, is set aside under
  its own key (`keptKey`) as it loads, before the first visit's write, and the ladder list says so
  until Reset progress clears it with the rest; the play statistics are kept the same way
  (decision 0080). Both codes carry `game`, the version that wrote them, which the restore
  question and the statistics reader name.
- A board's record is stamped with the board's fingerprint, a hash of the config it is dealt
  from, and a Full Run's with the ladder's; a record stamped with another tuning's keeps its clear
  and offers no time, so a retune moves no best time and locks nothing (`boardFingerprint`,
  decision 0079). The readers take the ladders table for it.
- The play statistics (decision 0060) are a third store, `creature-sweeper.telemetry.v1`, never
  inside the save code: per board, attempts and how they ended, opens and guesses, sweeps, casts,
  hints, HP lost, seconds and what dealt each death, tuned and modified dials apart. The backup
  screen shows them as a `CST1:` code to copy; Reset progress clears them with the rest.
