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
import {
  DEFAULT_GAMEPLAY,
  type GameplaySettings,
  cellsPerMana,
  effectiveHp,
  spellPriceFor,
  startManaFor,
} from './settings.js';
import { hasNote, hasNotes, lowestNote, noteBit, toggleNote as toggleNoteBit } from './notes.js';
import { placementRule } from './placement/registry.js';
import { SPELL_EFFECTS } from './cast.js';
import { computeSealed, withinReach } from './reach.js';
import { safeCells as provenSafe } from './sweep.js';
import { SweepGate } from './sweepgate.js';
import { type Grid, inBounds, neighbours } from './grid.js';
import { dealOpening } from './opening.js';
import { type LayoutOptions, readLayout, showDrawing } from './layout.js';
import { Patrol } from './patrol.js';
import { dealGrid } from './generate.js';
import { fight, revealAllCells, revealAllCreatures } from './fight.js';

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

/** HP to enter a board with: `options.startHp`, checked, or the full pool after the HP dial. */
function enteringHp(config: BoardConfig, settings: GameplaySettings, options: GameOptions): number {
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
  return startHp;
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

  /** How the dial gates Sweep, and what has been banked toward one (`sweepgate.ts`). */
  private readonly gate: SweepGate;
  /** True while `sweep` is driving `open`, so those opens do not charge it. */
  private sweeping = false;

  private openEmptyCount = 0;
  private readonly totalEmpty: number;
  /** The walking creatures and the routes drawn for them, on a PATROL board; null elsewhere. */
  private readonly patrol: Patrol | null;

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
    this.gate = new SweepGate(settings);
    this.maxHp = effectiveHp(config.hp, settings);
    this.hp = startHp;
    this.progression = new Progression(config.startLevel, config.exp);
    this.remaining = [...config.quantity];
    this.mana = startManaFor(config.startMana, settings);
    this.marksPlaced = new Array<number>(config.tiers).fill(0);
    // Read off the board as dealt, before the opening, while every creature is on its corner.
    this.patrol = placementRule(config.placement).patrols ? new Patrol(grid) : null;
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
   * Deal a board from a seed, or from the nearest seed after it that the placement rule accepts
   * (`dealGrid`, decision 0081), and apply its opening rule. Same inputs, same board: it keeps the
   * seed it was asked for, which it is still a function of, so a paused board or a replay deals
   * the same board. `startHp` is for a Full Run, which carries a damaged pool into the next board;
   * it never changes `maxHp`, and it cannot exceed it or start a board already dead.
   */
  static create(config: BoardConfig, seed: number, options: GameOptions = {}): Game {
    const settings = options.settings ?? DEFAULT_GAMEPLAY;
    const grid = dealGrid(config, seed);
    const game = new Game(config, seed, grid, enteringHp(config, settings, options), settings);
    dealOpening(game);
    return game;
  }

  /**
   * Build a board from a drawing in the catalogue's notation: `truth` is what is there and
   * `shown` what the player sees, one string per row (`readLayout` in `layout.ts` says the
   * notation and what it refuses). The config is derived from the drawing so that the four facts
   * hold by construction, and nothing is dealt: the opening is the drawing. For the school's
   * lessons, the field guide's diagrams and the tests (docs/teaching-plan.md, section 5.2).
   */
  static fromLayout(
    truth: readonly string[],
    shown: readonly string[],
    options: LayoutOptions = {},
  ): Game {
    const drawing = readLayout(truth, shown, options);
    const settings = options.settings ?? DEFAULT_GAMEPLAY;
    const hp = enteringHp(drawing.config, settings, options);
    const game = new Game(drawing.config, 0, drawing.grid, hp, settings);
    showDrawing(game, drawing);
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
    return provenSafe(this, this.marksAreClaims ? options : { ...options, useMarks: false });
  }

  /** Whether the creatures walk (PATROL): every action moves each a step along its route. */
  get patrols(): boolean {
    return this.patrol !== null;
  }

  /** Actions taken so far on a board whose creatures walk; 0 on every other board. */
  get moves(): number {
    return this.patrol?.moves ?? 0;
  }

  /**
   * Whether a mark claims what stands on its cell. Not on PATROL, where a mark is a creature's
   * route, so Sweep reads no marks there however it is asked.
   */
  get marksAreClaims(): boolean {
    return this.patrol === null;
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

    if (!this.sweeping) this.gate.bank();
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
    // A sweep is one action however many cells it opens, so it moves the creatures once, itself.
    if (!this.sweeping) events.push(...this.moveOn());
    return events;
  }

  /**
   * PATROL's Wait: let the creatures take a step and do nothing else. An action like any other, so
   * it moves them; it opens nothing, so it banks no Sweep charge.
   */
  wait(): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    if (!this.patrol) return [{ type: 'blocked', reason: 'no-effect' }];
    return this.moveOn();
  }

  /** After an action, on a board whose creatures walk and are still in play: a step each. */
  private moveOn(): GameEvent[] {
    return this.patrol && this.status === 'playing' ? this.patrol.step(this) : [];
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
    // A mark names one of the board's tiers, or none. A paused game's stored moves are played
    // through here, and stored data is never trusted.
    if (!Number.isInteger(mark) || mark < 0 || mark > this.config.tiers) {
      return [{ type: 'blocked', reason: 'out-of-bounds' }];
    }
    // On PATROL a mark is a route drawn from this cell as its corner, which may be uncovered.
    if (this.patrol) return this.patrol.mark(this, cell, mark);
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
  // The gate itself is `sweepgate.ts`; the ladder's own say, `hasSweep`, is here.

  /** Hand-opened cells banked toward the next sweep. */
  get charge(): number {
    return this.gate.banked;
  }

  /** Cells the charge mode wants banked, or 0 when it is not in play. */
  get chargeNeeded(): number {
    return this.hasSweep ? this.gate.needed : 0;
  }

  /** Sweeps left of the board's budget, or Infinity where the dial sets none. */
  get sweepsLeft(): number {
    return this.gate.left;
  }

  /**
   * Whether this ladder offers Sweep at all. Not on EASY, where the sum rule is learned and a
   * button that reads the numbers for you would take away the one thing the ladder is for, nor on
   * PATROL (decision 0063). A ladder fact rather than a dial, so it touches no record — the dial
   * compares players, this compares nothing.
   */
  get hasSweep(): boolean {
    return this.config.sweep !== false;
  }

  /** Whether Sweep can be used at all right now, under the current dial. */
  get sweepAvailable(): boolean {
    return this.hasSweep && this.gate.open;
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
    for (let guard = 0; guard < this.config.width * this.config.height; guard++) {
      const targets = this.safeCells(options);
      if (targets.length === 0) break;
      events.push(...this.openProven(targets));
    }
    return this.afterSweep(events);
  }

  /**
   * A chord (decision 0071): one open cell's ring swept, its proven neighbours and nothing beyond,
   * at a sweep's price, refused wherever a sweep is and on a covered cell.
   */
  sweepAt(x: number, y: number, options: SweepOptions = {}): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    const cell = this.cellAt(x, y);
    if (!cell || !cell.open) return [{ type: 'blocked', reason: 'no-effect' }];
    if (!this.sweepAvailable) return [{ type: 'blocked', reason: 'no-charge' }];
    const ring = new Set(this.neighboursOf(cell));
    return this.afterSweep(this.openProven(this.safeCells(options).filter((c) => ring.has(c))));
  }

  /** Open proven cells as a sweep does: not charging the meter, or a sweep would bank the next. */
  private openProven(targets: readonly Cell[]): GameEvent[] {
    const events: GameEvent[] = [];
    this.sweeping = true;
    try {
      for (const cell of targets) {
        if (cell.open || this.status !== 'playing') continue;
        events.push(...this.open(cell.x, cell.y));
      }
    } finally {
      this.sweeping = false;
    }
    return events;
  }

  /** A sweep is paid for, and the creatures walk, only if it did something. */
  private afterSweep(events: GameEvent[]): GameEvent[] {
    if (events.length > 0) {
      this.gate.spend();
      events.push(...this.moveOn());
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
    const price =
      id === 'exercise' && workout ? workout.base + this.exerciseSurcharge : SPELLS[id].cost;
    return spellPriceFor(price, this.settings);
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
    events.push(...this.moveOn());
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

  /** Open one cell without cascading. Engine-internal, for `cast.ts`. */
  markOpen(cell: Cell): boolean {
    if (cell.open) return false;
    cell.open = true;
    // A creature standing on uncovered ground, opened: it is fought where it stands.
    cell.occupied = false;
    // Opening ground is one of the two things that can unseal a crawl board.
    this.sealed = null;
    if (cell.tier === 0) this.openEmptyCount++;
    return true;
  }

  /**
   * Uncover a cell, cascading through blanks. A cell with number 0 has no
   * creature neighbours by definition, so a cascade never uncovers one.
   * Iterative rather than recursive: the biggest boards are a few thousand cells.
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
    revealAllCells(this.grid);
    return [{ type: 'won' }];
  }
}
