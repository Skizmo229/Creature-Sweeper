/**
 * The player's settings store, and what each presentation setting resolves to on a given ladder.
 *
 * Two halves that behave very differently:
 *
 * **Presentation** — icons and their tiers' colours, palette, the board's font
 * and the interface's, sound, the clear effect, the glow after a fight, the
 * cursor highlight and its colour, the struck-out creatures, the zoom ceiling.
 * None of it touches a rule, so none of it can affect whether a clear is
 * recorded. What each one is, and how a saved one is read, is `presentation.ts`.
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

import { DEFAULT_GAMEPLAY, type GameplaySettings, type SweepMode } from '../engine/settings.js';
import type { SfxPackId, TypeTheme, VictoryId } from './looktypes.js';
import { lookFor, themeFor } from './looks.js';
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
  gameplay: GameplaySettings;
}

function emptyData(): SettingsData {
  return { version: 1, presentation: DEFAULT_PRESENTATION, gameplay: DEFAULT_GAMEPLAY };
}

const SWEEP_MODES: readonly SweepMode[] = ['on', 'off', 'charge'];

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

  /** What a board-clear effect draws the creatures in: this ladder's palette, the tier colours, the glyph. */
  victoryLook(typeId: string): VictoryLook {
    const p = this.data.presentation;
    return {
      theme: this.themeFor(typeId),
      tierColors: this.tierColors(typeId),
      creature: { glyph: p.glyph, font: this.boardFont(typeId) },
    };
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

  /** The colour of each creature tier, and the halo of tiers 6 to 9. */
  tierColors(_typeId: string): TierPalette {
    const { tierColors, customTierColors } = this.data.presentation;
    // No ladder has colours of its own for its tiers: a tier looks the same on every board.
    if (tierColors === CUSTOM_TIERS) return customTierColors ?? DEFAULT_TIERS;
    return TIER_PRESETS.find((t) => t.id === tierColors)?.palette ?? DEFAULT_TIERS;
  }

  /** The colour of a mark, and so of a pencil note and a wrapped board's seam. */
  markColor(_typeId: string): string {
    const choice = this.data.presentation.markColor;
    // No ladder overrides this, so every type's default is the green of the original's marks.
    return choice === DEFAULT ? MARK_COLOR : choice;
  }

  /** The colour the cursor lights a cell in when a click there would land. */
  highlightColor(typeId: string): string {
    const choice = this.data.presentation.highlightColor;
    // No ladder overrides this either: every type's default is the mark's colour, whatever that is.
    return choice === DEFAULT ? this.markColor(typeId) : choice;
  }
}
