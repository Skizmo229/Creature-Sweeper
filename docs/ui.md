# Presentation

The rules the UI follows and why. Nothing here touches a game rule; that is the point of the split
between `src/ui/settings.ts` (presentation) and `src/engine/settings.ts` (the gameplay dials).

## Screens and input

- Every screen begins with `root.replaceChildren()`. Anything that must survive navigation, such
  as the mute speaker, lives on `document.body` instead. Every screen change calls `endVictory()`
  and `closeAsk()`, or a frame loop or a modal keeps running against detached nodes.
- Confirmations go through `App.ask()`, an in-page overlay, never `window.confirm`: a suppressed
  dialog returns false instantly and the button silently dies. While a question is up, Escape
  answers it and every other key is swallowed.
- `.overlay` is `position: fixed`, because only the game screen is exactly one viewport tall.
- The LV palette is modal. Pencilling needs a mode *and* a tier, so entering pencil mode arms a
  tier (and hands it back on exit unless the player chose it); the toggle is labelled with the
  mode it is in (`Entry: Mark` / `Entry: Pencil`); pencil mode never falls through to opening;
  the hint line is rebuilt on every `refresh()` to say what a click does right now. The keyboard
  follows the same mode, and Shift inverts it for one keystroke. `markMode` is -1 for "nothing
  selected", because tier 0 is a real pencil choice. An armed tier and an armed spell are mutually
  exclusive; each arming clears the other.
- The cursor says whether *this* click would land (`App.clickLands`): reach while opening or
  casting, only annotation's own refusals while a tier is armed. The palette strikes through tiers
  the pencil refuses for the hovered cell.
- Two fingers pinch-zoom, and no lift in a touch that ever had two fingers down opens a cell. Only
  `pointerType === 'touch'` is tracked. The arithmetic is in `pinch.ts`.
- The board refits whenever its stage changes size (`ResizeObserver`), keeping a zoom the player
  chose; `F` and a window resize reset it. The zoom ceiling caps magnification only.
- The clock starts when the board is dealt. Time Attack counts down from the player's own best and
  reports expiry through `game.forfeit`; it is frame-driven, so a hidden tab registers expiry on
  its next frame.

## The board

- The board is outlined where it meets the background, as its silhouette (`drawSilhouette`),
  worked out per cell against the edge directions. Stroking every cell under the fills does not
  work because `tracePath` insets each cell by a pixel. Silhouette adjacency is deliberately not
  `neighboursOf`, which wraps; the seam is drawn dashed by `drawSeams`, per present cell.
- Absent cells and revealed empty floor must look different.
- A beaten creature shows its number while hovered (not on PAIRS or DOMINOES, by request). Its
  glyph is dimmed rather than washed; the strike-through is optional.
- Sudoku boards get a translucent wash on alternate boxes and a box rule about twice a cell edge,
  drawn in one pass; givens are gold (`GIVEN_COLOR`), player marks green. Pencil notes wear a dark
  outline because the dimmed green alone measured 1.22:1 on EASY.
- A palette's `hot` (the number on a beaten creature) must be told apart from its `ink`, not only
  from the floor; the shipped minimum separation is 93 RGB units. Gold is unavailable for `hot`
  wherever givens are drawn, and BLIND's near-white `ink` leaves only saturation to separate on.
- Palette and icon are separate settings; the menus keep the ladder's own accent whatever the
  board wears.
- The HUD says words (`Level`, `Next Level`, `TIME 12 LEFT`), no zero padding. The level number
  and the LV buttons wear the tier's creature colour (`tierColor`), with a gold stroke or border
  for tiers 6 to 9. Readouts are 1.9rem (1.7 on a phone), by request, so the HUD takes two rows on
  a laptop.
- The rules card leads with the sum rule and its proof (a number can exceed 8). Only EASY explains
  a death (`TEACHING_TYPE`); the loss note says "took your last N HP".

## Settings screen

- Every visual setting shows its options as tiles, and every tile is a real `Game` drawn by the
  real `BoardView` (`preview.ts` builds the boards; `settingsscreen.ts` renders them). Every tile
  in a gallery draws the same board from the same seed, so only the setting differs. The example
  boards open the highest tiers, show defeated creatures (the only way to show a glyph), and open
  numbered empty cells so a cascade does not clear the board.
- Icons, palette and font show two tiles, Default and User choice; the full gallery opens in a
  picker inside the settings element, which catches Escape in the capture phase.
- Picking a visual option rebuilds the whole screen and carries the scroll position, because the
  galleries are drawn in terms of each other. Exceptions: the zoom slider redraws in place; sound
  and the clear effect play themselves and update their own tiles.
- The clear-effect demo runs over a genuinely won board carrying one of every tier the real board
  uses (`previewTiers()` reads the live game). Test deals a new board; picking an effect replays
  on the same one. The demo seed is module-level so it outlives a rebuild.
- Every "game type default" option names what it resolves to (`TYPE_IDENTITY` in `theme.ts`,
  `TYPE_FONTS` in `typefaces.ts`, stitched by `identityFor`).
- Text size scales the interface (root font size, everything in rem) and not the board, applied
  on release with a HUD copy following the thumb.
- The cursor-highlight gallery draws on the grid of the ladder the player came from and needs
  `BoardView.pinHover`, because a thumbnail has no cursor.
- Settings that make the game easier than the tuned default record nothing (no clear, no unlock,
  no best time), and the screen, the ladder list and the clear overlay all say so.

## Fonts

- Every ladder has a bundled typeface (twenty-four, plus Atkinson Hyperlegible Next for anyone who
  wants the easiest one, plus Griffy for the title alone). Latin woff2 files in `src/ui/fonts/`,
  licences in `public/FONT-LICENSES.txt`, `@font-face` in `fonts.css`. `test/fonts.test.ts` checks
  all of it, and that every ladder's face is its own (see issue #5).
- A face must have lining figures; Georgia's old-style figures made numbers jump. Check a
  candidate's OS/2 metrics with fontTools: Aladin and Gluten misstate cap height
  (`capHeightFix`) and Aladin its x-height (`exHeightFix`).
- The board sizes digits to a measured height (`DIGIT_HEIGHT`) and centres them on measured ink;
  the interface uses `font-size-adjust: ex-height 0.52`, with `--ex-fix` per face, and anything
  that sets a face inline must declare its own adjust. A face can arrive a frame late, so
  `BoardView` repaints once when it lands and caches metrics only after.
- No glyph in the chrome can be assumed: the settings button is a word, the mute speaker is inline
  SVG. Only Latin-1 and general punctuation are safe.

## Sound and effects

- Sound is synthesised. The `AudioContext` is built lazily on the first sound and resumed on every
  call; every entry point swallows its own failure; one sound per action, the loudest event wins.
  Muting is not the same as the OFF pack, and the speaker is repainted from `applyPresentation`.
- Two families of clear effect: ambient (confetti, burst, ripple, sparkle) and icon (tumble,
  cascade, pop, burn, three wipes). Icon effects take the board's glyphs (`VictorySource`),
  pre-rendered per tier into an atlas at twice the cell size, and the board stops drawing them
  until the effect hands them back, even when cut short. Physics effects step by measured time
  clamped to 1/20 s; ambient ones keep a fixed step. Cascade never clears its canvas and fades the
  element instead. Sprites include covered creatures, for the search boards. Burn clips the real
  glyph. Effects draw on their own layer.

## Saves

- The save is `localStorage`, which itch.io's iframe may cap or clear, so **Back up / restore
  save** exports a `CS1:` base64 code (quotes survive chat apps, JSON does not). Import refuses a
  code that would load as a blank save. Changing `SaveData` means writing a migration; codes are in
  the wild. The settings reader ignores unknown keys, which is what lets a retired setting go
  without one.
