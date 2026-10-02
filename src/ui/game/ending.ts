/**
 * How a board ends on screen: the record written down, the clear or loss overlay, and the
 * board-clear effect over the stage. For a single board and for a board of a Full Run, which ends
 * the run or waits for Continue. `App` owns the state and hands this a host that reads it live;
 * where the overlay's buttons go is `App`'s to say.
 */

import { findType, maxBoard } from '../../engine/config.js';
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
import { fatalBlow } from './recorder.js';
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

/**
 * How the board on screen ends: `finish` writes the record, puts up the outcome card and plays
 * the clear effect; `noteFatal` keeps the blow that ended a lost board for the card.
 */
export class BoardEnding {
  /** Stops a running board-clear effect; a screen rebuild must call it. */
  private stopVictory: (() => void) | null = null;
  /** The blow that ended a lost board, kept for the overlay. */
  private fatalBattle: { tier: number; damage: number } | null = null;

  constructor(private readonly host: EndingHost) {}

  /** A new board: no blow has ended it. */
  resetBoard(): void {
    this.fatalBattle = null;
  }

  /** Keep the blow that ended a lost board (`fatalBlow`), before the events go out of scope. */
  noteFatal(game: Game, events: GameEvent[]): void {
    if (game.status !== 'lost') return;
    const blow = fatalBlow(events);
    if (blow) this.fatalBattle = { tier: blow.tier, damage: blow.damage };
  }

  /** Cancel a board-clear effect still in flight; a screen rebuild must call this. */
  endVictory(): void {
    this.stopVictory?.();
    this.stopVictory = null;
  }

  /** The board on screen has been won or lost. */
  finish(): void {
    if (this.host.run()) {
      this.finishRunBoard();
      return;
    }
    const { progress, settings, clock, tutor } = this.host;
    const game = this.host.game();
    const typeId = this.host.typeId();
    const boardIndex = this.host.boardIndex();
    clock.freeze();
    const seconds = clock.frozenSeconds!;
    const won = game.status === 'won';
    const perfect = won && game.hp === game.maxHp;
    const type = findType(ladders, typeId);
    // Judged by the board's own dials, the ones it was dealt with, not by the settings, which can
    // be changed while it is being played.
    const recorded = isAtLeastAsHard(game.settings);
    // Read before the clear is written down, after which every clear would look like a repeat.
    const firstClear = won && !progress.boardRecord(ladders, typeId, boardIndex).cleared;
    const plays = won && this.effectPlays(firstClear);
    let unlocked: number | null = null;
    // A board cleared on settings easier than the tuned ones is not written down at all.
    if (won && recorded) {
      unlocked = progress.recordClear(ladders, typeId, boardIndex, {
        perfect,
        seconds,
        hints: tutor.hints,
      });
    }
    this.host.sfx.play(won ? 'win' : 'lose');

    const seed = this.host.seed();
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
        this.host.startBoard(typeId, to);
      },
      onReplay: () => this.host.startBoard(typeId, boardIndex),
      onSame: () => this.host.startBoard(typeId, boardIndex, seed),
      onList: () => this.host.showBoards(typeId),
    });
    this.host.root.querySelector('.screen')?.append(overlay);
    this.host.view()?.render();
    if (plays) this.celebrate();
  }

  /**
   * Whether the clear effect plays on this clear: there is one, and it plays on every clear or
   * this is the board's first.
   */
  private effectPlays(firstClear: boolean): boolean {
    const { settings } = this.host;
    const typeId = this.host.typeId();
    if (settings.victoryEffect(typeId) === null) return false;
    return settings.presentationFor(typeId).victoryWhen === 'every' || firstClear;
  }

  private finishRunBoard(): void {
    const { progress, clock, tutor } = this.host;
    const run = this.host.run()!;
    const game = this.host.game();
    const typeId = this.host.typeId();
    const boardIndex = this.host.boardIndex();
    const type = findType(ladders, typeId);
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
    this.host.sfx.play(game.status === 'lost' ? 'lose' : 'win');

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
      onContinue: () => this.host.advanceRun(),
      onNewRun: () => this.host.startFullRun(typeId),
      onSameRun: () => this.host.startFullRun(typeId, run.seed),
      onAbandon: () => this.host.askToLeave(),
      onList: () => this.host.showBoards(typeId),
    });
    this.host.root.querySelector('.screen')?.append(overlay);
    this.host.view()?.render();
    if (plays) this.celebrate();
  }

  /**
   * Fire the board-clear effect over the stage, not the overlay: the effect belongs to the board
   * that was just cleared. Drawn on its own layer so the board's renderer stays turn-based.
   */
  private celebrate(): void {
    const { settings } = this.host;
    const typeId = this.host.typeId();
    const effect = settings.victoryEffect(typeId);
    if (!effect) return;
    const stage = this.host.stage();
    if (!stage) return;
    this.endVictory();
    this.stopVictory = playVictory(
      stage,
      effect,
      settings.victoryLook(typeId),
      this.host.view()?.victorySource(),
      settings.presentationFor(typeId).effectSpeed,
    );
  }
}
