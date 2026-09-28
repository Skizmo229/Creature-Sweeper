/**
 * The board's clock, which the engine does not own. It starts when the board is dealt, because
 * the dealt opening is board information the player reads first (decision 0016); a Full Run
 * starts it once on board 1 and never restarts it. Time Attack counts down from the player's own
 * best and nothing else; expiry is reported by the caller through `game.forfeit`.
 */

export class BoardClock {
  /** When this board's clock started, or null before a board is dealt. */
  startedAt: number | null = null;
  /** The elapsed time when the board ended, held so the overlay and the record agree. */
  frozenSeconds: number | null = null;
  /** Seconds this board must be cleared within, or null for an ordinary count-up. */
  timeLimit: number | null = null;
  /** True once the countdown has reached zero and been reported, so it is reported once. */
  timeExpired = false;
  private rafId = 0;

  /** A board has just been dealt: the clock starts now. */
  begin(): void {
    this.startedAt = performance.now();
    this.frozenSeconds = null;
  }

  /**
   * Set the countdown, if Time Attack has something to race: the player's own previous best, a
   * time they have already proved is achievable, so the mode is exactly as hard as they last
   * made it. A board with no best has nothing to race and plays normally.
   */
  arm(best: number | null, timeAttack: boolean): void {
    this.timeExpired = false;
    this.timeLimit = timeAttack && best !== null && best > 0 ? best : null;
  }

  /**
   * A paused game taken up again: the clock carries on from where it stood, to the millisecond,
   * so pausing never rounds a second off a best time.
   */
  resumeAt(elapsedMs: number): void {
    this.startedAt = performance.now() - elapsedMs;
    this.frozenSeconds = null;
  }

  /**
   * Put time on a running clock, as PATROL's Wait does (decision 0064). It moves the start back
   * rather than keeping a separate tally, so a paused game, a Full Run and Time Attack's countdown
   * all see it with nothing else taught. A clock not started or already stopped is left alone.
   */
  addSeconds(seconds: number): void {
    if (this.startedAt === null || this.frozenSeconds !== null) return;
    this.startedAt -= seconds * 1000;
  }

  /** The time on the clock exactly, for keeping a paused game. */
  elapsedMs(): number {
    if (this.frozenSeconds !== null) return this.frozenSeconds * 1000;
    if (this.startedAt === null) return 0;
    return performance.now() - this.startedAt;
  }

  elapsedSeconds(): number {
    return Math.min(9999, Math.floor(this.elapsedMs() / 1000));
  }

  /**
   * Seconds left on a Time Attack board, or null when not racing one. Floored at 0, because the
   * frame that reaches 0 ends the board and the HUD should show what the player was left with.
   */
  remainingSeconds(): number | null {
    if (this.timeLimit === null) return null;
    return Math.max(0, this.timeLimit - this.elapsedSeconds());
  }

  /** The board has ended: hold the elapsed time and stop ticking. */
  freeze(): void {
    this.frozenSeconds = this.elapsedSeconds();
    this.stop();
  }

  /** Tick every frame. A hidden tab stops ticking, and expiry registers on its next frame. */
  start(tick: () => void): void {
    this.stop();
    const loop = () => {
      tick();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}
