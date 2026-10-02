/**
 * How a board ends on screen: the record written down, the clear or loss overlay, and the
 * board-clear effect over the stage. For a single board and for a board of a Full Run, which ends
 * the run or waits for Continue. `App` owns the state and hands this a host that reads it live;
 * where the overlay's buttons go is `App`'s to say.
 */

import { maxBoard } from '../../engine/config.js';
import type { Game } from '../../engine/game.js';
import type { FullRun } from '../../engine/run.js';
import { isAtLeastAsHard } from '../../engine/settings.js';
import type { GameEvent } from '../../engine/types.js';
import type { BoardView } from '../board/view.js';
import { ladders } from '../ladders.js';
import type { Progress } from '../progress.js';
import type { Settings } from '../settings.js';
import type { Sfx } from '../sfx.js';
import { playVictory } from '../victory/play.js';
import type { BoardClock } from './clock.js';
import { buildBoardOutcome, buildRunOutcome } from './outcome.js';
import type { Tutor } from './tutor.js';

/** What an ending reads and calls on `App`. Functions, so each read sees the board as it is now. */
export interface EndingHost {
  readonly root: HTMLElement;
  readonly progress: Progress;
  readonly settings: Settings;
  readonly sfx: Sfx;
  readonly clock: BoardClock;
  readonly tutor: Tutor;
  game(): Game;
  run(): FullRun | null;
  typeId(): string;
  boardIndex(): number;
  seed(): number;
  view(): BoardView | null;
  /** The board's stage, where the clear effect plays; null off the game screen. */
  stage(): HTMLElement | null;
  startBoard(typeId: string, board: number, seed?: number): void;
  startFullRun(typeId: string, seed?: number): void;
  advanceRun(): void;
  /** Ask whether to pause or abandon the run, whatever Back does. */
  askToLeave(): void;
  /** Board select, with no run in progress. */
  showBoards(typeId: string): void;
}

export class BoardEnding {
  /** Stops a running board-clear effect; a screen rebuild must call it. */
  private stopVictory: (() => void) | null = null;
  /** The blow that ended a lost board, kept for the overlay. */
  private fatalBattle: { tier: number; damage: number } | null = null;

  constructor(private readonly h: EndingHost) {}

  /** A new board: no blow has ended it. */
  resetBoard(): void {
    this.fatalBattle = null;
  }

  /**
   * Keep the blow that ended a lost board, before the events go out of scope. The last costly
   * fight in the batch is the fatal one: a click resolves at most one fight, and a sweep stops the
   * moment HP runs out.
   */
  noteFatal(game: Game, events: GameEvent[]): void {
    if (game.status !== 'lost') return;
    const fights = events.filter((ev) => ev.type === 'battle' && ev.damage > 0);
    const last = fights[fights.length - 1];
    if (last && last.type === 'battle') {
      this.fatalBattle = { tier: last.tier, damage: last.damage };
    }
  }

  /** Cancel a board-clear effect still in flight; a screen rebuild must call this. */
  endVictory(): void {
    this.stopVictory?.();
    this.stopVictory = null;
  }

  /** The board on screen has been won or lost. */
  finish(): void {
    if (this.h.run()) {
      this.finishRunBoard();
      return;
    }
    const { progress, settings, clock, tutor } = this.h;
    const game = this.h.game();
    const typeId = this.h.typeId();
    const boardIndex = this.h.boardIndex();
    clock.freeze();
    const seconds = clock.frozenSeconds!;
    const won = game.status === 'won';
    const perfect = won && game.hp === game.maxHp;
    const type = ladders.find((t) => t.id === typeId)!;
    // Judged by the board's own dials, the ones it was dealt with, not by the settings, which can
    // be changed while it is being played.
    const recorded = isAtLeastAsHard(game.settings);
    // Read before the clear is written down, after which every clear would look like a repeat.
    const firstClear = won && !progress.boardRecord(ladders, typeId, boardIndex).cleared;
    const plays = won && this.effectPlays(firstClear);
    let unlocked: number | null = null;
    // A board cleared on settings easier than the tuned ones is not written down at all.
    if (won && recorded) {
      const result = progress.recordClear(ladders, typeId, boardIndex, {
        perfect,
        seconds,
        hints: tutor.hints,
      });
      unlocked = result.unlockedBoard;
    }
    this.h.sfx.play(won ? 'win' : 'lose');

    const seed = this.h.seed();
    const overlay = buildBoardOutcome({
      game,
      typeId,
      typeName: type.name,
      boardIndex,
      seed,
      won,
      perfect,
      // The wait is for watching the clear effect, so with no effect to watch there is none.
      hold: firstClear && plays ? settings.presentationFor(typeId).cardHold : 'none',
      timeExpired: clock.timeExpired,
      seconds,
      fatal: this.fatalBattle,
      recorded,
      hints: tutor.hints,
      unlocked,
      ladderLength: type.boards.length,
      lastBoard: maxBoard(ladders, typeId),
      gameplay: game.settings,
      onNext: () => {
        const to = boardIndex + 1;
        if (to > type.boards.length) progress.setScalingBoard(typeId, to);
        this.h.startBoard(typeId, to);
      },
      onReplay: () => this.h.startBoard(typeId, boardIndex),
      onSame: () => this.h.startBoard(typeId, boardIndex, seed),
      onList: () => this.h.showBoards(typeId),
    });
    this.h.root.querySelector('.screen')?.append(overlay);
    this.h.view()?.render();
    if (plays) this.celebrate();
  }

  /**
   * Whether the clear effect plays on this clear: there is one, and it plays on every clear or
   * this is the board's first.
   */
  private effectPlays(firstClear: boolean): boolean {
    const { settings } = this.h;
    const typeId = this.h.typeId();
    if (settings.victoryEffect(typeId) === null) return false;
    return settings.presentationFor(typeId).victoryWhen === 'every' || firstClear;
  }

  private finishRunBoard(): void {
    const { progress, clock, tutor } = this.h;
    const run = this.h.run()!;
    const game = this.h.game();
    const typeId = this.h.typeId();
    const boardIndex = this.h.boardIndex();
    const type = ladders.find((t) => t.id === typeId)!;
    const midRun = game.status === 'won' && !run.isLastBoard;
    const recorded = isAtLeastAsHard(game.settings);
    // A run's boards were all cleared before it opened, unless Unlock everything let it in.
    const plays =
      game.status === 'won' &&
      this.effectPlays(!progress.boardRecord(ladders, typeId, boardIndex).cleared);

    if (!midRun) {
      clock.freeze();
      if (recorded) {
        progress.recordRun(ladders, typeId, {
          completed: run.status === 'won',
          reachedBoard: boardIndex,
          hp: game.hp,
          seconds: clock.frozenSeconds!,
          hints: tutor.runHints,
        });
      }
    }
    this.h.sfx.play(game.status === 'lost' ? 'lose' : 'win');

    const overlay = buildRunOutcome({
      game,
      run,
      typeName: type.name,
      boardIndex,
      seconds: clock.elapsedSeconds(),
      recorded,
      hints: tutor.hints,
      runHints: tutor.runHints,
      gameplay: game.settings,
      onContinue: () => this.h.advanceRun(),
      onNewRun: () => this.h.startFullRun(typeId),
      onSameRun: () => this.h.startFullRun(typeId, run.seed),
      onAbandon: () => this.h.askToLeave(),
      onList: () => this.h.showBoards(typeId),
    });
    this.h.root.querySelector('.screen')?.append(overlay);
    this.h.view()?.render();
    if (plays) this.celebrate();
  }

  /**
   * Fire the board-clear effect over the stage, not the overlay: the effect belongs to the board
   * that was just cleared. Drawn on its own layer so the board's renderer stays turn-based.
   */
  private celebrate(): void {
    const { settings } = this.h;
    const typeId = this.h.typeId();
    const effect = settings.victoryEffect(typeId);
    if (!effect) return;
    const stage = this.h.stage();
    if (!stage) return;
    this.endVictory();
    this.stopVictory = playVictory(
      stage,
      effect,
      settings.victoryLook(typeId),
      this.h.view()?.victorySource(),
      settings.presentationFor(typeId).effectSpeed,
    );
  }
}
