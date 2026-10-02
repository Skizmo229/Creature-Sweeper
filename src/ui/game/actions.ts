/**
 * What the player's input does on a board: a click, a right-click, a tier or a spell picked, the
 * pencil toggled, Sweep, and every key. `App` owns the state and hands this a host that reads it
 * live; every action ends in `apply` (the events) or `refresh` (the screen).
 */

import type { Game } from '../../engine/game.js';
import type { Move } from '../../engine/replay.js';
import { SPELLS, type SpellId, spellKey } from '../../engine/spells.js';
import type { Cell, GameEvent } from '../../engine/types.js';
import { offersBeatenNumbers } from '../board/paint.js';
import type { BoardView } from '../board/view.js';
import type { RightClick } from '../presentation.js';
import type { Settings } from '../settings.js';
import type { Sfx } from '../sfx.js';
import type { EntryMode } from './mode.js';

/** What PATROL's Wait costs on the clock: a move bought with time rather than a risk (0064). */
const WAIT_SECONDS = 1;

/** What the actions read and call on `App`. Functions, so each read sees the board as it is now. */
export interface BoardActionsHost {
  game(): Game | null;
  view(): BoardView | null;
  readonly mode: EntryMode;
  readonly sfx: Sfx;
  /**
   * What a click reads (the chord, what a right-click does), and where the Beaten toggle is kept,
   * as the speaker keeps the mute.
   */
  readonly settings: Settings;
  /** Make a move on the board on screen: the one door every action of the player's goes through. */
  move(move: Move): GameEvent[];
  apply(events: GameEvent[]): void;
  refresh(): void;
  /** Put time on the board's clock. */
  addSeconds(seconds: number): void;
  leaveGame(): void;
  /** Pause the game: it waits on the board list, its clock stopped. */
  pause(): void;
  /** A hint: the tutor points at the next provable move, or the next it found if one is showing. */
  hint(): void;
  /** The field guide, at what the tutor is showing, if anything. */
  guide(): void;
  /** Whether opening this cell is refused (a lesson board's rule), said to the player if so. */
  refuse(x: number, y: number): boolean;
  /** On a lesson board: go on to the next step. */
  next(): void;
}

/**
 * The mark a right-click leaves on a cell marked `mark`, 0 for none: the next tier up or down
 * round the cycle, the next still on the counters, or nothing. A cycle passes through "no mark"
 * once round, as it always did.
 */
export function nextMark(game: Game, mark: number, rule: RightClick): number {
  const top = game.config.tiers;
  if (rule === 'clear') return 0;
  if (rule === 'cycleDown') return mark === 0 ? top : mark - 1;
  let next = mark;
  for (let step = 0; step < top; step++) {
    next = next >= top ? 0 : next + 1;
    if (next === 0 || rule === 'cycleUp' || game.counterFor(next) > 0) return next;
  }
  return 0;
}

/**
 * What the player's clicks, buttons and keys do on the board on screen. Each is decided from the
 * entry mode and made through the host's `move`; nothing here changes the game any other way.
 */
export class BoardActions {
  constructor(private readonly host: BoardActionsHost) {}

  /** The game on screen while it is being played; null before it is dealt and after it ends. */
  private playing(): Game | null {
    const game = this.host.game();
    return game?.status === 'playing' ? game : null;
  }

  onCellPrimary(x: number, y: number): void {
    const game = this.playing();
    if (!game) return;
    // A pending spell claims the click before anything else does.
    if (this.host.mode.pendingSpell) {
      const id = this.host.mode.pendingSpell;
      this.host.mode.cancelSpell();
      this.host.apply(this.host.move({ kind: 'cast', id, x, y }));
      return;
    }
    if (this.host.mode.markMode >= 0) {
      const tier = this.host.mode.markMode;
      this.host.apply(
        this.host.move(
          this.host.mode.notesMode
            ? { kind: 'note', x, y, tier }
            : { kind: 'mark', x, y, mark: tier },
        ),
      );
      return;
    }
    // In pencil mode a click annotates or does nothing; it never opens (decision 0008).
    if (this.host.mode.notesMode) return;
    // A click on an open cell chords, when the player has asked: its ring swept at a sweep's price.
    if (game.cellAt(x, y)?.open && this.host.settings.presentation.chord) {
      this.sweepMove({ kind: 'chord', x, y, useMarks: false });
      return;
    }
    if (this.host.refuse(x, y)) return;
    this.host.apply(this.host.move({ kind: 'open', x, y }));
  }

  /**
   * A sweep of the board, or a chord: one open cell's ring swept at a sweep's price. The engine
   * refuses either while the dial has Sweep closed, so it is refused here first, with its sound,
   * and neither the keyboard nor a chord can get past a gate the button is showing.
   */
  private sweepMove(move: Extract<Move, { kind: 'sweep' | 'chord' }>): void {
    const game = this.playing();
    if (!game) return;
    if (!game.sweepAvailable) {
      this.host.sfx.play('blocked');
      return;
    }
    const events = this.host.move(move);
    if (events.length > 0) this.host.sfx.play('sweep');
    this.host.apply(events);
  }

  /** Untargeted spells fire at once; targeted ones arm and wait for a cell. */
  pickSpell(id: SpellId): void {
    const game = this.playing();
    if (!game || !game.canCast(id)) return;
    if (!SPELLS[id].targeted) {
      this.host.mode.cancelSpell();
      this.host.apply(this.host.move({ kind: 'cast', id }));
      return;
    }
    this.host.mode.armSpell(id);
    this.host.refresh();
  }

  /** The spell row's Cancel: disarm a spell picked but not yet cast. */
  cancelSpell(): void {
    this.host.mode.cancelSpell();
    this.host.refresh();
  }

  /**
   * A right-click (or a long press) on a covered cell, as the setting has it: the mark cycled up,
   * down or through the tiers still on the counters, or cleared. A cycle that comes round to
   * nothing, and a clear, mark the cell with its own mark, which is how the engine takes one off.
   */
  cycleMark(x: number, y: number): void {
    const game = this.playing();
    if (!game) return;
    const cell = game.cellAt(x, y);
    if (!cell || cell.open) return;
    const next = nextMark(game, cell.mark, this.host.settings.presentation.rightClick);
    if (next === cell.mark) return;
    this.host.apply(this.host.move({ kind: 'mark', x, y, mark: next === 0 ? cell.mark : next }));
  }

  pickTier(tier: number): void {
    this.host.mode.pickTier(tier);
    this.host.refresh();
  }

  /** The palette's empty-set button: pencil mode, armed with the empty set. */
  pencilEmpty(): void {
    this.host.mode.notesMode = true;
    this.pickTier(0);
  }

  toggleNotesMode(): void {
    this.host.mode.toggleNotes();
    this.host.refresh();
  }

  /**
   * The Beaten toggle: every beaten creature shows its number, or its creature again (decision
   * 0067). A way of looking and not a move, so it is kept in the settings, not the game.
   */
  toggleBeatenNumbers(): void {
    const game = this.host.game();
    if (!game || !offersBeatenNumbers(game)) return;
    this.host.settings.setPresentation({
      beatenNumbers: !this.host.settings.presentation.beatenNumbers,
    });
    this.host.refresh();
  }

  doSweep(useMarks: boolean): void {
    this.sweepMove({ kind: 'sweep', useMarks });
  }

  /** PATROL's Wait. The engine refuses it anywhere else, so the key can ask on every board. */
  doWait(): void {
    if (!this.playing()?.patrols) return;
    // Charged before the move, which the engine never refuses here, so the game kept after it
    // (the keeper writes the clock down on every move) already holds the second.
    this.host.addSeconds(WAIT_SECONDS);
    this.host.apply(this.host.move({ kind: 'wait' }));
  }

  /** Zoom in or out a step, or fit the board to the stage; false for any other key. */
  private zoomKey(e: KeyboardEvent, key: string): boolean {
    const view = this.host.view();
    if (e.key === '+' || e.key === '=') view?.nudgeZoom(2);
    else if (e.key === '-' || e.key === '_') view?.nudgeZoom(-2);
    else if (key === 'f') view?.fit();
    else return false;
    e.preventDefault();
    return true;
  }

  /** A key pressed while the board is on screen; `App` sends nothing else here. */
  onKey(e: KeyboardEvent): void {
    const game = this.host.game();
    if (!game) return;
    // A key with Ctrl, Cmd or Alt held is the browser's (Ctrl+H is its history, Cmd+U the page's
    // source), never the board's (decision 0082).
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === 'Escape') {
      if (this.host.mode.escape()) this.host.refresh();
      else this.host.leaveGame();
      return;
    }
    // Looking, not a move, so it works on a board that has ended.
    if (e.key.toLowerCase() === 'u') {
      e.preventDefault();
      this.toggleBeatenNumbers();
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
    if (key === 'w' && game.patrols) {
      e.preventDefault();
      this.doWait();
      return;
    }
    if (key === 'p') {
      e.preventDefault();
      this.host.pause();
      return;
    }
    if (key === 'h') {
      e.preventDefault();
      this.host.hint();
      return;
    }
    if (key === 'g') {
      e.preventDefault();
      this.host.guide();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.host.next();
      return;
    }
    if (this.zoomKey(e, key)) return;
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
      const cell: Cell | null = this.host.view()?.hoveredCell ?? null;
      const tier = Number(digit[1]);
      if (tier > game.config.tiers) return;
      e.preventDefault();
      if (cell) {
        // The Entry mode decides, exactly as it does for a click, and Shift inverts it for this
        // one keystroke.
        const pencil = this.host.mode.notesMode !== e.shiftKey;
        const { x, y } = cell;
        this.host.apply(
          this.host.move(
            pencil ? { kind: 'note', x, y, tier } : { kind: 'mark', x, y, mark: tier },
          ),
        );
      } else {
        if (e.shiftKey) this.host.mode.notesMode = true;
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
    const game = this.host.game();
    if (!game) return true;
    if (this.host.mode.markMode >= 0) {
      if (cell.open) return true;
      if (cell.given) return false;
      return !this.host.mode.notesMode || game.canNote(cell, this.host.mode.markMode);
    }
    return game.inReach(cell);
  }
}
