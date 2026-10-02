/**
 * What a click on the board will do: open, mark a tier, pencil a tier, or cast an armed spell.
 * One object, so the rule that an armed tier and an armed spell exclude each other lives in one
 * place rather than in every method that writes either (decision 0008).
 */

import type { SpellId } from '../../engine/spells.js';

/**
 * No tier armed. Not 0, because tier 0 is a real choice: the pencil's "might be empty ground"
 * (decision 0009).
 */
const NO_TIER = -1;

/** The palette's state: the armed tier, pencil or mark, and the armed spell, kept exclusive. */
export class EntryMode {
  /** The armed tier, or `NO_TIER`. */
  markMode = NO_TIER;
  /** When on, the LV palette pencils candidates instead of writing marks. */
  notesMode = false;
  /** True when pencil mode armed the tier itself, so it can hand it back. */
  tierArmedByPencil = false;
  /** A targeted spell waiting for the player to pick a cell. */
  pendingSpell: SpellId | null = null;

  /** Per-board state. Never touches the clock; a run outlives a board. */
  reset(): void {
    this.markMode = NO_TIER;
    this.notesMode = false;
    this.tierArmedByPencil = false;
    this.pendingSpell = null;
  }

  /** Select a palette tier, or clear the selection by picking it again. */
  pickTier(tier: number): void {
    this.markMode = this.markMode === tier ? NO_TIER : tier;
    this.tierArmedByPencil = false;
    this.pendingSpell = null;
  }

  /** Arm a targeted spell; picking the armed spell again disarms it. */
  armSpell(id: SpellId): void {
    this.pendingSpell = this.pendingSpell === id ? null : id;
    this.markMode = NO_TIER; // the two targeting modes are mutually exclusive
  }

  cancelSpell(): void {
    this.pendingSpell = null;
  }

  /**
   * Escape: cancel the armed spell, else clear the armed tier. False when nothing was armed, so
   * the caller can treat the key as "back out".
   */
  escape(): boolean {
    if (this.pendingSpell) {
      this.pendingSpell = null;
      return true;
    }
    if (this.markMode >= 0) {
      this.markMode = NO_TIER;
      return true;
    }
    return false;
  }

  /**
   * Switch between marking and pencilling. Pencilling needs a tier as well as the mode, and
   * requiring two clicks before anything can happen is what made this look broken, so entering
   * pencil mode arms tier 1; leaving hands back a tier the pencil armed for itself, and drops tier
   * 0, which only means anything to the pencil.
   */
  toggleNotes(): void {
    this.notesMode = !this.notesMode;
    if (this.notesMode && this.markMode < 0) {
      this.markMode = 1;
      this.tierArmedByPencil = true;
      this.pendingSpell = null;
    }
    if (!this.notesMode) {
      if (this.tierArmedByPencil) this.markMode = NO_TIER;
      if (this.markMode === 0) this.markMode = NO_TIER;
      this.tierArmedByPencil = false;
    }
  }
}
