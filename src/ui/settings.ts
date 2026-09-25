/**
 * The player's settings, and what they resolve to on a given ladder.
 *
 * Two halves that behave very differently:
 *
 * **Presentation** — icons, palette, the board's font and the interface's,
 * sound, the clear effect, the glow after a fight, the cursor highlight, the
 * struck-out creatures, the zoom ceiling. None of it touches a rule, so none
 * of it can affect whether a clear is recorded.
 *
 * **Gameplay** — the dials in `engine/settings.ts`. Those change the rules, so
 * they decide whether a board counts. See `isAtLeastAsHard`: a player who
 * makes the game *harder* keeps their records, a player who makes it easier
 * keeps their unlocks but not their times.
 *
 * Every presentation setting has the same three-way shape the player asked
 * for: `'default'` means "whatever this game type says", a named value means
 * "this, everywhere", and where it makes sense `'off'` means "not at all".
 * That is why every resolver below takes a `typeId` — 'default' is not a
 * value, it is a deferral.
 *
 * localStorage can throw or come back empty (private windows, blocked site
 * data), so every access is guarded and the game plays fine without it.
 */

import {
  DEFAULT_GAMEPLAY,
  type GameplaySettings,
  type SweepMode,
  snapRatio,
} from '../engine/settings.js';
import {
  type PipShape,
  type SfxPackId,
  type TypeTheme,
  type VictoryId,
  lookFor,
  themeFor,
} from './looks.js';
import { type FontId, type GameFont, TITLE_FONT, fontFor, migrateFontChoice } from './typefaces.js';
import { SETTINGS_KEY as KEY } from './savefile.js';

/** "Use the game type's own" — a deferral, not a value. */
export const DEFAULT = 'default';
/** "None at all" — only offered where silence is a sensible answer. */
export const OFF = 'off';

export type IconChoice = typeof DEFAULT | PipShape;
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

/**
 * Which fights light the edge of the board. 'every' is green for a fight that cost nothing, blue
 * for one that levelled the player up and red for one that hurt; 'levelups' keeps the blue and
 * the red and leaves the green out, since clean fights are most of a board; 'off' is none. See
 * `game/flash.ts`.
 */
export type FightRim = 'every' | 'levelups' | typeof OFF;
const FIGHT_RIMS: readonly FightRim[] = ['every', 'levelups', OFF];

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
const DEFAULT_TEXT_SIZE = 1;

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
}

export interface PresentationSettings {
  readonly icons: IconChoice;
  readonly palette: PaletteChoice;
  /** The face of the board's numbers and marks. */
  readonly font: FontChoice;
  /**
   * The face of the HUD, the menus and the settings screen: everything but the board. A face
   * chosen here dresses the game's title too, which the board's font never does.
   */
  readonly interfaceFont: FontChoice;
  readonly sfx: SfxChoice;
  readonly victory: VictoryChoice;
  readonly highlight: HighlightChoice;
  /**
   * Whether a defeated creature keeps its struck-through corner.
   *
   * The stroke is how "dealt with" reads at a glance, so turning it off leaves
   * the dimmed glyph doing that job alone. Offered because at small cell sizes
   * the stroke crosses the pips and some players read it as clutter.
   */
  readonly strikeDefeated: boolean;
  /** Which fights light the edge of the board. The shake and the level-up glow are not this. */
  readonly fightRim: FightRim;
  readonly menuStrip: MenuStrip;
  /** Ceiling for manual zoom, in CSS pixels per cell. */
  readonly maxZoom: number;
  /** Size of the interface's text — HUD, menus, settings — as a multiple. */
  readonly textSize: number;
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
   * Whether sounds retuned in the sound check play at their new pitch in the game as well. Off
   * by default: the sound check is a place to experiment, and what is tried there should not
   * follow the player onto a board until they ask it to.
   */
  readonly customPitches: boolean;
}

const DEFAULT_PRESENTATION: PresentationSettings = {
  icons: DEFAULT,
  palette: DEFAULT,
  font: DEFAULT,
  interfaceFont: DEFAULT,
  sfx: DEFAULT,
  victory: DEFAULT,
  highlight: DEFAULT,
  strikeDefeated: true,
  fightRim: 'every',
  menuStrip: 'left',
  maxZoom: DEFAULT_MAX_ZOOM,
  textSize: DEFAULT_TEXT_SIZE,
  muted: false,
  soundCheck: { keys: {}, pitches: {} },
  customPitches: false,
};

interface SettingsData {
  version: 1;
  presentation: PresentationSettings;
  gameplay: GameplaySettings;
}

function emptyData(): SettingsData {
  return { version: 1, presentation: DEFAULT_PRESENTATION, gameplay: DEFAULT_GAMEPLAY };
}

// -------------------------------------------------------------- sanitising
//
// A saved file is untrusted input: it may predate a setting, postdate one that
// was removed, or have been edited by hand. Everything below falls back to the
// default rather than throwing, because a settings file is never worth losing
// a save over.

const SWEEP_MODES: readonly SweepMode[] = ['on', 'off', 'charge'];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
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
  return { keys: Object.fromEntries(keys), pitches: Object.fromEntries(pitches) };
}

function readPresentation(raw: unknown): PresentationSettings {
  const p = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, fallback: string): string =>
    typeof p[k] === 'string' ? (p[k] as string) : fallback;
  // Retired ids map to their successors — see `migrateFontChoice`. An id this
  // build does not know is kept, like `icons`, and resolves to the baseline
  // face until a build that knows it reads the save.
  const font = migrateFontChoice(str('font', DEFAULT)) as FontChoice;
  return {
    // Not validated against the shape list on purpose: an unknown pip falls
    // through `drawCreature`'s own default, and rejecting it here would lose a
    // setting written by a newer build.
    icons: str('icons', DEFAULT) as IconChoice,
    palette: str('palette', DEFAULT),
    font,
    // A save from before this setting had one font for the board and the
    // interface both, so it reads as that font here too (decision 0033).
    interfaceFont: migrateFontChoice(str('interfaceFont', font)) as FontChoice,
    sfx: str('sfx', DEFAULT) as SfxChoice,
    victory: str('victory', DEFAULT) as VictoryChoice,
    highlight: str('highlight', DEFAULT) as HighlightChoice,
    strikeDefeated: typeof p.strikeDefeated === 'boolean' ? p.strikeDefeated : true,
    // A save from before this setting reads as every fight, which is how the glow first shipped.
    fightRim: oneOf(p.fightRim, FIGHT_RIMS, 'every'),
    menuStrip: oneOf(p.menuStrip, MENU_STRIPS, 'left'),
    maxZoom: Math.round(num(p.maxZoom, MIN_MAX_ZOOM, MAX_MAX_ZOOM, DEFAULT_MAX_ZOOM)),
    // A save from before this setting has no field, and reads as the size the
    // game always had.
    textSize: num(p.textSize, MIN_TEXT_SIZE, MAX_TEXT_SIZE, DEFAULT_TEXT_SIZE),
    // Defaults to unmuted, so a save written before the speaker existed opens
    // with sound on — which is the state that save was actually played in.
    muted: typeof p.muted === 'boolean' ? p.muted : false,
    soundCheck: readSoundCheck(p.soundCheck),
    customPitches: typeof p.customPitches === 'boolean' ? p.customPitches : false,
  };
}

function readGameplay(raw: unknown): GameplaySettings {
  const g = (raw ?? {}) as Record<string, unknown>;
  return {
    hpRatio: num(g.hpRatio, 0, 3, DEFAULT_GAMEPLAY.hpRatio),
    hpRegenRatio: num(g.hpRegenRatio, 0, 1, DEFAULT_GAMEPLAY.hpRegenRatio),
    enemyDamageRatio: num(g.enemyDamageRatio, 0, 3, DEFAULT_GAMEPLAY.enemyDamageRatio),
    manaRegenRatio: num(g.manaRegenRatio, 0, 3, DEFAULT_GAMEPLAY.manaRegenRatio),
    manaRewardRatio: num(g.manaRewardRatio, 0, 3, DEFAULT_GAMEPLAY.manaRewardRatio),
    sweep: oneOf(g.sweep, SWEEP_MODES, DEFAULT_GAMEPLAY.sweep),
    sweepChargeClicks:
      typeof g.sweepChargeClicks === 'number'
        ? Math.min(50, Math.max(1, Math.round(g.sweepChargeClicks)))
        : DEFAULT_GAMEPLAY.sweepChargeClicks,
    timeAttack: typeof g.timeAttack === 'boolean' ? g.timeAttack : DEFAULT_GAMEPLAY.timeAttack,
  };
}

export class Settings {
  private data: SettingsData;
  private readonly listeners = new Set<() => void>();

  constructor(data: SettingsData = emptyData()) {
    this.data = data;
  }

  static load(): Settings {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SettingsData>;
        return new Settings({
          version: 1,
          presentation: readPresentation(parsed.presentation),
          gameplay: readGameplay(parsed.gameplay),
        });
      }
    } catch {
      // Unreadable or blocked storage just means defaults.
    }
    return new Settings();
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Nothing to do; the session still plays correctly.
    }
    for (const fn of this.listeners) fn();
  }

  /** Called after any change, so a live board can re-theme without a rebuild. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get presentation(): PresentationSettings {
    return this.data.presentation;
  }

  get gameplay(): GameplaySettings {
    return this.data.gameplay;
  }

  setPresentation(patch: Partial<PresentationSettings>): void {
    this.data.presentation = { ...this.data.presentation, ...patch };
    this.persist();
  }

  setGameplay(patch: Partial<GameplaySettings>): void {
    this.data.gameplay = { ...this.data.gameplay, ...patch };
    this.persist();
  }

  resetPresentation(): void {
    this.data.presentation = DEFAULT_PRESENTATION;
    this.persist();
  }

  resetGameplay(): void {
    this.data.gameplay = DEFAULT_GAMEPLAY;
    this.persist();
  }

  // ----------------------------------------------------------- resolution
  //
  // 'default' is a deferral, so resolving it always needs to know which ladder
  // is being played. Every reader goes through these rather than reading the
  // raw choice, so "what does default mean here" is answered in exactly one
  // place per setting.

  /**
   * The theme a board is drawn with: this type's own, or another type's
   * palette wearing this type's pip — or whichever pip the player chose.
   *
   * Palette and icon are separate settings on purpose. Borrowing ARCANE's teal
   * should not also borrow its hexes, and the two were never one decision.
   */
  themeFor(typeId: string): TypeTheme {
    const { palette, icons } = this.data.presentation;
    const base = themeFor(palette === DEFAULT ? typeId : palette);
    const pip = icons === DEFAULT ? themeFor(typeId).pip : icons;
    return { ...base, pip };
  }

  /**
   * The face for the game's title: its own, unless the player has chosen a
   * face for the interface. Takes no ladder, because the title has no ladder —
   * "game type default" means the title's own default here.
   */
  titleFont(): GameFont {
    const choice = this.data.presentation.interfaceFont;
    return choice === DEFAULT ? TITLE_FONT : fontFor(choice);
  }

  /** The face for this ladder's board: its numbers and marks. */
  boardFont(typeId: string): GameFont {
    const choice = this.data.presentation.font;
    return fontFor(choice === DEFAULT ? lookFor(typeId).font : choice);
  }

  /** The face for this ladder's HUD and menus, and everything else outside the board. */
  interfaceFont(typeId: string): GameFont {
    const choice = this.data.presentation.interfaceFont;
    return fontFor(choice === DEFAULT ? lookFor(typeId).font : choice);
  }

  /**
   * The sound pack, or null for silence.
   *
   * Mute is checked first and answers for every sound in the game, which is
   * what makes the corner speaker a single switch rather than one more way to
   * set the same preference. The pack underneath is left exactly as it was.
   */
  sfxPack(typeId: string): SfxPackId | null {
    if (this.data.presentation.muted) return null;
    const choice = this.data.presentation.sfx;
    if (choice === OFF) return null;
    return (choice === DEFAULT ? lookFor(typeId).sfx : choice) as SfxPackId;
  }

  /** The board-clear effect, or null for none. */
  victoryEffect(typeId: string): VictoryId | null {
    const choice = this.data.presentation.victory;
    if (choice === OFF) return null;
    return (choice === DEFAULT ? lookFor(typeId).victory : choice) as VictoryId;
  }

  /** How the cursor lights the board, or null for no highlight at all. */
  highlightStyle(_typeId: string): HighlightStyle | null {
    const choice = this.data.presentation.highlight;
    if (choice === OFF) return null;
    // No type currently overrides this, but resolving through `lookFor`'s
    // sibling would be the place to start if one ever wants to.
    if (choice !== DEFAULT) return choice;
    // No ladder overrides this today, so every type's default is the true
    // adjacency ring. `lookFor(typeId)` is where a per-type answer would
    // go if one ever earns its place.
    return 'neighbours';
  }
}
