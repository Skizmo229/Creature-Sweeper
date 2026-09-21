/**
 * The player's settings, and what they resolve to on a given ladder.
 *
 * Two halves that behave very differently:
 *
 * **Presentation** — icons, palette, font, sound, the clear effect, the cursor
 * highlight, the struck-out creatures, the zoom ceiling. None of it touches a
 * rule, so none of it can affect whether a clear is recorded.
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
  FONTS,
  type FontId,
  type PipShape,
  type SfxPackId,
  type TypeTheme,
  type VictoryId,
  identityFor,
  themeFor,
} from './theme.js';

const KEY = 'creature-sweeper.settings.v1';

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
 * What the cursor does to a creature you have already beaten.
 *
 * 'none' is the default and is the game as it has always been: hovering a
 * defeated creature changes nothing about it.
 *
 * 'tier' writes that creature's level over its glyph, in the level's own
 * colour. It reveals NOTHING — the pips already say the tier, and this is the
 * same fact written as a digit instead of counted — which is why it belongs
 * here among the presentation settings and can never touch a record. What it
 * saves is the counting: at nine tiers a glyph is nine pips, and telling eight
 * from nine at a glance is genuinely slow.
 *
 * Anything else is a PipShape, and restyles the hovered glyph into that shape.
 * It is the thinnest of the three today, because every tier of every type is
 * drawn from the same die-face pips and the shape is decoration — it earns its
 * place when there is real per-creature art to swap to, and the option exists
 * now so that the setting does not have to be invented then.
 */
export type HoverDefeated = 'none' | 'tier' | PipShape;

export const HOVER_DEFEATED_NAMES: Record<'none' | 'tier', string> = {
  none: 'Nothing — leave it as it is',
  tier: 'Show its level, in that level’s own colour',
};

/** Cell sizes the zoom ceiling can be set to, in CSS pixels. */
export const MIN_MAX_ZOOM = 24;
export const MAX_MAX_ZOOM = 128;
export const DEFAULT_MAX_ZOOM = 48;

export interface PresentationSettings {
  readonly icons: IconChoice;
  readonly palette: PaletteChoice;
  readonly font: FontChoice;
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
  /** What the cursor does to a creature you have already beaten. */
  readonly hoverDefeated: HoverDefeated;
  /** Ceiling for manual zoom, in CSS pixels per cell. */
  readonly maxZoom: number;
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
}

export const DEFAULT_PRESENTATION: PresentationSettings = {
  icons: DEFAULT,
  palette: DEFAULT,
  font: DEFAULT,
  sfx: DEFAULT,
  victory: DEFAULT,
  highlight: DEFAULT,
  strikeDefeated: true,
  hoverDefeated: 'none',
  maxZoom: DEFAULT_MAX_ZOOM,
  muted: false,
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
    ? value as T
    : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? snapRatio(value, min, max)
    : fallback;
}

function readPresentation(raw: unknown): PresentationSettings {
  const p = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string, fallback: string): string =>
    typeof p[k] === 'string' ? p[k] as string : fallback;
  return {
    // Not validated against the shape list on purpose: an unknown pip falls
    // through `drawCreature`'s own default, and rejecting it here would lose a
    // setting written by a newer build.
    icons: str('icons', DEFAULT) as IconChoice,
    palette: str('palette', DEFAULT),
    font: str('font', DEFAULT) as FontChoice,
    sfx: str('sfx', DEFAULT) as SfxChoice,
    victory: str('victory', DEFAULT) as VictoryChoice,
    highlight: str('highlight', DEFAULT) as HighlightChoice,
    strikeDefeated: typeof p.strikeDefeated === 'boolean' ? p.strikeDefeated : true,
    // Same argument as `icons` above: an unknown pip shape falls through
    // `drawCreature`'s own default, so a value written by a newer build is
    // kept rather than thrown away.
    hoverDefeated: str('hoverDefeated', 'none') as HoverDefeated,
    maxZoom: Math.round(num(p.maxZoom, MIN_MAX_ZOOM, MAX_MAX_ZOOM, DEFAULT_MAX_ZOOM)),
    // Defaults to unmuted, so a save written before the speaker existed opens
    // with sound on — which is the state that save was actually played in.
    muted: typeof p.muted === 'boolean' ? p.muted : false,
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
    sweepChargeClicks: typeof g.sweepChargeClicks === 'number'
      ? Math.min(50, Math.max(1, Math.round(g.sweepChargeClicks)))
      : DEFAULT_GAMEPLAY.sweepChargeClicks,
    timeAttack: typeof g.timeAttack === 'boolean'
      ? g.timeAttack
      : DEFAULT_GAMEPLAY.timeAttack,
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

  /** The CSS font stack for this ladder's screens and board numbers. */
  fontStack(typeId: string): string {
    const choice = this.data.presentation.font;
    const id = choice === DEFAULT ? identityFor(typeId).font : choice;
    return (FONTS[id as FontId] ?? FONTS.mono).stack;
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
    return (choice === DEFAULT ? identityFor(typeId).sfx : choice) as SfxPackId;
  }

  /** The board-clear effect, or null for none. */
  victoryEffect(typeId: string): VictoryId | null {
    const choice = this.data.presentation.victory;
    if (choice === OFF) return null;
    return (choice === DEFAULT ? identityFor(typeId).victory : choice) as VictoryId;
  }

  /** How the cursor lights the board, or null for no highlight at all. */
  highlightStyle(typeId: string): HighlightStyle | null {
    const choice = this.data.presentation.highlight;
    if (choice === OFF) return null;
    // No type currently overrides this, but resolving through `identityFor`'s
    // sibling would be the place to start if one ever wants to.
    if (choice !== DEFAULT) return choice;
    // No ladder overrides this today, so every type's default is the true
    // adjacency ring. `identityFor(typeId)` is where a per-type answer would
    // go if one ever earns its place.
    return 'neighbours';
  }
}
