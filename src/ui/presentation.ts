/**
 * The presentation settings: what each one is, the options it offers and its default, and how a
 * saved one is read back. None of it touches a rule, so none of it can affect whether a clear is
 * recorded (docs/ui.md). The store that keeps them, and what each resolves to on a ladder, is
 * `settings.ts`; this file is the data, kept apart so that file stays the size a reader can hold.
 *
 * Every setting has the same three-way shape the player asked for: `'default'` means "whatever
 * this game type says", a named value means "this, everywhere", and where it makes sense `'off'`
 * means "not at all". `'default'` is not a value, it is a deferral, which `Settings` resolves.
 *
 * A saved file is untrusted input: it may predate a setting, postdate one that was removed, or
 * have been edited by hand. Every reader here falls back to the default rather than throwing,
 * because a settings file is never worth losing a save over.
 */

import { snapRatio } from '../engine/settings.js';
import {
  type Pip,
  SFX_EVENTS,
  type SfxEvent,
  type SfxPackId,
  type VictoryId,
} from './looktypes.js';
import { TIER_COUNT, type TierPalette, type TierPresetId } from './tiercolors.js';
import { type FontId, migrateFontChoice } from './typefaces.js';

/** "Use the game type's own" — a deferral, not a value. */
export const DEFAULT = 'default';
/** "None at all" — only offered where silence is a sensible answer. */
export const OFF = 'off';

/** A drawn shape, or a symbol from the custom-icon window, written as `U+2764`. */
export type IconChoice = typeof DEFAULT | Pip;
/** A game type id, whose palette is borrowed wholesale. */
export type PaletteChoice = typeof DEFAULT | string;
export type FontChoice = typeof DEFAULT | FontId;
export type SfxChoice = typeof DEFAULT | typeof OFF | SfxPackId;
export type VictoryChoice = typeof DEFAULT | typeof OFF | VictoryId;

/**
 * How much of the board the cursor lights up.
 *
 * 'neighbours' is what the game has always done and what every type defaults
 * to: the hovered cell plus everything genuinely adjacent to it, which on a
 * hex board is six cells and on a wrapped board jumps across the seam. That
 * last part is the reason it is worth keeping as the default — it teaches the
 * topology faster than any amount of explaining.
 *
 * 'block' is the literal 3x3 square regardless of topology, for a player who
 * wants a steady shape rather than a truthful one.
 */
export type HighlightStyle = 'neighbours' | 'cell' | 'block';
export type HighlightChoice = typeof DEFAULT | typeof OFF | HighlightStyle;

export const HIGHLIGHT_NAMES: Record<HighlightStyle, string> = {
  neighbours: 'True neighbours — follows hex and wrapped edges',
  cell: 'Just the cell under the cursor',
  block: 'Flat 3×3 block, whatever the board shape',
};

/** A colour as `#rrggbb` in lower case, or the game type's own, the mark green. */
export type HighlightColorChoice = typeof DEFAULT | string;

/**
 * The colours the cursor highlight is offered in besides the game type's green, which every ladder
 * defaults to; the Custom tile makes any other. Chosen by measurement against every palette and
 * against the red a click that would do nothing is lit in (decision 0050): white stands out on the
 * most tiles and yellow next, and with red–green colour blindness, where the green is the hardest
 * of them to tell from the red, magenta is the easiest, cyan holds for the commoner kind and
 * yellow for the other.
 */
export const HIGHLIGHT_COLORS: readonly { readonly name: string; readonly color: string }[] = [
  { name: 'White', color: '#ffffff' },
  { name: 'Yellow', color: '#ffeb3b' },
  { name: 'Cyan', color: '#2ee6ff' },
  { name: 'Magenta', color: '#ff4dff' },
];

/** A colour as `#rrggbb` in lower case, or the game type's own, the mark green. */
export type MarkColorChoice = typeof DEFAULT | string;

/**
 * The colours a mark is offered in besides the game's green, the Custom tile making any other. A
 * mark shares the board with the other annotations, each a colour of its own (decision 0032), so
 * every preset stands at least `NEAR_REFUSAL` from each of them: the red of a refused click, the
 * gold of a given, the blue of a Census, the cream of an Augur and the violet of the tutor.
 * Measured 28 Sep 2026 as the highlight's were: lime is 57 from the nearest, magenta 49 and
 * blue 42, where white sits 23 from the cream, yellow 26 from the gold and cyan 17 from the blue.
 */
export const MARK_COLORS: readonly { readonly name: string; readonly color: string }[] = [
  { name: 'Lime', color: '#b6ff3a' },
  { name: 'Magenta', color: '#ff4dff' },
  { name: 'Blue', color: '#3d6dff' },
];

/**
 * A colour written in hex, `#2ee6ff` or the short `#2ef`, with or without its '#' and in either
 * case, as the setting keeps it: `#rrggbb` in lower case. Null for anything else.
 */
export function readHexColor(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())?.[1]?.toLowerCase();
  if (!digits) return null;
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits}`;
}

/** The player's own tier colours, mixed in the custom window and kept in `customTierColors`. */
export const CUSTOM_TIERS = 'custom';
/** The colours a creature's tiers are drawn in: the game's own, a preset, or the player's own. */
export type TierColorChoice = typeof DEFAULT | TierPresetId | typeof CUSTOM_TIERS;

/**
 * What a creature is drawn as: its pips, a die face of its tier, the game's own; its tier as a
 * digit, which reads at a cell size where seven pips do not; or both, the pips with the digit in
 * the corner. Only a beaten creature is ever drawn, so the digit tells nothing the pips did not.
 * Decision 0012 retired a setting that wrote the tier over the glyph on hover, which could not
 * share the cursor with the number; a glyph style is drawn always and shares nothing.
 */
export type CreatureGlyph = 'pips' | 'digit' | 'both';
const CREATURE_GLYPHS: readonly CreatureGlyph[] = ['pips', 'digit', 'both'];

/**
 * How a beaten creature is drawn: dimmed and struck through, which is how the game always drew
 * it; struck through at full strength; dimmed alone, which reads better at small cell sizes,
 * where the stroke crosses the pips; or plain, exactly as a live one would be, for a player who
 * reads "beaten" from the open floor under it.
 */
export type BeatenLook = 'dimStrike' | 'strike' | 'dim' | 'plain';
const BEATEN_LOOKS: readonly BeatenLook[] = ['dimStrike', 'strike', 'dim', 'plain'];

/** A beaten look as its two parts: whether the glyph is dimmed, and whether it is struck. */
export function beatenParts(look: BeatenLook): { dim: boolean; strike: boolean } {
  return {
    dim: look === 'dimStrike' || look === 'dim',
    strike: look === 'dimStrike' || look === 'strike',
  };
}

/**
 * Which fights light the edge of the board. 'every' is green for a fight that cost nothing, blue
 * for one that levelled the player up and red for one that hurt; 'levelups' keeps the blue and
 * the red and leaves the green out, since clean fights are most of a board; 'off' is none. See
 * `game/flash.ts`.
 */
export type FightRim = 'every' | 'levelups' | typeof OFF;
const FIGHT_RIMS: readonly FightRim[] = ['every', 'levelups', OFF];

/**
 * What the stage does of its own accord after a fight: the shake when a fight cost HP and the
 * glow inside the stage on a level-up, both of them, the glow alone, or neither. The rim is the
 * fight glow's setting and not this one. Before this existed only the operating system's
 * reduced-motion preference could switch them off, and it still does.
 */
export type Motion = 'full' | 'noShake' | 'none';
const MOTIONS: readonly Motion[] = ['full', 'noShake', 'none'];

/**
 * What a right-click on a covered cell does: cycles the mark up through the tiers, as the game
 * always did; cycles it down; cycles only through the tiers still on the counters, so a tier the
 * board has none of is passed over; or clears the mark. On a nine-tier board the cycle is nine
 * clicks, which is what the others are for. An LV button or a number key marks a tier outright
 * whatever this says.
 */
export type RightClick = 'cycleUp' | 'cycleDown' | 'cycleCounters' | 'clear';
const RIGHT_CLICKS: readonly RightClick[] = ['cycleUp', 'cycleDown', 'cycleCounters', 'clear'];

/**
 * How the HUD's clock reads: seconds, as the game has always counted; minutes and seconds; or not
 * at all, for a player who plays better without a timer over them. The clock runs underneath
 * whatever this says, so a best time and Time Attack are what they were.
 */
export type ClockStyle = 'seconds' | 'minutes' | 'hidden';
const CLOCK_STYLES: readonly ClockStyle[] = ['seconds', 'minutes', 'hidden'];

/**
 * Where a game-type card on the ladder list wears its ladder's colour: down its left edge (the
 * default), down both vertical edges, all the way round, or nowhere.
 */
export type MenuStrip = 'left' | 'sides' | 'all' | typeof OFF;
const MENU_STRIPS: readonly MenuStrip[] = ['left', 'sides', 'all', OFF];

/**
 * How large the interface's text can be set, as a multiple of the browser's
 * own size. Applied as the root font size, which every size in the stylesheet
 * is written against, so the HUD, the menus and this screen all follow it and
 * the board — a canvas, sized by its cells — does not.
 */
export const MIN_TEXT_SIZE = 0.75;
export const MAX_TEXT_SIZE = 1.75;
export const DEFAULT_TEXT_SIZE = 1;

/**
 * How large the settings screen's example boards can be drawn, as a multiple of the size each
 * was designed at. Every example but the zoom ceiling's, which is drawn at the size it sets.
 */
export const MIN_PREVIEW_SIZE = 0.5;
export const MAX_PREVIEW_SIZE = 3;
export const DEFAULT_PREVIEW_SIZE = 1;

/**
 * How large the board's numbers, marks and pencil notes are drawn, as a multiple of the size each
 * was designed at. The interface's text has its own size; this is the board's, a low-vision aid
 * the board lacked. A creature's digit and the corner badges keep their own sizes.
 */
export const MIN_DIGIT_SIZE = 0.7;
export const MAX_DIGIT_SIZE = 1.4;
export const DEFAULT_DIGIT_SIZE = 1;

/**
 * How long a finger holds a covered cell before the hold does what a right-click does, in
 * milliseconds; 0 for never. A touch screen has no right-click, so without this the LV buttons
 * are its only way to mark. Half a second is long enough that a slow tap still opens.
 */
export const MIN_LONG_PRESS = 0;
export const MAX_LONG_PRESS = 1000;
export const DEFAULT_LONG_PRESS = 500;

/** Cell sizes the zoom ceiling can be set to, in CSS pixels. */
export const MIN_MAX_ZOOM = 24;
export const MAX_MAX_ZOOM = 128;
export const DEFAULT_MAX_ZOOM = 48;

/**
 * What the sound check keeps between sessions: the computer keys assigned to sounds and the notes
 * sounds are tuned to. A sound is named `pack:event` (`sfxSoundId`). Plain records, so the save
 * and its backup code stay plain JSON.
 */
export interface SoundCheckSettings {
  /** A computer key, as the sound check names it, to the sound it plays. */
  readonly keys: Readonly<Record<string, string>>;
  /** A sound to the MIDI note it is tuned to. */
  readonly pitches: Readonly<Record<string, number>>;
  /**
   * The sound check's own volume, as a multiple of each sound's level in play. It scales only
   * what the sound check plays; the game's sounds never see it.
   */
  readonly volume: number;
}

/** Loud enough to hear a quiet sound clearly, short of drowning the room. */
export const MAX_SOUND_CHECK_VOLUME = 3;

/**
 * Three times the level each pack was voiced at, as loud as the sound check goes. Past 1, the
 * mixer's limiter holds the peaks down, so a loud setting cannot clip or blast.
 */
export const MAX_SFX_VOLUME = 3;
/** The level every pack was voiced at, and what a save from before the setting reads as. */
export const DEFAULT_SFX_VOLUME = 1;

export interface PresentationSettings {
  readonly icons: IconChoice;
  /** What a creature is drawn as: its pips, its tier as a digit, or both (`CreatureGlyph`). */
  readonly glyph: CreatureGlyph;
  /** The colour of each creature tier, wherever a tier is drawn: the board, the HUD, the LV buttons. */
  readonly tierColors: TierColorChoice;
  /**
   * The tier colours the player mixed, or null for none yet. Kept while a preset is chosen, so the
   * Custom tile still holds them to go back to.
   */
  readonly customTierColors: TierPalette | null;
  readonly palette: PaletteChoice;
  /** The face of the board's numbers and marks. */
  readonly font: FontChoice;
  /**
   * The face of the HUD, the menus and the settings screen: everything but the board. A face
   * chosen here dresses the game's title too, which the board's font never does.
   */
  readonly interfaceFont: FontChoice;
  readonly sfx: SfxChoice;
  /**
   * How loud the game's sounds are, as a multiple of each pack's own level. The sound check
   * has a volume of its own and does not follow this one.
   */
  readonly sfxVolume: number;
  readonly victory: VictoryChoice;
  readonly highlight: HighlightChoice;
  /**
   * The colour the cursor lights a cell in when a click there would land. A click that would do
   * nothing is lit red whatever this is, because red is what says so (decision 0050).
   */
  readonly highlightColor: HighlightColorChoice;
  /**
   * The colour of the player's marks and, dimmed, their pencil notes, and of a wrapped board's
   * seam; the cursor highlight follows it unless it has a colour of its own. The game's own is
   * the green of the original.
   */
  readonly markColor: MarkColorChoice;
  /** How a beaten creature is drawn (`BeatenLook`). */
  readonly beatenLook: BeatenLook;
  /** Size of the board's numbers, marks and pencil notes, as a multiple. */
  readonly digitSize: number;
  /**
   * Whether the cells the crawl rule keeps out of reach are shaded (DUNGEON, PETRI DISH). The
   * rule made visible where the cursor shows it one cell at a time; it reads nothing but the
   * geometry the rule itself reads.
   */
  readonly reachShading: boolean;
  /** Which fights light the edge of the board. The shake and the level-up glow are not this. */
  readonly fightRim: FightRim;
  /** The stage's own shake and glow after a fight (`Motion`); the rim above is separate. */
  readonly motion: Motion;
  readonly menuStrip: MenuStrip;
  /** How the HUD's clock reads, or whether it shows at all (`ClockStyle`). */
  readonly clock: ClockStyle;
  /** What a right-click on a covered cell does (`RightClick`). */
  readonly rightClick: RightClick;
  /** How long a touch holds a cell before it does what a right-click does, in ms; 0 for never. */
  readonly longPress: number;
  /**
   * Whether Back, and Escape, pause a board with a move in it at once rather than asking whether
   * to pause or abandon it. Pausing loses nothing (decision 0057), so the question is only ever
   * a chance to abandon; a player who never wants that can skip it.
   */
  readonly backPauses: boolean;
  /**
   * Whether the line under the board says what a click does right now. Off, the line is kept for
   * the tutor and a lesson, which speak there, and hidden otherwise: once the controls are known
   * it is the busiest line on the screen.
   */
  readonly hintLine: boolean;
  /** Ceiling for manual zoom, in CSS pixels per cell. */
  readonly maxZoom: number;
  /**
   * Whether every board opens at the zoom ceiling, panning when it does not fit, rather than
   * shrunk to fit the stage: a board of one fixed cell size, as Minesweeper players expect. F
   * fits it as ever.
   */
  readonly startAtCeiling: boolean;
  /** Size of the interface's text — HUD, menus, settings — as a multiple. */
  readonly textSize: number;
  /** Size of the settings screen's example boards, as a multiple. */
  readonly previewSize: number;
  /**
   * Silence everything, from the always-present speaker in the corner.
   *
   * Deliberately NOT the same thing as setting `sfx` to OFF, even though both
   * end in silence. The pack is a taste — which of five voices the game
   * speaks in — and muting is a circumstance: someone walked in, the room is
   * quiet, it is late. Folding the second into the first would throw the
   * player's chosen pack away every time they silenced the game for a minute,
   * and there would be nothing to restore when they turned it back on.
   */
  readonly muted: boolean;
  readonly soundCheck: SoundCheckSettings;
  /**
   * The sounds the game does not play, by event. On a big board the click of every cell opened is
   * most of what is heard, and a player may want only the fights and the results; the sound check
   * still auditions a silenced sound. An action whose loudest sound is silenced makes its next
   * loudest instead (`game/sound.ts`).
   */
  readonly silenced: readonly SfxEvent[];
  /**
   * Whether sounds retuned in the sound check play at their new pitch in the game as well. Off
   * by default: the sound check is a place to experiment, and what is tried there should not
   * follow the player onto a board until they ask it to.
   */
  readonly customPitches: boolean;
  /**
   * Whether the tutor is offered on a board: the "[H]int" button and the key
   * (docs/teaching-plan.md). A presentation setting and not a gameplay dial, because it changes
   * nothing about the rules or the records: a hinted board sets no best time whether the button
   * is there or not, and a board without it is simply played without asking.
   */
  readonly tutor: boolean;
  /**
   * Whether every beaten creature shows the number under it, as the hovered one always does: the
   * game screen's "Beaten" toggle and `U` (decision 0067). Kept, like `muted`, because a player
   * who reads the board by those numbers (on a touch screen, the only way to read them) wants
   * them on every board, not switched on again each time.
   */
  readonly beatenNumbers: boolean;
}

export const DEFAULT_PRESENTATION: PresentationSettings = {
  icons: DEFAULT,
  glyph: 'pips',
  tierColors: DEFAULT,
  customTierColors: null,
  palette: DEFAULT,
  font: DEFAULT,
  interfaceFont: DEFAULT,
  sfx: DEFAULT,
  sfxVolume: DEFAULT_SFX_VOLUME,
  victory: DEFAULT,
  highlight: DEFAULT,
  highlightColor: DEFAULT,
  markColor: DEFAULT,
  beatenLook: 'dimStrike',
  digitSize: DEFAULT_DIGIT_SIZE,
  reachShading: false,
  fightRim: 'every',
  motion: 'full',
  menuStrip: 'left',
  clock: 'seconds',
  rightClick: 'cycleUp',
  longPress: DEFAULT_LONG_PRESS,
  backPauses: false,
  hintLine: true,
  maxZoom: DEFAULT_MAX_ZOOM,
  startAtCeiling: false,
  textSize: DEFAULT_TEXT_SIZE,
  previewSize: DEFAULT_PREVIEW_SIZE,
  muted: false,
  soundCheck: { keys: {}, pitches: {}, volume: 1 },
  silenced: [],
  customPitches: false,
  tutor: true,
  beatenNumbers: false,
};

// -------------------------------------------------------------- sanitising
//
// A saved value is untrusted input; see the header. `oneOf` and `num` read one
// value each, falling back rather than throwing, and the gameplay reader in
// `settings.ts` borrows them.

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? snapRatio(value, min, max)
    : fallback;
}

/** The highest note MIDI numbers, which the sound check's pitches are written in. */
const MAX_MIDI_NOTE = 127;

/**
 * Entries of the wrong type are dropped one at a time. An id this build does not know is kept, as
 * `icons` keeps an unknown pip, and the sound check passes over it.
 */
function readSoundCheck(raw: unknown): SoundCheckSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const record = (v: unknown): Record<string, unknown> =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const keys = Object.entries(record(s.keys)).filter(
    (e): e is [string, string] => typeof e[1] === 'string',
  );
  const pitches = Object.entries(record(s.pitches)).filter(
    (e): e is [string, number] =>
      typeof e[1] === 'number' && Number.isInteger(e[1]) && e[1] >= 0 && e[1] <= MAX_MIDI_NOTE,
  );
  return {
    keys: Object.fromEntries(keys),
    pitches: Object.fromEntries(pitches),
    // A save from before the volume was kept reads as the level every sound plays at.
    volume: num(s.volume, 0, MAX_SOUND_CHECK_VOLUME, 1),
  };
}

/** A palette of the player's own, or null unless every tier and the halo is a colour. */
function readTierPalette(raw: unknown): TierPalette | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { colors, halo } = raw as Record<string, unknown>;
  if (!Array.isArray(colors) || colors.length !== TIER_COUNT) return null;
  const read = colors.map(readHexColor);
  const ring = readHexColor(halo);
  if (!ring || read.some((c) => c === null)) return null;
  return { colors: read as string[], halo: ring };
}

export function readPresentation(raw: unknown): PresentationSettings {
  const p = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, fallback: string): string =>
    typeof p[k] === 'string' ? (p[k] as string) : fallback;
  // Retired ids map to their successors — see `migrateFontChoice`. An id this
  // build does not know is kept, like `icons`, and resolves to the baseline
  // face until a build that knows it reads the save.
  const font = migrateFontChoice(str('font', DEFAULT)) as FontChoice;
  const customTierColors = readTierPalette(p.customTierColors);
  const tierColors = str('tierColors', DEFAULT) as TierColorChoice;
  return {
    // Not validated against the shape list on purpose: an unknown pip falls
    // through `drawCreature`'s own default, and rejecting it here would lose a
    // setting written by a newer build.
    icons: str('icons', DEFAULT) as IconChoice,
    // A save from before this setting reads as the pips, the only glyph the game had.
    glyph: oneOf(p.glyph, CREATURE_GLYPHS, 'pips'),
    // A save from before this setting reads as the game's own colours, and so does one choosing
    // its own colours without a whole palette of them. A preset this build does not know is kept,
    // as `icons` keeps an unknown pip, and resolves to the game's own.
    tierColors: tierColors === CUSTOM_TIERS && !customTierColors ? DEFAULT : tierColors,
    customTierColors,
    palette: str('palette', DEFAULT),
    font,
    // A save from before this setting had one font for the board and the
    // interface both, so it reads as that font here too (decision 0033).
    interfaceFont: migrateFontChoice(str('interfaceFont', font)) as FontChoice,
    sfx: str('sfx', DEFAULT) as SfxChoice,
    // A save from before this setting reads as full volume, the only level the game had.
    sfxVolume: num(p.sfxVolume, 0, MAX_SFX_VOLUME, DEFAULT_SFX_VOLUME),
    victory: str('victory', DEFAULT) as VictoryChoice,
    highlight: str('highlight', DEFAULT) as HighlightChoice,
    // A save from before this setting, or one holding anything but a colour, reads as the green
    // the highlight was always drawn in.
    highlightColor: readHexColor(p.highlightColor) ?? DEFAULT,
    markColor: readHexColor(p.markColor) ?? DEFAULT,
    // A save from before the look was a choice held only whether the stroke was on
    // (`strikeDefeated`); off, it reads as the dimmed glyph that was left, and on or absent as
    // the game's own look.
    beatenLook: oneOf(p.beatenLook, BEATEN_LOOKS, p.strikeDefeated === false ? 'dim' : 'dimStrike'),
    // A save from before this setting reads as the size the board's digits were always drawn at.
    digitSize: num(p.digitSize, MIN_DIGIT_SIZE, MAX_DIGIT_SIZE, DEFAULT_DIGIT_SIZE),
    reachShading: typeof p.reachShading === 'boolean' ? p.reachShading : false,
    // A save from before this setting reads as every fight, which is how the glow first shipped.
    fightRim: oneOf(p.fightRim, FIGHT_RIMS, 'every'),
    // A save from before this setting reads as both, which the stage always did.
    motion: oneOf(p.motion, MOTIONS, 'full'),
    menuStrip: oneOf(p.menuStrip, MENU_STRIPS, 'left'),
    // A save from before this setting reads as seconds, which the clock always counted in.
    clock: oneOf(p.clock, CLOCK_STYLES, 'seconds'),
    rightClick: oneOf(p.rightClick, RIGHT_CLICKS, 'cycleUp'),
    longPress: Math.round(num(p.longPress, MIN_LONG_PRESS, MAX_LONG_PRESS, DEFAULT_LONG_PRESS)),
    backPauses: typeof p.backPauses === 'boolean' ? p.backPauses : false,
    hintLine: typeof p.hintLine === 'boolean' ? p.hintLine : true,
    maxZoom: Math.round(num(p.maxZoom, MIN_MAX_ZOOM, MAX_MAX_ZOOM, DEFAULT_MAX_ZOOM)),
    startAtCeiling: typeof p.startAtCeiling === 'boolean' ? p.startAtCeiling : false,
    // A save from before this setting has no field, and reads as the size the
    // game always had.
    textSize: num(p.textSize, MIN_TEXT_SIZE, MAX_TEXT_SIZE, DEFAULT_TEXT_SIZE),
    // A save from before this setting reads as the size the examples were always drawn at.
    previewSize: num(p.previewSize, MIN_PREVIEW_SIZE, MAX_PREVIEW_SIZE, DEFAULT_PREVIEW_SIZE),
    // Defaults to unmuted, so a save written before the speaker existed opens
    // with sound on — which is the state that save was actually played in.
    muted: typeof p.muted === 'boolean' ? p.muted : false,
    soundCheck: readSoundCheck(p.soundCheck),
    // Events this build does not know are dropped: the list is read by name, and a save from
    // before it, or one holding anything else, silences nothing.
    silenced: Array.isArray(p.silenced)
      ? SFX_EVENTS.filter((e) => (p.silenced as unknown[]).includes(e))
      : [],
    customPitches: typeof p.customPitches === 'boolean' ? p.customPitches : false,
    // A save from before the tutor existed reads as offering it, as a new player's does.
    tutor: typeof p.tutor === 'boolean' ? p.tutor : true,
    // A save from before the toggle reads as off: beaten creatures drawn as the game drew them.
    beatenNumbers: typeof p.beatenNumbers === 'boolean' ? p.beatenNumbers : false,
  };
}
