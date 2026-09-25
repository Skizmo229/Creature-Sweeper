/**
 * What the player's input does on a board: a click, a right-click, a tier or a spell picked, the
 * pencil toggled, Sweep, and every key. `App` owns the state and hands this a host that reads it
 * live; every action ends in `apply` (the events) or `refresh` (the screen).
 */

import type { Game } from '../../engine/game.js';
import { SPELLS, type SpellId, spellKey } from '../../engine/spells.js';
import type { Cell, GameEvent } from '../../engine/types.js';
import type { BoardView } from '../board/view.js';
import type { Sfx } from '../sfx.js';
import type { EntryMode } from './mode.js';

/** What the actions read and call on `App`. Functions, so each read sees the board as it is now. */
export interface BoardActionsHost {
  game(): Game | null;
  view(): BoardView | null;
  readonly mode: EntryMode;
  readonly sfx: Sfx;
  apply(events: GameEvent[]): void;
  refresh(): void;
  leaveGame(): void;
}

export class BoardActions {
  constructor(private readonly h: BoardActionsHost) {}

  onCellPrimary(x: number, y: number): void {
    const game = this.h.game();
    if (!game || game.status !== 'playing') return;
    // A pending spell claims the click before anything else does.
    if (this.h.mode.pendingSpell) {
      const id = this.h.mode.pendingSpell;
      this.h.mode.cancelSpell();
      this.h.apply(game.cast(id, x, y));
      return;
    }
    if (this.h.mode.markMode >= 0) {
      const tier = this.h.mode.markMode;
      this.h.apply(this.h.mode.notesMode ? game.toggleNote(x, y, tier) : game.setMark(x, y, tier));
      return;
    }
    // In pencil mode a click annotates or does nothing; it never opens (decision 0008).
    if (this.h.mode.notesMode) return;
    this.h.apply(game.open(x, y));
  }

  pickSpell(id: SpellId): void {
    const game = this.h.game();
    if (!game || game.status !== 'playing' || !game.canCast(id)) return;
    if (!SPELLS[id].targeted) {
      this.h.mode.cancelSpell();
      this.h.apply(game.cast(id));
      return;
    }
    this.h.mode.armSpell(id);
    this.h.refresh();
  }

  cycleMark(x: number, y: number): void {
    const game = this.h.game();
    if (!game || game.status !== 'playing') return;
    const cell = game.cellAt(x, y);
    if (!cell || cell.open) return;
    const next = cell.mark >= game.config.tiers ? 0 : cell.mark + 1;
    this.h.apply(game.setMark(x, y, next === 0 ? cell.mark : next));
  }

  pickTier(tier: number): void {
    this.h.mode.pickTier(tier);
    this.h.refresh();
  }

  toggleNotesMode(): void {
    this.h.mode.toggleNotes();
    this.h.refresh();
  }

  doSweep(useMarks: boolean): void {
    const game = this.h.game();
    if (!game || game.status !== 'playing') return;
    // The engine refuses a sweep the dial has closed, so the keyboard cannot get past a gate the
    // button is showing.
    if (!game.sweepAvailable) {
      this.h.sfx.play('blocked');
      return;
    }
    const events = game.sweep({ useMarks });
    if (events.length > 0) this.h.sfx.play('sweep');
    this.h.apply(events);
  }

  /** A key pressed while the board is on screen; `App` sends nothing else here. */
  onKey(e: KeyboardEvent): void {
    const game = this.h.game();
    if (!game) return;

    if (e.key === 'Escape') {
      if (this.h.mode.escape()) this.h.refresh();
      else this.h.leaveGame();
      return;
    }
    if (game.status !== 'playing') return;

    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      this.doSweep(e.shiftKey);
      return;
    }
    if (key === 'd') {
      e.preventDefault();
      this.doSweep(true);
      return;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.h.view()?.nudgeZoom(2);
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.h.view()?.nudgeZoom(-2);
      return;
    }
    if (key === 'f') {
      e.preventDefault();
      this.h.view()?.fit();
      return;
    }
    // A spell's own letter casts it, checked after the board's own keys so a spell can never
    // shadow Sweep or zoom.
    const spell = game.spells.find((id) => spellKey(id) === key);
    if (spell) {
      e.preventDefault();
      this.pickSpell(spell);
      return;
    }

    if (key === 'n') {
      e.preventDefault();
      this.toggleNotesMode();
      return;
    }

    // Digits come off e.code, not e.key: Shift+1 is "!" on a US layout and something else again
    // elsewhere, so the key would be unreadable exactly when the pencil needs it.
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      const cell: Cell | null = this.h.view()?.hoveredCell ?? null;
      const tier = Number(digit[1]);
      if (tier > game.config.tiers) return;
      e.preventDefault();
      if (cell) {
        // The Entry mode decides, exactly as it does for a click, and Shift inverts it for this
        // one keystroke.
        const pencil = this.h.mode.notesMode !== e.shiftKey;
        this.h.apply(
          pencil ? game.toggleNote(cell.x, cell.y, tier) : game.setMark(cell.x, cell.y, tier),
        );
      } else {
        if (e.shiftKey) this.h.mode.notesMode = true;
        this.pickTier(tier);
      }
      return;
    }
  }

  /**
   * Whether a click on this cell would land in the mode the palette is in, which is what the
   * board's cursor colours itself by. Annotation is exempt from the crawl rule, so while a tier
   * is armed only annotation's own refusals apply: a given, or a ruled-out candidate.
   */
  clickLands(cell: Cell): boolean {
    const game = this.h.game();
    if (!game) return true;
    if (this.h.mode.markMode >= 0) {
      if (cell.open) return true;
      if (cell.given) return false;
      return !this.h.mode.notesMode || game.canNote(cell, this.h.mode.markMode);
    }
    return game.inReach(cell);
  }
}
