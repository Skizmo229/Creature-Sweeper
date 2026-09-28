/**
 * How Sweep is gated by the player's dial (decision 0014): always on, off, charged by the cells
 * opened by hand, ten a sweep by default, or a budget of so many sweeps a board (decision 0072).
 * Engine-internal: `Game` banks a hand-opened cell
 * here, asks whether a sweep may go, and pays for one that did something. The dial lives in the
 * engine rather than the UI because the charge is earned by opening cells, which only the engine
 * sees, and so that a button that forgot to disable itself still cannot sweep past the gate.
 */

import type { GameplaySettings } from './settings.js';

export class SweepGate {
  /**
   * Cells opened BY HAND since the last sweep. Only those count, which is what stops the meter
   * feeding itself: a sweep that opened forty cells would otherwise bank four more sweeps and the
   * gate would be no gate at all. A cascade is one click, so it is one charge, for the same reason.
   */
  private charge = 0;
  /** Sweeps spent from a budget. */
  private used = 0;

  constructor(private readonly settings: GameplaySettings) {}

  /** A cell opened by hand banks toward the next charged sweep. */
  bank(): void {
    this.charge++;
  }

  /** Hand-opened cells banked toward the next sweep. */
  get banked(): number {
    return this.charge;
  }

  /** Cells the charge mode wants banked per sweep, or 0 when it is not in play. */
  get needed(): number {
    return this.settings.sweep === 'charge' ? this.settings.sweepChargeClicks : 0;
  }

  /** Sweeps left of a board's budget; Infinity where the dial sets none. */
  get left(): number {
    if (this.settings.sweep !== 'budget') return Infinity;
    return Math.max(0, this.settings.sweepBudget - this.used);
  }

  /** Whether the dial lets a sweep go right now. */
  get open(): boolean {
    switch (this.settings.sweep) {
      case 'off':
        return false;
      case 'charge':
        return this.charge >= this.needed;
      case 'budget':
        return this.used < this.settings.sweepBudget;
      default:
        return true;
    }
  }

  /**
   * A sweep that did something is paid for. Only then: a sweep that found nothing is a misread,
   * not a use, and charging for it would be charging for a disabled button.
   */
  spend(): void {
    if (this.settings.sweep === 'charge') this.charge -= this.needed;
    if (this.settings.sweep === 'budget') this.used++;
  }
}
