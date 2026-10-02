/**
 * The player's settings store, and what each presentation setting resolves to on a given ladder.
 *
 * Two halves that behave very differently:
 *
 * **Presentation** — how a board looks and sounds, and the page around it. None
 * of it touches a rule, so none of it can affect whether a clear is recorded.
 * What each one is, and how a saved one is read, is `presentation.ts`.
 *
 * **Gameplay** — the dials in `engine/settings.ts`. Those change the rules, so
 * they decide whether a board counts. See `isAtLeastAsHard`: a player who
 * makes the game *harder* keeps their records, a player who makes it easier
 * keeps their unlocks but not their times.
 *
 * `'default'` is a deferral, not a value, which is why every resolver below
 * takes a `typeId`.
 *
 * localStorage can throw or come back empty (private windows, blocked site
 * data), so every access is guarded and the game plays fine without it.
 */

import {
  DEFAULT_GAMEPLAY,
  type GameplaySettings,
  MAX_SWEEP_BUDGET,
  MAX_TIME_LIMIT,
  MIN_SWEEP_BUDGET,
  MIN_TIME_ATTACK_RATIO,
  type SweepMode,
} from '../engine/settings.js';
import type { SfxPackId, TypeTheme, VictoryId } from './looktypes.js';
import { lookFor, themeFor } from './looks.js';
import { LADDER_SCOPED, type LadderOwn, readLadderOwn } from './ladderown.js';
import {
  CUSTOM_TIERS,
  DEFAULT,
  type HighlightStyle,
  OFF,
  type PresentationSettings,
  DEFAULT_PRESENTATION,
  num,
  oneOf,
  readPresentation,
} from './presentation.js';
import { MARK_COLOR } from './theme.js';
import { DEFAULT_TIERS, TIER_PRESETS, type TierPalette } from './tiercolors.js';
import { type GameFont, TITLE_FONT, fontFor } from './typefaces.js';
import { SETTINGS_KEY as KEY } from './savefile.js';
import type { VictoryLook } from './victory/play.js';

interface SettingsData {
  version: 1;
  presentation: PresentationSettings;
  /** Each ladder's own presentation settings, by id, over the ones for every ladder (0070). */
  ladders: Record<string, LadderOwn>;
  gameplay: GameplaySettings;
}

function emptyData(): SettingsData {
  return {
    version: 1,
    presentation: DEFAULT_PRESENTATION,
    ladders: {},
    gameplay: DEFAULT_GAMEPLAY,
  };
}

const SWEEP_MODES: readonly SweepMode[] = ['on', 'off', 'charge', 'budget'];

/** A saved count, whole and within its range, or the fallback. */
function whole(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** A saved set of dials. Every dial from before a setting reads as the tuned game's. */
function readGameplay(raw: unknown): GameplaySettings {
  const g = (raw ?? {}) as Record<string, unknown>;
  const d = DEFAULT_GAMEPLAY;
  return {
    hpRatio: num(g.hpRatio, 0, 3, d.hpRatio),
    hpRegenRatio: num(g.hpRegenRatio, 0, 1, d.hpRegenRatio),
    enemyDamageRatio: num(g.enemyDamageRatio, 0, 3, d.enemyDamageRatio),
    manaRegenRatio: num(g.manaRegenRatio, 0, 3, d.manaRegenRatio),
    manaRewardRatio: num(g.manaRewardRatio, 0, 3, d.manaRewardRatio),
    sweep: oneOf(g.sweep, SWEEP_MODES, d.sweep),
    sweepChargeClicks: whole(g.sweepChargeClicks, 1, 50, d.sweepChargeClicks),
    timeAttack: bool(g.timeAttack, d.timeAttack),
    sweepBudget: whole(g.sweepBudget, MIN_SWEEP_BUDGET, MAX_SWEEP_BUDGET, d.sweepBudget),
    spellPriceRatio: num(g.spellPriceRatio, 0, 3, d.spellPriceRatio),
    startManaRatio: num(g.startManaRatio, 0, 3, d.startManaRatio),
    countersHidden: bool(g.countersHidden, d.countersHidden),
    timeAttackRatio: num(g.timeAttackRatio, MIN_TIME_ATTACK_RATIO, 1, d.timeAttackRatio),
    timeLimit: whole(g.timeLimit, 0, MAX_TIME_LIMIT, d.timeLimit),
  };
}

/**
 * The player's settings: the presentation for every ladder, each ladder's own, and the gameplay
 * dials. Every change is saved and heard by `onChange`'s listeners; the resolvers say what a
 * setting comes to on a ladder.
 */
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
        const presentation = readPresentation(parsed.presentation);
        return new Settings({
          version: 1,
          presentation,
          // A ladder's own tier colours are read against the palette kept for every ladder.
          ladders: readLadderOwn(parsed.ladders, presentation),
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

  /** The settings for every ladder. A ladder's own are over these in `presentationFor`. */
  get presentation(): PresentationSettings {
    return this.data.presentation;
  }

  /** The settings in force on a ladder: those for every ladder, under the ladder's own. */
  presentationFor(typeId: string): PresentationSettings {
    const own = this.data.ladders[typeId];
    return own ? { ...this.data.presentation, ...own } : this.data.presentation;
  }

  /** Which settings a ladder has of its own. */
  ownKeys(typeId: string): (keyof PresentationSettings)[] {
    return Object.keys(this.data.ladders[typeId] ?? {}) as (keyof PresentationSettings)[];
  }

  /**
   * Save settings for one ladder alone, or with null for every ladder. Only the settings a ladder
   * can have of its own (`LADDER_SCOPED`) are kept as its; the rest of the patch is for all.
   */
  setPresentationFor(typeId: string | null, patch: Partial<PresentationSettings>): void {
    if (typeId === null) return this.setPresentation(patch);
    const own: Record<string, unknown> = { ...this.data.ladders[typeId] };
    const shared: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if ((LADDER_SCOPED as readonly string[]).includes(key)) own[key] = value;
      else shared[key] = value;
    }
    this.data.ladders = { ...this.data.ladders, [typeId]: own as LadderOwn };
    this.data.presentation = { ...this.data.presentation, ...shared };
    this.persist();
  }

  /** Give a ladder up its own settings: the settings for every ladder are its again. */
  clearLadder(typeId: string): void {
    const { [typeId]: _gone, ...rest } = this.data.ladders;
    this.data.ladders = rest;
    this.persist();
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

  /** Every presentation setting back to the game's own, every ladder's own included. */
  resetPresentation(): void {
    this.data.presentation = DEFAULT_PRESENTATION;
    this.data.ladders = {};
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
    const { palette, icons } = this.presentationFor(typeId);
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
    const choice = this.presentationFor(typeId).font;
    return fontFor(choice === DEFAULT ? lookFor(typeId).font : choice);
  }

  /** The face for this ladder's HUD and menus, and everything else outside the board. */
  interfaceFont(typeId: string): GameFont {
    const choice = this.presentationFor(typeId).interfaceFont;
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
    const choice = this.presentationFor(typeId).sfx;
    if (choice === OFF) return null;
    return (choice === DEFAULT ? lookFor(typeId).sfx : choice) as SfxPackId;
  }

  /** What a board-clear effect draws the creatures in: this ladder's palette, the tier colours, the glyph. */
  victoryLook(typeId: string): VictoryLook {
    const p = this.presentationFor(typeId);
    return {
      theme: this.themeFor(typeId),
      tierColors: this.tierColors(typeId),
      creature: { glyph: p.glyph, font: this.boardFont(typeId) },
    };
  }

  /** The board-clear effect, or null for none. */
  victoryEffect(typeId: string): VictoryId | null {
    const choice = this.presentationFor(typeId).victory;
    if (choice === OFF) return null;
    return (choice === DEFAULT ? lookFor(typeId).victory : choice) as VictoryId;
  }

  /** How the cursor lights the board, or null for no highlight at all. */
  highlightStyle(typeId: string): HighlightStyle | null {
    const choice = this.presentationFor(typeId).highlight;
    if (choice === OFF) return null;
    if (choice !== DEFAULT) return choice;
    // No ladder overrides this today, so every type's default is the true
    // adjacency ring. `lookFor(typeId)` is where a per-type answer would
    // go if one ever earns its place.
    return 'neighbours';
  }

  /** The colour of each creature tier, and the halo of tiers 6 to 9. */
  tierColors(typeId: string): TierPalette {
    const { tierColors, customTierColors } = this.presentationFor(typeId);
    // No ladder's data gives its tiers colours of their own: a tier looks the same on every board
    // unless the player has chosen otherwise for that ladder (decision 0070).
    if (tierColors === CUSTOM_TIERS) return customTierColors ?? DEFAULT_TIERS;
    return TIER_PRESETS.find((t) => t.id === tierColors)?.palette ?? DEFAULT_TIERS;
  }

  /** The colour of a mark, and so of a pencil note and a wrapped board's seam. */
  markColor(typeId: string): string {
    const choice = this.presentationFor(typeId).markColor;
    // No ladder overrides this, so every type's default is the green of the original's marks.
    return choice === DEFAULT ? MARK_COLOR : choice;
  }

  /** The colour the cursor lights a cell in when a click there would land. */
  highlightColor(typeId: string): string {
    const choice = this.presentationFor(typeId).highlightColor;
    // No ladder overrides this either: every type's default is the mark's colour, whatever that is.
    return choice === DEFAULT ? this.markColor(typeId) : choice;
  }
}
