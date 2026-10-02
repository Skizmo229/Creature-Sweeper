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
 * because a settings file is never worth losing a save over. A name this build has nothing by
 * (a palette, a face, an icon, a sound pack, a clear effect) is kept, so a newer build reading
 * the save gets it back, and resolves to the ladder's own where it is used; it is looked up there
 * as the registry's own key (`Object.hasOwn`), never one the record inherits, such as
 * `constructor`.
 */

import { snapRatio } from '../engine/settings.js';
import { readHexColor } from './colorspace.js';
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
/** A bundled face, for the board's numbers or for the interface. */
export type FontChoice = typeof DEFAULT | FontId;
/** A sound pack, or silence. */
export type SfxChoice = typeof DEFAULT | typeof OFF | SfxPackId;
/** A board-clear effect, or none. */
export type VictoryChoice = typeof DEFAULT | typeof OFF | VictoryId;

/**
 * How much of the board the cursor lights up. 'neighbours', every ladder's default, is the hovered
 * cell and everything genuinely adjacent to it: six cells on a hex board, and across the seam on
 * a wrapped one, which teaches the topology faster than any amount of explaining. 'cell' is the
 * hovered cell alone. 'block' is the literal 3x3 square whatever the topology, for a player who
 * wants a steady shape rather than a truthful one. 'seen' lights what constrains a covered cell,
 * the open numbers and beaten creatures beside it, the setup of every subtraction; over an open
 * cell it lights what that cell sees, as 'neighbours' does.
 */
export type HighlightStyle = 'neighbours' | 'cell' | 'block' | 'seen';
/** The cursor highlight's setting: the game type's own, none, or a style. */
export type HighlightChoice = typeof DEFAULT | typeof OFF | HighlightStyle;

/** Each highlight style as its tile names it. */
export const HIGHLIGHT_NAMES: Record<HighlightStyle, string> = {
  neighbours: 'True neighbours — follows hex and wrapped edges',
  cell: 'Just the cell under the cursor',
  block: 'Flat 3×3 block, whatever the board shape',
  seen: 'The numbers that see a covered cell, and what an open one sees',
};

/** How thick the cursor highlight's line is, in CSS pixels; thicker for a large zoom or screen. */
export const MIN_HIGHLIGHT_WIDTH = 1;
export const MAX_HIGHLIGHT_WIDTH = 4;
export const DEFAULT_HIGHLIGHT_WIDTH = 2;

/** A colour as `#rrggbb` in lower case, or the game type's own, the mark colour. */
export type HighlightColorChoice = typeof DEFAULT | string;

/**
 * The colours the cursor highlight is offered in besides the game type's own, the mark colour,
 * which every ladder defaults to; the Custom tile makes any other. Chosen by measurement against
 * every palette and against the red a click that would do nothing is lit in (decision 0050): white
 * stands out on the most tiles and yellow next, and with red–green colour blindness, where the
 * mark's green is the hardest of them to tell from the red, magenta is the easiest, cyan holds for
 * the commoner kind and yellow for the other.
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
 * every preset stands at least `NEAR_TAKEN` from each of them: the red of a refused click, the
 * gold of a given, the blue of a Census, the cream of an Augur and the violet of the tutor.
 * Measured 28 Sep 2026 as the highlight's were: lime is 57 from the nearest, magenta 49 and
 * blue 42, where white sits 23 from the cream, yellow 26 from the gold and cyan 17 from the blue.
 */
export const MARK_COLORS: readonly { readonly name: string; readonly color: string }[] = [
  { name: 'Lime', color: '#b6ff3a' },
  { name: 'Magenta', color: '#ff4dff' },
  { name: 'Blue', color: '#3d6dff' },
];

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
 * it; struck through at full strength; crossed out, the stroke and its mirror, dimmed or not;
 * dimmed alone, which reads better at small cell sizes, where a stroke crosses the pips and an X
 * crosses them twice; greyed, dimmed and drawn in the ink with no colour, so the live creatures'
 * colours stand out; or plain, exactly as a live one would be, for a player who reads "beaten"
 * from the open floor under it.
 */
export type BeatenLook = 'dimStrike' | 'strike' | 'dimCross' | 'cross' | 'dim' | 'grey' | 'plain';
const BEATEN_LOOKS: readonly BeatenLook[] = [
  'dimStrike',
  'strike',
  'dimCross',
  'cross',
  'dim',
  'grey',
  'plain',
];

/**
 * Which fights light the edge of the board. 'every' is green for a fight that cost nothing, blue
 * for one that levelled the player up and red for one that hurt; 'levelups' keeps the blue and
 * the red and leaves the green out, since clean fights are most of a board; 'hits' keeps the red
 * alone, the one that says something went wrong; 'off' is none. See `game/flash.ts`.
 */
export type FightRim = 'every' | 'levelups' | 'hits' | typeof OFF;
const FIGHT_RIMS: readonly FightRim[] = ['every', 'levelups', 'hits', OFF];

/**
 * How much the tutor says: the whole lesson, the numbers it read, the cells it concludes and
 * why; or only where to look, the numbers ringed and nothing concluded, a nudge that leaves the
 * conclusion to the player. Either press is a hint.
 */
export type TutorStyle = 'full' | 'where';
const TUTOR_STYLES: readonly TutorStyle[] = ['full', 'where'];

/** The tutor's grades, 0 to 4, as `docs/strategies.md` grades the tricks; 4 tries everything. */
export const MIN_TUTOR_GRADE = 0;
export const MAX_TUTOR_GRADE = 4;

/** When the board-clear effect plays: on every clear, or only a board's first, the one to watch. */
export type VictoryWhen = 'every' | 'first';
const VICTORY_WHENS: readonly VictoryWhen[] = ['every', 'first'];

/**
 * What holds the clear card back on a board's first clear with an effect to watch: the effect,
 * two and a half seconds by request (docs/ui.md); a click anywhere, so the cleared board can be
 * looked at for as long as the player likes; or nothing, the card at once.
 */
export type CardHold = 'effect' | 'click' | 'none';
const CARD_HOLDS: readonly CardHold[] = ['effect', 'click', 'none'];

/** How fast the board-clear effect runs, as a multiple of its own pace. */
export const MIN_EFFECT_SPEED = 0.5;
export const MAX_EFFECT_SPEED = 2;
export const DEFAULT_EFFECT_SPEED = 1;

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
 * How large the interface's text can be set, as a multiple of the browser's own size. Applied as
 * the root font size, which every size in the stylesheet is written against, so the HUD, the
 * menus and this screen all follow it and the board, a canvas sized by its cells, does not.
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
/** Every sound at the level it plays at in a game. */
export const DEFAULT_SOUND_CHECK_VOLUME = 1;

/**
 * Three times the level each pack was voiced at, as loud as the sound check goes. Past 1, the
 * mixer's limiter holds the peaks down, so a loud setting cannot clip or blast.
 */
export const MAX_SFX_VOLUME = 3;
/** The level every pack was voiced at. */
export const DEFAULT_SFX_VOLUME = 1;

/**
 * Every presentation setting, as the store keeps them for every ladder; a ladder's own are a part
 * of the same record (`LadderOwn`). A `DEFAULT` choice is resolved on a ladder by `Settings`.
 */
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
  /** When the clear effect plays (`VictoryWhen`), what holds the card (`CardHold`), and its pace. */
  readonly victoryWhen: VictoryWhen;
  readonly cardHold: CardHold;
  readonly effectSpeed: number;
  readonly highlight: HighlightChoice;
  /**
   * The colour the cursor lights a cell in when a click there would land. A click that would do
   * nothing is lit red whatever this is, because red is what says so (decision 0050).
   */
  readonly highlightColor: HighlightColorChoice;
  /** How thick the cursor highlight's line is, in CSS pixels. */
  readonly highlightWidth: number;
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
   * Whether the cells the crawl rule keeps out of reach are shaded, on a ladder with a crawl rule.
   * The rule made visible where the cursor shows it one cell at a time; it reads nothing but the
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
   * Whether the play statistics are kept (decision 0060): what each board cost, on this device,
   * for the backup screen's code. Off, nothing more is written down, and what was kept stays
   * until Reset progress clears it.
   */
  readonly keepStats: boolean;
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
   * Silence everything, from the always-present speaker in the corner. Not the same as `sfx` set
   * to OFF: the pack is a taste and muting a circumstance, so muting keeps the pack to come back
   * to (decision 0024).
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
  /** How much the tutor says (`TutorStyle`), and the dearest grade it tries, 0 to 4. */
  readonly tutorStyle: TutorStyle;
  readonly tutorGrade: number;
  /**
   * Whether every beaten creature shows the number under it, as the hovered one always does: the
   * game screen's "Beaten" toggle and `U` (decision 0067). Kept, like `muted`, because a player
   * who reads the board by those numbers (on a touch screen, the only way to read them) wants
   * them on every board, not switched on again each time.
   */
  readonly beatenNumbers: boolean;
  /**
   * Whether a click on an open cell sweeps its ring, at the price of a sweep (decision 0071): a
   * chord. A presentation setting, since it opens nothing a sweep would not and costs the same.
   * Off by default: a click on an open cell has always done nothing.
   */
  readonly chord: boolean;
}

/** A new player's settings, and what Reset presentation goes back to. */
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
  victoryWhen: 'every',
  cardHold: 'effect',
  effectSpeed: DEFAULT_EFFECT_SPEED,
  highlight: DEFAULT,
  highlightColor: DEFAULT,
  highlightWidth: DEFAULT_HIGHLIGHT_WIDTH,
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
  keepStats: true,
  hintLine: true,
  maxZoom: DEFAULT_MAX_ZOOM,
  startAtCeiling: false,
  textSize: DEFAULT_TEXT_SIZE,
  previewSize: DEFAULT_PREVIEW_SIZE,
  muted: false,
  soundCheck: { keys: {}, pitches: {}, volume: DEFAULT_SOUND_CHECK_VOLUME },
  silenced: [],
  customPitches: false,
  tutor: true,
  tutorStyle: 'full',
  tutorGrade: MAX_TUTOR_GRADE,
  beatenNumbers: false,
  chord: false,
};

// -------------------------------------------------------------- sanitising
//
// A saved value is untrusted input; see the header. `oneOf`, `num` and `bool`
// read one value each, falling back rather than throwing, and the gameplay
// reader in `settings.ts` borrows them.

/** A saved value if it is one of `allowed`, else the fallback. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A saved number, snapped to the sliders' step and into range (`snapRatio`), else the fallback. */
export function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? snapRatio(value, min, max)
    : fallback;
}

/** A saved flag, else the fallback. */
export function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
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
    volume: num(s.volume, 0, MAX_SOUND_CHECK_VOLUME, DEFAULT_SOUND_CHECK_VOLUME),
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

/**
 * A saved presentation read back: each setting the save holds and this build can read, and the
 * default for every other, so a save from before a setting existed reads as its default. Never
 * throws, whatever it is handed.
 */
export function readPresentation(raw: unknown): PresentationSettings {
  const p = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_PRESENTATION;
  const str = (k: string, fallback: string): string =>
    typeof p[k] === 'string' ? (p[k] as string) : fallback;
  // Retired ids map to their successors (`migrateFontChoice`). An id this build does not know is
  // kept, like `icons`, and resolves to the baseline face until a build that knows it reads the save.
  const font = migrateFontChoice(str('font', d.font)) as FontChoice;
  const customTierColors = readTierPalette(p.customTierColors);
  const tierColors = str('tierColors', d.tierColors) as TierColorChoice;
  return {
    // Not validated against the shape list on purpose: an unknown pip falls through
    // `drawCreature`'s own default, and rejecting it here would lose a setting a newer build wrote.
    icons: str('icons', d.icons) as IconChoice,
    glyph: oneOf(p.glyph, CREATURE_GLYPHS, d.glyph),
    // A choice of the player's own colours without a whole palette of them reads as the game's
    // own. A preset this build does not know is kept, as an unknown pip is, and resolves to the
    // game's own.
    tierColors: tierColors === CUSTOM_TIERS && !customTierColors ? d.tierColors : tierColors,
    customTierColors,
    palette: str('palette', d.palette),
    font,
    // A save from before this setting had one font for the board and the interface both, so it
    // reads as that font here too (decision 0033).
    interfaceFont: migrateFontChoice(str('interfaceFont', font)) as FontChoice,
    sfx: str('sfx', d.sfx) as SfxChoice,
    sfxVolume: num(p.sfxVolume, 0, MAX_SFX_VOLUME, d.sfxVolume),
    victory: str('victory', d.victory) as VictoryChoice,
    victoryWhen: oneOf(p.victoryWhen, VICTORY_WHENS, d.victoryWhen),
    cardHold: oneOf(p.cardHold, CARD_HOLDS, d.cardHold),
    effectSpeed: num(p.effectSpeed, MIN_EFFECT_SPEED, MAX_EFFECT_SPEED, d.effectSpeed),
    highlight: str('highlight', d.highlight) as HighlightChoice,
    highlightColor: readHexColor(p.highlightColor) ?? d.highlightColor,
    markColor: readHexColor(p.markColor) ?? d.markColor,
    highlightWidth: Math.round(
      num(p.highlightWidth, MIN_HIGHLIGHT_WIDTH, MAX_HIGHLIGHT_WIDTH, d.highlightWidth),
    ),
    // A save from before the look was a choice held only whether the stroke was on
    // (`strikeDefeated`); off, it reads as the dimmed glyph that was left.
    beatenLook: oneOf(
      p.beatenLook,
      BEATEN_LOOKS,
      p.strikeDefeated === false ? 'dim' : d.beatenLook,
    ),
    digitSize: num(p.digitSize, MIN_DIGIT_SIZE, MAX_DIGIT_SIZE, d.digitSize),
    reachShading: bool(p.reachShading, d.reachShading),
    fightRim: oneOf(p.fightRim, FIGHT_RIMS, d.fightRim),
    motion: oneOf(p.motion, MOTIONS, d.motion),
    menuStrip: oneOf(p.menuStrip, MENU_STRIPS, d.menuStrip),
    clock: oneOf(p.clock, CLOCK_STYLES, d.clock),
    rightClick: oneOf(p.rightClick, RIGHT_CLICKS, d.rightClick),
    longPress: Math.round(num(p.longPress, MIN_LONG_PRESS, MAX_LONG_PRESS, d.longPress)),
    backPauses: bool(p.backPauses, d.backPauses),
    keepStats: bool(p.keepStats, d.keepStats),
    hintLine: bool(p.hintLine, d.hintLine),
    maxZoom: Math.round(num(p.maxZoom, MIN_MAX_ZOOM, MAX_MAX_ZOOM, d.maxZoom)),
    startAtCeiling: bool(p.startAtCeiling, d.startAtCeiling),
    textSize: num(p.textSize, MIN_TEXT_SIZE, MAX_TEXT_SIZE, d.textSize),
    previewSize: num(p.previewSize, MIN_PREVIEW_SIZE, MAX_PREVIEW_SIZE, d.previewSize),
    muted: bool(p.muted, d.muted),
    soundCheck: readSoundCheck(p.soundCheck),
    // Events this build does not know are dropped: the list is read by name, and anything but a
    // list silences nothing.
    silenced: Array.isArray(p.silenced)
      ? SFX_EVENTS.filter((e) => (p.silenced as unknown[]).includes(e))
      : [],
    customPitches: bool(p.customPitches, d.customPitches),
    tutor: bool(p.tutor, d.tutor),
    tutorStyle: oneOf(p.tutorStyle, TUTOR_STYLES, d.tutorStyle),
    tutorGrade: Math.round(num(p.tutorGrade, MIN_TUTOR_GRADE, MAX_TUTOR_GRADE, d.tutorGrade)),
    beatenNumbers: bool(p.beatenNumbers, d.beatenNumbers),
    chord: bool(p.chord, d.chord),
  };
}
