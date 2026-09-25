/**
 * The rules engine.
 *
 * Pure state plus transitions — no rendering, no timers, no storage. Every
 * action returns the events it caused, so a renderer can animate them and a
 * test can assert on them. Elapsed time is entirely the caller's business.
 */

import type { BoardConfig, Cell, GameEvent, GameStatus, SweepOptions } from './types.js';
import { Progression } from './combat.js';
import { SPELLS, type SpellId } from './spells.js';
import { DEFAULT_GAMEPLAY, type GameplaySettings, cellsPerMana, effectiveHp } from './settings.js';
import { hasNote, hasNotes, lowestNote, noteBit, toggleNote as toggleNoteBit } from './notes.js';
import { placementRule } from './placement/registry.js';
import { mulberry32 } from './rng.js';
import { SPELL_EFFECTS } from './cast.js';
import { computeSealed, withinReach } from './reach.js';
import { safeCells as provenSafe } from './sweep.js';
import { type Grid, inBounds, neighbours } from './grid.js';
import { findBestOpening, findFallbackOpening } from './opening.js';
import { generateGrid } from './generate.js';
import { fight, revealAllCreatures } from './fight.js';

export interface GameOptions {
  /**
   * HP to enter the board with, when that is not a full pool. Defaults to the
   * board's own `hp`. See `run.ts` — nothing but a Full Run should set it.
   */
  startHp?: number;
  /**
   * The player's gameplay dials. Defaults to the tuned game, so every test,
   * simulation and headless caller that does not pass this is playing exactly
   * the board `ladders.py` tuned.
   */
  settings?: GameplaySettings;
}

export class Game {
  readonly config: BoardConfig;
  readonly seed: number;
  readonly grid: Grid;
  readonly progression: Progression;
  /**
   * Whether the crawl rule currently has the player walled in, or null when
   * it has not been worked out since the last thing that could change it.
   * Always read through `sealedIn()`.
   */
  private sealed: boolean | null = null;
  private sealedLevel = -1;
  /** The dials this board is being played with. Never changes mid-board. */
  readonly settings: GameplaySettings;

  /** After the HP dial. The board's own `config.hp` is left alone. */
  readonly maxHp: number;
  hp: number;
  status: GameStatus = 'playing';

  /** Undefeated creatures per tier; index 0 is tier 1. */
  readonly remaining: number[];
  /** Marks placed per tier, used for the search-mode counters. */
  readonly marksPlaced: number[];

  /** Spell currency. Earned at +tier per kill; see spells.ts for why linear. */
  mana: number;
  /** Levels the next fight borrows, from a standing Exercise. */
  exerciseCharge = 0;
  /**
   * What WORKOUT's Exercise costs above its base price. Each cast adds the
   * rule's `step`, each level gained takes `relief` off, and it never goes
   * below zero. Always zero on a board without a workout rule.
   */
  exerciseSurcharge = 0;
  /** Empty cells uncovered since the last mana the trickle paid out. */
  private exploreProgress = 0;

  /**
   * Cells opened BY HAND since the last sweep, for the charge gate.
   *
   * Only hand-opened cells count, which is what stops the meter feeding
   * itself: a sweep that opened forty cells would otherwise bank four more
   * sweeps and the gate would be no gate at all. A cascade is one click, so it
   * is one charge, for the same reason.
   */
  private sweepCharge = 0;
  /** True while `sweep` is driving `open`, so those opens do not charge it. */
  private sweeping = false;

  private openEmptyCount = 0;
  private readonly totalEmpty: number;

  private constructor(
    config: BoardConfig,
    seed: number,
    grid: Grid,
    startHp: number,
    settings: GameplaySettings,
  ) {
    this.config = config;
    this.seed = seed;
    this.grid = grid;
    this.settings = settings;
    this.maxHp = effectiveHp(config.hp, settings);
    this.hp = startHp;
    this.progression = new Progression(config.startLevel, config.exp);
    this.remaining = [...config.quantity];
    this.mana = config.startMana;
    this.marksPlaced = new Array<number>(config.tiers).fill(0);
    // A board may arrive with marks already on it — the Sudoku placement pins
    // its givens that way — so the counters are read off the grid rather than
    // assumed empty.
    for (const row of grid) {
      for (const cell of row) {
        if (cell.mark > 0)
          this.marksPlaced[cell.mark - 1] = (this.marksPlaced[cell.mark - 1] ?? 0) + 1;
      }
    }
    // Only ground that exists counts toward a search-mode clear.
    this.totalEmpty =
      grid.flat().filter((c) => c.present).length - config.quantity.reduce((a, b) => a + b, 0);
  }

  /**
   * Build a board and apply its opening rule. Same inputs, same board.
   *
   * `startHp` exists for Full Run, which carries a damaged pool from one board
   * into the next. It never changes `maxHp` — the board is still the board —
   * and it cannot exceed it or start a board already dead.
   */
  static create(config: BoardConfig, seed: number, options: GameOptions = {}): Game {
    const settings = options.settings ?? DEFAULT_GAMEPLAY;
    // The ceiling is the dialled one, not the schedule's: entering at the
    // board's own hp with the dial at 0.5 would start you at double the pool.
    const maxHp = effectiveHp(config.hp, settings);
    const startHp = options.startHp ?? maxHp;
    if (!Number.isInteger(startHp) || startHp < 1 || startHp > maxHp) {
      throw new Error(
        `startHp is ${startHp}; it must be a whole number in 1..${maxHp} ` +
          `(a board entered at 0 HP is a run that already ended)`,
      );
    }
    const rng = mulberry32(seed);
    const grid = generateGrid(config, rng);
    const game = new Game(config, seed, grid, startHp, settings);
    if (config.opening === 'auto') game.applyOpening();
    else if (config.opening === 'empties') game.openEveryEmpty();
    return game;
  }

  // ---------------------------------------------------------------- queries

  get level(): number {
    return this.progression.level;
  }

  get ex(): number {
    return this.progression.ex;
  }

  /** Adjacency for this board, square or hex. The one place shape matters. */
  neighboursOf(cell: Cell): Cell[] {
    return neighbours(this.grid, cell.x, cell.y, this.config.topology, this.config.wrap);
  }

  cellAt(x: number, y: number): Cell | null {
    if (!inBounds(this.config, x, y)) return null;
    const cell = this.grid[y]![x]!;
    // A hole is not a cell you can act on.
    return cell.present ? cell : null;
  }

  /** Creatures of this tier still to be dealt with, as the HUD shows it. */
  counterFor(tier: number): number {
    const left = this.remaining[tier - 1] ?? 0;
    // In search modes creatures cannot be killed, so marks stand in for
    // progress the way flags do in Minesweeper.
    return this.config.search ? left - (this.marksPlaced[tier - 1] ?? 0) : left;
  }

  creaturesLeft(): number {
    return this.remaining.reduce((a, b) => a + b, 0);
  }

  /** Cells that Sweep would open. The proof is in `sweep.ts`. */
  safeCells(options: SweepOptions = {}): Cell[] {
    return provenSafe(this, options);
  }

  // ---------------------------------------------------------------- actions

  /** Open a cell: reveal it, cascade if it is blank, fight what is there. */
  open(x: number, y: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    const cell = this.cellAt(x, y);
    if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];

    // A defeated creature is open ground like any other. Its own number is
    // shown while the cursor is over it, which is the renderer's business and
    // changes nothing here (decision 0012).
    if (cell.open) return [{ type: 'blocked', reason: 'already-open' }];

    // The crawl rule, on boards that have one: you may only open ground
    // within `reach` steps of ground you have already uncovered. Checked
    // before the mark guard because it is a fact about the board rather than
    // about anything the player has written on it.
    if (!this.inReach(cell)) return [{ type: 'blocked', reason: 'out-of-reach' }];

    // The mark guard: a cell you flagged above your level cannot be clicked.
    // A standing Exercise counts, because reaching one tier past your level is
    // the whole point of it — the guard would otherwise refuse the exact fight
    // the spell was bought for.
    if (cell.mark > this.level + this.exerciseCharge) {
      return [{ type: 'blocked', reason: 'mark-guard' }];
    }

    // The same guard read off a set: refuse only when EVERY candidate is out
    // of reach, because a set containing anything survivable is a cell the
    // player may legitimately want to gamble on. Exercise counts here too.
    if (hasNotes(cell.notes) && lowestNote(cell.notes) > this.level + this.exerciseCharge) {
      return [{ type: 'blocked', reason: 'note-guard' }];
    }

    if (!this.sweeping) this.sweepCharge++;
    const events: GameEvent[] = [];
    const revealed = this.reveal(cell);
    events.push({ type: 'revealed', cells: revealed });

    // Exploration income. Only ground YOU uncovered counts: the dealt opening
    // is not your work, and Beacon's cells are already paid for, so neither
    // accrues. Creature cells are excluded too — those pay via the kill.
    if (this.config.spells.length) {
      for (const r of revealed) {
        if (this.grid[r.y]![r.x]!.tier === 0) this.exploreProgress++;
      }
      // Infinity when the mana-regen dial is at zero, which switches the
      // trickle off rather than making it very slow.
      const per = cellsPerMana(this.settings);
      while (this.exploreProgress >= per) {
        this.exploreProgress -= per;
        this.mana++;
      }
    }

    if (cell.tier > 0 && cell.alive) events.push(...fight(this, cell));
    if (this.status === 'playing') events.push(...this.checkSearchWin());
    return events;
  }

  /**
   * Is this cell close enough to ground you have already uncovered to act on? The crawl rule,
   * in `reach.ts`. A board with no reach, an open cell, or a sealed-in player is always in reach.
   */
  inReach(cell: Cell): boolean {
    if (this.config.reach <= 0 || cell.open) return true;
    if (this.sealedIn()) return true;
    return withinReach(this, cell);
  }

  /**
   * Has the board sealed the player in? If so the crawl rule lifts: THE DUNGEON NEVER FORCES A
   * FIGHT YOU CANNOT WIN FOR FREE, which is what keeps the zero-damage guarantee true on a crawl
   * board (decision 0004). Cached, and thrown away whenever a cell opens or the level moves, the
   * only two things that can change it.
   */
  sealedIn(): boolean {
    if (this.config.reach <= 0) return false;
    if (this.sealed === null || this.sealedLevel !== this.level) {
      this.sealed = computeSealed(this);
      this.sealedLevel = this.level;
    }
    return this.sealed;
  }

  /**
   * Annotate a covered cell. Re-marking with the same value clears it, as does
   * marking 0. A mark above your level also locks the cell against clicks.
   */
  setMark(x: number, y: number, mark: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    const cell = this.cellAt(x, y);
    if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];
    if (cell.open) return [{ type: 'blocked', reason: 'already-open' }];
    // A given is the board talking, not the player. Re-marking toggles a mark
    // off, so without this the player could rub out a clue they cannot get
    // back and turn a guess-free board into an unfair one.
    if (cell.given) return [{ type: 'blocked', reason: 'given' }];

    const from = cell.mark;
    const to = mark === 0 || cell.mark === mark ? 0 : mark;
    if (from === to) return [];

    this.applyMark(cell, to);
    return [{ type: 'marked', x, y, from, to }];
  }

  /**
   * Add or remove one candidate tier from a covered cell's pencil marks.
   * Tier 0 is a candidate like any other — "this might just be empty".
   *
   * Notes and a mark are mutually exclusive: pencilling on a marked cell
   * erases the mark, the way you rub out a written digit before pencilling
   * alternatives back in. Clearing the last candidate leaves the cell blank
   * rather than impossible.
   */
  toggleNote(x: number, y: number, tier: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    const cell = this.cellAt(x, y);
    if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];
    if (cell.open) return [{ type: 'blocked', reason: 'already-open' }];
    if (cell.given) return [{ type: 'blocked', reason: 'given' }];
    if (tier < 0 || tier > this.config.tiers) {
      return [{ type: 'blocked', reason: 'out-of-bounds' }];
    }
    // Before the mark is rubbed out, so a refused candidate changes nothing.
    if (!this.canNote(cell, tier)) return [{ type: 'blocked', reason: 'ruled-out' }];

    const events: GameEvent[] = [];
    if (cell.mark > 0) {
      const wasMark = cell.mark;
      this.applyMark(cell, 0);
      events.push({ type: 'marked', x, y, from: wasMark, to: 0 });
    }

    const from = cell.notes;
    const to = toggleNoteBit(from, tier);
    if (from === to) return events;
    cell.notes = to;
    events.push({ type: 'noted', x, y, from, to });
    return events;
  }

  /**
   * The tiers this covered cell could still be holding by the placement rule
   * alone, as a note mask: what the pencil may offer here. The rule's own
   * `candidates`, read off what is on screen, and tier 0 refused where the
   * opening uncovered every empty cell.
   *
   * Deliberately not anything that takes deduction, or it becomes the
   * auto-candidates convenience that turns Sweep back into a solve button.
   * Sound one way only: the tier a cell really holds is never taken out, which
   * the tests check on every covered cell of real boards played part-way
   * (decision 0010).
   */
  noteCandidates(cell: Cell): number {
    const rule = placementRule(this.config.placement);
    let mask = (1 << (this.config.tiers + 1)) - 1;
    if (!rule.coveredCanBeEmpty) mask &= ~noteBit(0);
    const allowed = rule.candidates(cell, this);
    if (allowed !== null) mask &= allowed;
    return mask;
  }

  /**
   * Would `toggleNote` accept this tier on this cell? Taking a candidate OFF is
   * always allowed — a note pencilled before the board ruled it out has to stay
   * erasable — so only adding one is held to `noteCandidates`.
   */
  canNote(cell: Cell, tier: number): boolean {
    return hasNote(cell.notes, tier) || hasNote(this.noteCandidates(cell), tier);
  }

  /** Rub out a cell's pencil marks entirely. */
  clearNotes(x: number, y: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    const cell = this.cellAt(x, y);
    if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];
    const from = cell.notes;
    if (from === 0) return [];
    cell.notes = 0;
    return [{ type: 'noted', x, y, from, to: 0 }];
  }

  // ------------------------------------------------------------ sweep gating
  //
  // The dial lives here rather than in the UI because the charge is earned by
  // opening cells, which is a thing only the engine sees.

  /** Hand-opened cells banked toward the next sweep. */
  get charge(): number {
    return this.sweepCharge;
  }

  /** Cells the charge mode wants banked, or 0 when it is not in play. */
  get chargeNeeded(): number {
    if (!this.hasSweep) return 0;
    return this.settings.sweep === 'charge' ? this.settings.sweepChargeClicks : 0;
  }

  /**
   * Whether this ladder offers Sweep at all. EASY does not: it is where the
   * sum rule is learned, and a button that reads the numbers for you takes
   * away the one thing the ladder is for. A ladder fact rather than a dial, so
   * it touches no record — the dial compares players, this compares nothing.
   */
  get hasSweep(): boolean {
    return this.config.sweep !== false;
  }

  /** Whether Sweep can be used at all right now, under the current dial. */
  get sweepAvailable(): boolean {
    if (!this.hasSweep) return false;
    if (this.settings.sweep === 'off') return false;
    if (this.settings.sweep === 'charge') return this.sweepCharge >= this.chargeNeeded;
    return true;
  }

  /**
   * Open everything currently deducible as free, repeatedly, until nothing is
   * left to resolve. This is the game's chording. With marks off it can never
   * cost HP; with marks on it costs HP only when a mark was wrong.
   *
   * Refused outright when the dial says so, so there is exactly one place the
   * gate is enforced — a UI that forgot to disable the button still cannot
   * sweep past it, and neither can the keyboard.
   */
  sweep(options: SweepOptions = {}): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    if (!this.sweepAvailable) return [{ type: 'blocked', reason: 'no-charge' }];
    const events: GameEvent[] = [];
    // Opens driven from here must not charge the meter, or a sweep would bank
    // the next one and the gate would be decorative.
    this.sweeping = true;
    try {
      for (let guard = 0; guard < this.config.width * this.config.height; guard++) {
        const targets = this.safeCells(options);
        if (targets.length === 0) break;
        for (const cell of targets) {
          if (cell.open || this.status !== 'playing') continue;
          events.push(...this.open(cell.x, cell.y));
        }
      }
    } finally {
      this.sweeping = false;
    }
    // Spent only if it did something. A sweep that found nothing is a misread,
    // not a use, and charging for it would be charging for a disabled button.
    if (events.length > 0 && this.settings.sweep === 'charge') {
      this.sweepCharge -= this.chargeNeeded;
    }
    return events;
  }

  /**
   * End the board as a loss from outside the rules.
   *
   * Time Attack is the only caller: the engine owns no clock, so "the
   * countdown reached zero" is a fact only the UI can know. It is a method
   * rather than a status the UI writes directly so that losing always goes
   * through the same door — the creatures are revealed and a `lost` event is
   * emitted exactly as they are when HP runs out.
   */
  forfeit(): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    this.status = 'lost';
    revealAllCreatures(this.grid);
    return [{ type: 'lost' }];
  }

  // ----------------------------------------------------------------- magic

  /** Spells this board offers, whether or not they are affordable right now. */
  get spells(): readonly SpellId[] {
    return this.config.spells;
  }

  canCast(id: SpellId): boolean {
    if (this.status !== 'playing') return false;
    if (!this.config.spells.includes(id)) return false;
    return this.mana >= this.spellCost(id);
  }

  /**
   * What casting this spell costs right now. The global table, except for
   * Exercise on a board with a workout rule, where the price moves with how
   * often you have cast it and how far you have levelled since.
   */
  spellCost(id: SpellId): number {
    const workout = this.config.workout;
    if (id === 'exercise' && workout) return workout.base + this.exerciseSurcharge;
    return SPELLS[id].cost;
  }

  /**
   * Cast a spell. The checks every spell shares happen here, the effect in `cast.ts`, and the
   * bookkeeping after: paying, WORKOUT's surcharge (which rises only once the cast has gone
   * through, so a refused cast costs nothing now and nothing later), and the event.
   */
  cast(id: SpellId, x?: number, y?: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    if (!this.config.spells.includes(id)) return [{ type: 'blocked', reason: 'no-such-spell' }];
    const cost = this.spellCost(id);
    if (this.mana < cost) return [{ type: 'blocked', reason: 'no-mana' }];

    let target: Cell | null = null;
    if (SPELLS[id].targeted) {
      if (x === undefined || y === undefined) return [{ type: 'blocked', reason: 'out-of-bounds' }];
      target = this.cellAt(x, y);
      if (!target) return [{ type: 'blocked', reason: 'out-of-bounds' }];
      // A targeted spell is a click on the board, so the crawl rule applies to it too. Exempting
      // Reveal would let distant empty ground be OPENED, re-rooting the frontier across the map.
      if (!this.inReach(target)) return [{ type: 'blocked', reason: 'out-of-reach' }];
    }

    const outcome = SPELL_EFFECTS[id](this, target);
    if ('blocked' in outcome) return [{ type: 'blocked', reason: outcome.blocked }];
    const events = [...outcome.events];

    this.mana -= cost;
    if (id === 'exercise' && this.config.workout) {
      this.exerciseSurcharge += this.config.workout.step;
    }
    events.push(
      target
        ? { type: 'spell', id, x: target.x, y: target.y, detail: outcome.detail }
        : { type: 'spell', id, detail: outcome.detail },
    );
    if (this.status === 'playing') events.push(...this.checkSearchWin());
    return events;
  }

  /** Write a mark, keeping the per-tier counters honest. Engine-internal, for `cast.ts`. */
  applyMark(cell: Cell, mark: number): void {
    if (cell.mark > 0) this.marksPlaced[cell.mark - 1] = (this.marksPlaced[cell.mark - 1] ?? 0) - 1;
    if (mark > 0) this.marksPlaced[mark - 1] = (this.marksPlaced[mark - 1] ?? 0) + 1;
    cell.mark = mark;
    // Writing the digit in rubs out the pencil. Keeping both would let a cell
    // claim one tier and admit another, and every rule that reads them would
    // have to decide which claim wins.
    if (mark > 0) cell.notes = 0;
  }

  // ---------------------------------------------------------------- internals

  /** Reveal the board's starting region before the player touches anything. */
  private applyOpening(): void {
    const best = findBestOpening(this.grid, false, this.config.topology, this.config.wrap);
    if (best) {
      for (const cell of best.cells) this.markOpen(cell);
      return;
    }
    const fallback = findFallbackOpening(this.grid, this.config.topology, this.config.wrap);
    if (fallback) this.reveal(fallback);
  }

  /**
   * Open every empty cell on the board — the Sudoku opening.
   *
   * There are exactly nine of them, one per row, column and box, because tier
   * 0 is one of the nine digits. They pay no EXP and no exploration mana: like
   * the dealt opening everywhere else, they are not the player's work.
   */
  private openEveryEmpty(): void {
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.present && cell.tier === 0) this.markOpen(cell);
      }
    }
  }

  /** Open one cell without cascading. Engine-internal, for `cast.ts`. */
  markOpen(cell: Cell): boolean {
    if (cell.open) return false;
    cell.open = true;
    // Opening ground is one of the two things that can unseal a crawl board.
    this.sealed = null;
    if (cell.tier === 0) this.openEmptyCount++;
    return true;
  }

  /**
   * Uncover a cell, cascading through blanks. A cell with number 0 has no
   * creature neighbours by definition, so a cascade never uncovers one.
   * Iterative rather than recursive: the biggest boards are 2048 cells.
   */
  reveal(start: Cell): Array<{ x: number; y: number }> {
    const revealed: Array<{ x: number; y: number }> = [];
    const stack: Cell[] = [start];

    while (stack.length) {
      const cell = stack.pop()!;
      if (!this.markOpen(cell)) continue;
      revealed.push({ x: cell.x, y: cell.y });
      if (cell.num === 0) {
        for (const n of this.neighboursOf(cell)) {
          if (!n.open) stack.push(n);
        }
      }
    }
    return revealed;
  }

  private checkSearchWin(): GameEvent[] {
    if (!this.config.search || this.openEmptyCount < this.totalEmpty) return [];
    this.status = 'won';
    return [{ type: 'won' }];
  }
}
