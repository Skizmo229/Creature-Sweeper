/**
 * Tallying what a board costs the player as it is played, for the play statistics
 * (`src/ui/telemetry.ts`): every move goes through `move`, which counts it and, for a click that
 * opens a cell, asks the board whether that cell was provable first, marks untrusted. What was not
 * is a guess, the honest definition of one. `end` writes the attempt down. A lesson board is not
 * played for a record and is never tallied; a paused board taken up is tallied from where it was
 * taken up, since the moves before were made in another session.
 */

import type { Game } from '../../engine/game.js';
import type { Move } from '../../engine/replay.js';
import { isAtLeastAsHard } from '../../engine/settings.js';
import type { GameEvent } from '../../engine/types.js';
import type { Attempt } from '../telemetry.js';

/**
 * What the recorder reads and calls on `App`. Functions, so each read sees the board as it is now;
 * the clock, the tutor and the store only by what is read of them, so the test that drives a
 * recorder over a real board compiles without a DOM, as the engine's tests do.
 */
export interface RecorderHost {
  game(): Game | null;
  typeId(): string;
  boardIndex(): number;
  readonly clock: { elapsedSeconds(): number; readonly timeExpired: boolean };
  readonly tutor: { readonly hints: number };
  readonly telemetry: {
    record(typeId: string, board: number, tuned: boolean, attempt: Attempt): void;
  };
  /** Make the move on the board on screen: the keeper's door. */
  play(move: Move): GameEvent[];
}

type Counts = Pick<Attempt, 'opens' | 'guesses' | 'sweeps' | 'casts'>;

export class BoardRecorder {
  private counts: Counts = { opens: 0, guesses: 0, sweeps: 0, casts: 0 };
  /** HP, hints and seconds when the attempt began, so the attempt's own are differences. */
  private start: { hp: number; hints: number; seconds: number } | null = null;
  /** The tier of the blow that ended a lost board, from the events of the move that lost it. */
  private fatalTier: number | null = null;

  constructor(private readonly h: RecorderHost) {}

  /** A board dealt, or a paused one taken up: tally from here. Nothing is tallied until this. */
  begin(): void {
    const game = this.h.game();
    if (!game) return;
    this.counts = { opens: 0, guesses: 0, sweeps: 0, casts: 0 };
    this.fatalTier = null;
    this.start = {
      hp: game.hp,
      hints: this.h.tutor.hints,
      seconds: this.h.clock.elapsedSeconds(),
    };
  }

  /** Make a move and count it. A move the board refused counts as nothing. */
  move(move: Move): GameEvent[] {
    const game = this.h.game();
    // Asked before the move, since the move changes what is provable.
    const proven =
      this.start && game && move.kind === 'open'
        ? game.safeCells({ useMarks: false }).some((c) => c.x === move.x && c.y === move.y)
        : true;
    const events = this.h.play(move);
    if (!this.start || events.some((e) => e.type === 'blocked')) return events;
    if (move.kind === 'open') {
      this.counts.opens++;
      if (!proven) this.counts.guesses++;
    } else if (move.kind === 'sweep') {
      this.counts.sweeps++;
    } else if (move.kind === 'cast') {
      this.counts.casts++;
    }
    if (events.some((e) => e.type === 'lost')) {
      const fights = events.filter((e) => e.type === 'battle' && e.damage > 0);
      const last = fights[fights.length - 1];
      if (last && last.type === 'battle') this.fatalTier = last.tier;
    }
    return events;
  }

  /** The attempt is over: written to its board's totals, under the dials it was played with. */
  end(how: Attempt['how']): void {
    const game = this.h.game();
    const start = this.start;
    this.start = null;
    if (!game || !start) return;
    const attempt: Attempt = {
      how,
      ...this.counts,
      hpLost: Math.max(0, start.hp - game.hp),
      hints: Math.max(0, this.h.tutor.hints - start.hints),
      seconds: Math.max(0, this.h.clock.elapsedSeconds() - start.seconds),
    };
    if (how === 'lost') {
      attempt.deathBy = this.h.clock.timeExpired ? 'time' : String(this.fatalTier ?? 'forfeit');
    }
    this.h.telemetry.record(
      this.h.typeId(),
      this.h.boardIndex(),
      isAtLeastAsHard(game.settings),
      attempt,
    );
  }
}
