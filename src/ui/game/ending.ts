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
  leaveGame(): void;
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
    const recorded = isAtLeastAsHard(game.settings);
    // Read before the clear is written down, after which every clear would look like a repeat.
    const firstClear = won && !progress.boardRecord(typeId, boardIndex).cleared;
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
      // The wait is for watching the clear effect, so with the effect off there is none.
      held: firstClear && settings.victoryEffect(typeId) !== null,
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
    if (won) this.celebrate();
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

    if (!midRun) {
      clock.freeze();
      if (recorded) {
        progress.recordRun(typeId, {
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
      onAbandon: () => this.h.leaveGame(),
      onList: () => this.h.showBoards(typeId),
    });
    this.h.root.querySelector('.screen')?.append(overlay);
    this.h.view()?.render();
    if (game.status === 'won') this.celebrate();
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
    );
  }
}
