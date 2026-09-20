/**
 * Full Run — all ten boards of a game type, back to back, on one HP pool.
 *
 * Unlocked by clearing board 10 of that type, so a run is never the way you
 * first meet a board. It is the same ladder played as one continuous thing.
 *
 * THE THREE RULES, and why each is the only version that works:
 *
 * **Level and EXP reset on every board.** This is not a difficulty choice, it
 * is forced. The level thresholds are `C_k` of a *specific* board — the total
 * EXP available from every creature of tier <= k on that board — so a level
 * carried forward would arrive at board 2 near its ceiling and every board
 * after the first would be free. Only HP may cross a board boundary.
 *
 * **Mana does not carry.** Each board starts at the type's `startMana`, the
 * same pool a single board gets. A hoarded run-long pool would make the last
 * boards the ones where spells are free, which is backwards; and it would
 * reward not casting, in a game where the measured problem with spells is
 * that nobody is ever forced to spend.
 *
 * **One max HP for the whole run**, taken from board 1 (`run_hp`), and the
 * per-board HP schedule is ignored. Board 1 is the most generous entry in
 * every schedule, so the ceiling never drops below what a later board was
 * tuned against — the run is hard because damage persists, not because the
 * ceiling moved under you. After each cleared board you heal half that max,
 * rounded down, capped at the max.
 *
 * WHAT THIS DOES NOT BREAK. The zero-damage guarantee is a statement about
 * what is *possible* on one board: at level k every tier <= k is a free kill
 * and the gate to k+1 is at most `C_k`. Every board of a run still starts at
 * the type's start level with its own thresholds, so every board is still
 * clearable without losing a point — and therefore so is a whole run. HP stays
 * a guess budget; the run simply makes it one budget instead of ten.
 *
 * Headless like the rest of the engine: no DOM, no storage, no timers. The UI
 * drives it, and so does `src/sim/run.ts`.
 */

import { Game } from './game.js';
import { boardConfig, findType, type BoardOptions, type Ladders } from './config.js';
import {
  DEFAULT_GAMEPLAY,
  type GameplaySettings,
  effectiveHp,
  healPerBoard,
} from './settings.js';

export type FullRunStatus = 'playing' | 'won' | 'lost';

/** What one cleared board cost and gave back. */
export interface FullRunLeg {
  board: number;
  /** HP at the moment the board was cleared, before the heal. */
  hpAtClear: number;
  /** HP actually restored — less than `healPerBoard` when near the cap. */
  healed: number;
  /** HP carried into the next board. Equals `hpAtClear` on the last leg. */
  hpAfter: number;
}

export interface FullRunOptions extends Pick<BoardOptions, 'opening'> {
  /**
   * The player's gameplay dials, applied to every board of the run.
   *
   * This is where `hpRegenRatio` is finally spent: it is the fraction of the
   * pool the heal restores, and at its default of 0.5 it is exactly the rule
   * the mode shipped with. A Full Run is the only place in the game that heals
   * at all, which is why the dial lives here and nowhere else.
   */
  settings?: GameplaySettings;
}

export class FullRun {
  readonly ladders: Ladders;
  readonly typeId: string;
  /** The run's seed. Every board's seed is derived from it, so a whole run
   *  replays from one number the way a single board does. */
  readonly seed: number;
  readonly boardCount: number;
  /** The pool for all ten boards. Fixed for the run's whole life. */
  readonly maxHp: number;
  /** Restored after each cleared board: half the max, rounded down. */
  readonly healPerBoard: number;

  /** 1-based index of the board being played. */
  boardIndex: number;
  /** Boards cleared so far, in order. */
  readonly legs: FullRunLeg[] = [];

  game: Game;

  private readonly options: FullRunOptions;
  private readonly settings: GameplaySettings;

  private constructor(
    ladders: Ladders, typeId: string, seed: number, options: FullRunOptions,
  ) {
    const type = findType(ladders, typeId);
    this.ladders = ladders;
    this.typeId = typeId;
    this.seed = seed >>> 0;
    this.options = options;
    this.settings = options.settings ?? DEFAULT_GAMEPLAY;
    this.boardCount = type.boards.length;
    this.maxHp = effectiveHp(type.run_hp, this.settings);
    // Rounded DOWN on purpose: "only half" is the point of the mode, and a
    // ceiling would fully restore an odd pool of 1 (BLIND), turning the run
    // into ten unrelated boards. The consequence is real and deliberate —
    // on a 1 HP ladder the heal is 0 and the run is a single-mistake run.
    // The fraction is the dial's; the rounding is the mode's and stays.
    this.healPerBoard = healPerBoard(this.maxHp, this.settings);
    this.boardIndex = 1;
    this.game = this.buildBoard(1, this.maxHp);
  }

  /** Begin a run at board 1 with a full pool. */
  static start(
    ladders: Ladders, typeId: string, seed: number, options: FullRunOptions = {},
  ): FullRun {
    return new FullRun(ladders, typeId, seed, options);
  }

  /**
   * The seed for a board of this run.
   *
   * Derived rather than stored so the whole run is a pure function of one
   * number, exactly like a board is. The odd constant is the golden-ratio
   * mix used to keep consecutive board indices from producing related seeds.
   */
  boardSeed(board: number): number {
    return (this.seed + Math.imul(board, 0x9e3779b1)) >>> 0;
  }

  /** HP right now. During a board this is the live game's; between boards it
   *  is what will be carried in. */
  get hp(): number {
    return this.game.hp;
  }

  /** True when the current board is cleared and the run is waiting to advance. */
  get boardWon(): boolean {
    return this.game.status === 'won';
  }

  get isLastBoard(): boolean {
    return this.boardIndex >= this.boardCount;
  }

  /**
   * The run's own status.
   *
   * A won board is not a won run unless it was the last one — in between, the
   * run is still playing and waiting for `advance`.
   */
  get status(): FullRunStatus {
    if (this.game.status === 'lost') return 'lost';
    if (this.game.status === 'won' && this.isLastBoard) return 'won';
    return 'playing';
  }

  /** Boards cleared, whether or not the run is over. */
  get boardsCleared(): number {
    return this.legs.length + (this.boardWon && this.isLastBoard ? 1 : 0);
  }

  /** Total HP lost across every board so far, heals not counted. */
  get damageTaken(): number {
    const healed = this.legs.reduce((a, leg) => a + leg.healed, 0);
    return this.maxHp - this.hp - healed;
  }

  /**
   * Take the heal and move to the next board.
   *
   * Only legal on a cleared board that is not the last one. The next board is
   * a brand new `Game`, which is what resets level, EXP and mana — none of
   * those may cross a board boundary, and building a fresh game is what makes
   * that structural rather than something to remember to do.
   */
  advance(): FullRunLeg {
    if (this.game.status !== 'won') {
      throw new Error(
        `cannot advance a run from a board that is "${this.game.status}"`,
      );
    }
    if (this.isLastBoard) {
      throw new Error(`board ${this.boardIndex} is the last of ${this.typeId}; the run is won`);
    }

    const hpAtClear = this.game.hp;
    const healed = Math.min(this.healPerBoard, this.maxHp - hpAtClear);
    const hpAfter = hpAtClear + healed;
    const leg: FullRunLeg = { board: this.boardIndex, hpAtClear, healed, hpAfter };
    this.legs.push(leg);

    this.boardIndex += 1;
    this.game = this.buildBoard(this.boardIndex, hpAfter);
    return leg;
  }

  private buildBoard(board: number, startHp: number): Game {
    // `hp: this.maxHp` is what replaces the per-board schedule: every board of
    // a run shares one ceiling, so a heal means the same thing on board 9 as
    // it did on board 1.
    // The UNSCALED pool goes into the config, because `Game` applies the HP
    // dial itself — passing the scaled one would scale it twice.
    const type = findType(this.ladders, this.typeId);
    const { settings: _ignored, ...boardOptions } = this.options;
    const cfg = boardConfig(this.ladders, this.typeId, board, {
      ...boardOptions,
      hp: type.run_hp,
    });
    return Game.create(cfg, this.boardSeed(board), { startHp, settings: this.settings });
  }
}

/** Whether a type can be run at all — a run needs a ladder to run down. */
export function hasFullRun(ladders: Ladders, typeId: string): boolean {
  return findType(ladders, typeId).boards.length > 1;
}
