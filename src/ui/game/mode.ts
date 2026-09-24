/**
 * What a click on the board will do: open, mark a tier, pencil a tier, or cast an armed spell.
 * One object, so the rule that an armed tier and an armed spell exclude each other lives in one
 * place rather than in every method that writes either (decision 0008).
 */

import type { SpellId } from '../../engine/spells.js';

export class EntryMode {
  /** Palette selection: -1 is none. 0 is a real choice (empty ground), which is why "none" cannot be 0. */
  markMode = -1;
  /** When on, the LV palette pencils candidates instead of writing marks. */
  notesMode = false;
  /** True when pencil mode armed the tier itself, so it can hand it back. */
  tierArmedByPencil = false;
  /** A targeted spell waiting for the player to pick a cell. */
  pendingSpell: SpellId | null = null;

  /** Per-board state. Never touches the clock; a run outlives a board. */
  reset(): void {
    this.markMode = -1;
    this.notesMode = false;
    this.tierArmedByPencil = false;
    this.pendingSpell = null;
  }

  /** Select a palette tier, or clear the selection by picking it again. */
  pickTier(tier: number): void {
    this.markMode = this.markMode === tier ? -1 : tier;
    this.tierArmedByPencil = false;
    this.pendingSpell = null;
  }

  /** Arm a targeted spell; picking the armed spell again disarms it. */
  armSpell(id: SpellId): void {
    this.pendingSpell = this.pendingSpell === id ? null : id;
    this.markMode = -1; // the two targeting modes are mutually exclusive
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
      this.markMode = -1;
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
      if (this.tierArmedByPencil) this.markMode = -1;
      if (this.markMode === 0) this.markMode = -1;
      this.tierArmedByPencil = false;
    }
  }
}
