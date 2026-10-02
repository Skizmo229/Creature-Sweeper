/**
 * Exploration income: the mana a board with spells pays for the empty ground the player opens, a
 * click, its cascade or a sweep, one mana for every so many cells (`MANA_PER_EMPTY_CELLS`, through
 * the mana-regen dial). The dealt opening is not the player's work and the cells a spell opens are
 * already paid for, so neither accrues; a creature's cell pays through the kill instead. `Game`
 * hands over the empty cells each open uncovered and adds the mana that comes back.
 */

import { type GameplaySettings, cellsPerMana } from './settings.js';

/** One board's exploration income: the empty cells counted toward the next mana. */
export class ExploreIncome {
  /** Empty cells uncovered since the last mana paid out. */
  private progress = 0;

  constructor(private readonly settings: GameplaySettings) {}

  /** Count `empties` more cells of empty ground the player opened; return the mana they make. */
  bank(empties: number): number {
    this.progress += empties;
    // Infinity when the mana-regen dial is at zero, which switches the trickle off rather than
    // making it very slow.
    const per = cellsPerMana(this.settings);
    let mana = 0;
    while (this.progress >= per) {
      this.progress -= per;
      mana++;
    }
    return mana;
  }
}
