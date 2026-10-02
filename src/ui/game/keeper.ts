/**
 * Keeping the board on screen as a paused game (decision 0057): every move written down as it is
 * made, the game written to its slot after each, and the slot emptied when the game ends. Pausing
 * is then only leaving: the game is already kept. `App` owns the state and hands this a host that
 * reads it live, as it does `BoardActions`. `takeUp` is the way back in.
 */

import { boardConfig } from '../../engine/config.js';
import { Game } from '../../engine/game.js';
import {
  DIGEST_VERSION,
  type Move,
  boardDigest,
  decodeMove,
  encodeMove,
  playMove,
  replayMoves,
} from '../../engine/replay.js';
import { FullRun } from '../../engine/run.js';
import type { GameEvent } from '../../engine/types.js';
import { ladders } from '../ladders.js';
import { type PausedGame, type Slot, newToken, pausedGames } from '../paused.js';
import type { BoardClock } from './clock.js';
import type { Tutor } from './tutor.js';

/** What the keeper reads on `App`. Functions, so each read sees the board as it is now. */
export interface KeeperHost {
  game(): Game | null;
  run(): FullRun | null;
  typeId(): string;
  boardIndex(): number;
  readonly clock: BoardClock;
  readonly tutor: Tutor;
}

/**
 * Keeps the board on screen in its paused-game slot: makes each move, writes the moves down and
 * the game to the slot after each, and empties the slot when the game ends.
 */
export class BoardKeeper {
  private moves: Move[] = [];
  /** This tab's claim on the game's slot, or null while nothing is being kept. */
  private token: string | null = null;
  /** Whether the slot has been written yet: the first write claims it. */
  private written = false;

  constructor(private readonly h: KeeperHost) {}

  /**
   * Whether there is a game worth pausing: one being kept, with a move made on it or, in a run,
   * a board already behind it. A board just dealt has nothing to lose and is not kept until then.
   */
  get holding(): boolean {
    return this.token !== null && (this.moves.length > 0 || (this.h.run()?.legs.length ?? 0) > 0);
  }

  /** A board has been dealt, or a paused one taken up after these moves: keep it from now on. */
  begin(moves: readonly Move[] = []): void {
    this.moves = [...moves];
    this.token = newToken();
    this.written = false;
  }

  /** A run has gone on to its next board: the run is still this game, the moves start again. */
  nextBoard(): void {
    this.moves = [];
    this.save();
  }

  /** Stop keeping, leaving the slot as it stands: a game paused, or a lesson begun. */
  release(): void {
    this.moves = [];
    this.token = null;
  }

  /** The game has ended, or been abandoned: its slot is emptied and nothing more is kept. */
  end(): void {
    if (this.token && this.written) pausedGames.drop(this.slot(), this.token);
    this.release();
  }

  /** Make a move on the board on screen, and keep it. */
  move(move: Move): GameEvent[] {
    const events = playMove(this.h.game()!, move);
    if (this.token) {
      this.moves.push(move);
      this.save();
    }
    return events;
  }

  /**
   * Write the game to its slot as it stands now, the clock included. After every move, after a
   * hint, and as the page is hidden or closed. If another tab has taken the slot since, this tab's
   * copy stops being kept rather than writing over it.
   */
  save(): void {
    const game = this.h.game();
    if (!game || !this.token || !this.holding) return;
    const run = this.h.run();
    const record: PausedGame = {
      typeId: this.h.typeId(),
      board: this.h.boardIndex(),
      seed: run?.seed ?? game.seed,
      gameplay: game.settings,
      ...(run ? { legs: run.legs.map((leg) => ({ ...leg })) } : {}),
      moves: this.moves.map(encodeMove),
      digest: boardDigest(game),
      digestVersion: DIGEST_VERSION,
      elapsedMs: this.h.clock.elapsedMs(),
      timeLimit: this.h.clock.timeLimit,
      hints: this.h.tutor.hints,
      runHints: this.h.tutor.runHints,
      hp: game.hp,
      maxHp: run?.maxHp ?? game.maxHp,
      token: this.token,
    };
    if (pausedGames.put(this.slot(), record, !this.written)) this.written = true;
    else if (this.written) this.release();
  }

  private slot(): Slot {
    const typeId = this.h.typeId();
    return this.h.run() ? { typeId, run: true } : { typeId, board: this.h.boardIndex() };
  }
}

/** A paused game rebuilt: the board, the run it belongs to, and what was kept beside it. */
export interface TakenUp {
  game: Game;
  run: FullRun | null;
  moves: Move[];
  paused: PausedGame;
}

/**
 * Rebuild the game paused in a slot by replaying its moves on its seed with its dials. Null when
 * the slot is empty; 'changed' when the replay does not reach the board that was paused, which an
 * update to the ladder or to a rule can do, and then the slot is emptied, because a different
 * board under the old one's name is worse than no board.
 */
export function takeUp(slot: Slot): TakenUp | 'changed' | null {
  const paused = pausedGames.get(slot);
  if (!paused) return null;
  try {
    const moves = paused.moves.map((code) => {
      const move = decodeMove(code);
      if (!move) throw new Error('not a move');
      return move;
    });
    const settings = paused.gameplay;
    let run: FullRun | null = null;
    let game: Game;
    if ('run' in slot) {
      run = FullRun.resume(ladders, slot.typeId, paused.seed, paused.legs ?? [], { settings });
      if (run.boardIndex !== paused.board) throw new Error('not this board');
      game = run.game;
    } else {
      game = Game.create(boardConfig(ladders, slot.typeId, slot.board), paused.seed, { settings });
    }
    replayMoves(game, moves);
    // A game that ended was never left in its slot, so one that replays to an end has changed.
    const playing = run ? run.status === 'playing' : game.status === 'playing';
    const digest = boardDigest(game, paused.digestVersion ?? 1);
    if (!playing || digest !== paused.digest) throw new Error('changed');
    return { game, run, moves, paused };
  } catch {
    pausedGames.drop(slot);
    return 'changed';
  }
}
