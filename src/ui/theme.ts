/**
 * The colours every board shares and the names the settings screen gives things. The colours are
 * the annotations, each a colour of its own (a mark, a given, a Census, an Augur, the tutor, a
 * refused click), and the board's own structure (its outline, a pair's bond, Sudoku's box rules);
 * the names are the sound packs', the sound events' and the clear effects'. A creature is drawn
 * in `creature.ts`.
 */

import { rgbOf } from './colorspace.js';
import type { Pip, SfxEvent, SfxPackId, VictoryId } from './looktypes.js';
import { findSymbol, isGlyphPip } from './pipsymbols.js';
import { PIP_NAMES } from './pips.js';

/** What a pip is called: a shape's name, or a symbol's own. */
export function pipName(pip: Pip): string {
  return isGlyphPip(pip) ? (findSymbol(pip)?.symbol.name ?? pip) : (PIP_NAMES[pip] ?? pip);
}

/** Each sound pack as the settings screen names it. */
export const SFX_NAMES: Record<SfxPackId, string> = {
  chime: 'Chimes — soft bells',
  blip: 'Blips — arcade square waves',
  thud: 'Thuds — low and dry',
  glass: 'Glass — bright and brittle',
  wood: 'Wood — a marimba’s knock',
  pluck: 'Pluck — a plucked string',
  bubble: 'Bubbles — rising chirps',
  clock: 'Clockwork — dry ticks',
  organ: 'Organ — two voices held',
};

/** Every sound event, in the order the sound check lays them out. */
export const SFX_EVENT_NAMES: Record<SfxEvent, string> = {
  open: 'Open',
  cascade: 'Cascade',
  mark: 'Mark',
  note: 'Note',
  sweep: 'Sweep',
  blocked: 'Blocked',
  kill: 'Kill',
  battle: 'Hit',
  levelup: 'Level-up',
  spell: 'Spell',
  win: 'Win',
  lose: 'Lose',
};

/** Each board-clear effect as the settings screen names it. */
export const VICTORY_NAMES: Record<VictoryId, string> = {
  confetti: 'Confetti — falling chips',
  burst: 'Burst — rays from the centre',
  ripple: 'Ripple — expanding rings',
  sparkle: 'Sparkle — drifting motes',
  fireworks: 'Fireworks — rockets burst one after another',
  tumble: 'Tumble — creatures drop and bounce',
  cascade: 'Cascade — they bounce off, leaving trails',
  pop: 'Pop — they swell and burst',
  burn: 'Burn — they char away from the bottom up',
  wipe: 'Wipe across — a band carries them off',
  wipeDown: 'Wipe down — a band falls through them',
  wipeRadial: 'Wipe out — a ring from the centre',
  flip: 'Flip — they turn over like chequers',
  spin: 'Spin — they whirl into the centre',
  scatter: 'Scatter — they fly out from the centre',
  float: 'Float — they rise and drift away',
  march: 'March — they leave in ranks',
  swarm: 'Swarm — they buzz about, then stream away',
};

/** Marks are green, as in the original. Drawn with a dark outline so they
 *  survive light tiles like EASY's olive, where green alone disappeared. */
export const MARK_COLOR = '#35e06a';
export const MARK_OUTLINE = 'rgba(8, 8, 4, 0.8)';

/** Census results: a corner badge, deliberately unlike the centred number. */
export const CENSUS_COLOR = '#7ad9ff';

/**
 * Augur results: the opposite corner, in a cream that sits at least 117 RGB units from every
 * other annotation colour and from every look's `hot` (measured 27 September 2026, decision 0032's
 * rule), so no palette can make a beaten creature's number look like an Augur's answer.
 */
export const AUGUR_COLOR = '#ffffd2';

/**
 * The tutor's pointing finger: the numbers a proof read and the rings they see.
 *
 * Violet, which no other annotation uses: green is a claim, blue a Census, gold a given, red a
 * refusal, and the tutor is none of those. What the proof concludes is drawn in the colours the
 * player already reads, a safe cell in the mark green and a named cell in its tier's colour, so
 * the lesson says "this is what you would write" in the ink you would write it in.
 */
export const TUTOR_COLOR = '#d29cff';

/**
 * The line where the board meets the background.
 *
 * The board's silhouette and nothing else — not a grid. Cells keep their own
 * edges (a covered tile its bevel, cleared floor none), because what this is
 * for is telling you where the board IS: which is a question worth answering
 * on a rectangle and the whole picture on a shaped one, where the outline is
 * the rooms, the arms or the cave.
 *
 * Full white, because there is only one of these lines on screen rather than a
 * few thousand, so it can afford to be the brightest thing on the board.
 */
export const BOARD_OUTLINE = '#ffffff';

/**
 * The cursor over ground the crawl rule will not let you touch.
 *
 * Red, and the only red in the annotation palette, because it is the one
 * highlight that means "this click will do nothing" rather than telling you
 * something about the cell. It has to read at a glance against every ladder's
 * tile colour, which is why it is a saturated red rather than a dimmed green.
 * Colour is not all it says: a cell the click would not land on is crossed out
 * where one it would is boxed (decision 0051).
 */
export const OUT_OF_REACH_COLOR = '#ff5a5a';

/**
 * A Sudoku given: gold, against the green of a mark the player made.
 *
 * They are different kinds of claim and the board should not make you
 * remember which is which. Gold also reads as fixed — it is the one
 * annotation on the board you are not allowed to change.
 *
 * Reveal writes one of these too, on every ladder that carries magic. Same
 * argument exactly: a tier you bought with mana is the board talking, not a
 * hypothesis you wrote down, and it should neither look like one nor be
 * rubbed out like one.
 */
export const GIVEN_COLOR = '#f2c34e';

/**
 * The tie between the two halves of a defeated pair.
 *
 * Drawn for the same reason the Sudoku box rules are: the rule a board rests
 * on has to be visible or it is not a rule the player can use, and "these two
 * creatures belong to each other" is invisible on a finished grid — both cells
 * are just open creatures, exactly like any other.
 *
 * Translucent white rather than an annotation colour, and the choice is
 * deliberate. Green, gold and cyan all mean something the PLAYER or a spell
 * put there; this is a fact about the board's own structure, in the same
 * family as the silhouette, so it borrows the silhouette's white and steps
 * back from it. Every ladder's floor is dark, so one value reads on all of
 * them.
 */
export const BOND_COLOR = 'rgba(255, 255, 255, 0.5)';

/**
 * The 3x3 box rules.
 *
 * Near-black with a little transparency rather than a flat colour, so one
 * value sits correctly over both the washed boxes and the unwashed ones, and
 * over cleared floor as well as covered tile.
 */
export const BOX_RULE = 'rgba(8, 4, 12, 0.92)';

/** How far a pencil note's ink is dimmed from the mark's, as an alpha. */
const NOTE_ALPHA = 0.72;

/** Pencil marks: the mark's own colour, dimmed. A note is a weaker form of
 *  the same claim, so it should read as the same ink lightly applied rather
 *  than as a different kind of annotation. It wears the mark's dark outline
 *  too, which is what carries it on a light tile — see `drawNotes`. */
export function noteColor(markColor: string): string {
  const [r, g, b] = rgbOf(markColor);
  return `rgba(${r}, ${g}, ${b}, ${NOTE_ALPHA})`;
}
