/**
 * The graded player: plays the way a person plays, with the tricks up to a chosen grade, and
 * reports what each board demanded of them.
 *
 * One pass at a time, lowest grade first. A pass gathers every move the cheapest yielding grade
 * offers, records which grade that was and how many moves it had, applies them all, and reads
 * the board again. Candidate sets a trick narrows are the player's pencil, kept here rather than
 * in `Cell.notes` (which the engine reads as a guard, docs/invariants.md), and only ever narrow.
 * When no grade yields the player is stuck: it records a stuck point and guesses the way
 * `docs/strategies.md` section 8 says to, or takes a stronger deducer's free moves if one is
 * attached, the way `forced.ts` attaches the complete deducer to the honest player.
 *
 * WHAT IT READS is what a person can see and nothing else (`reader.ts`, `tricks.ts`). The one
 * hidden read is the alarm: every cell a trick opens as safe, names, or narrows is checked
 * against its real tier, and `unsound` counts the times a trick was wrong. It must stay zero
 * (`test/graded.test.ts`), or nothing the instrument measures means anything.
 *
 * With `spells` it spends mana before HP, as docs/strategies.md section 8 advises: an
 * information spell at a stuck point (`spend`), and Exercise before a guess that could hurt.
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { hasNote, noteBit } from '../engine/notes.js';
import { mulberry32 } from '../engine/rng.js';
import { fightCostFor } from '../engine/settings.js';
import type { SpellId } from '../engine/spells.js';
import {
  type Constraint,
  type Reading,
  everyTier,
  highestTier,
  readBoard,
  touchingOf,
} from './reader.js';
import {
  GRADES,
  type Grade,
  type Moves,
  TRICKS_BY_GRADE,
  TRICK_IDS,
  type TrickId,
  type View,
  noMoves,
  runTrick,
} from './tricks.js';
import { augurAnswer, expectedFreed } from './aim.js';
import { CASTS_AT_A_STUCK_POINT, waitBudget } from './honest.js';
import { dungeonScaffold } from './scaffold.js';

/** How the graded player plays: its grade, and what it may read, spend and fall back on. */
export interface GradedOptions {
  /** The highest grade of trick the player uses. */
  grade: Grade;
  /** Read a beaten creature's number even where the game hides it. */
  peek?: boolean;
  /** A stronger deducer to fall back on when stuck, as `honest.ts` takes one. */
  rescue?: (game: Game) => Cell[];
  /** Ask the rescue and ignore it, to count the stuck points it would have rescued. */
  observe?: boolean;
  /** Spend mana on the ladder's spells at a stuck point and before a dear guess. */
  spells?: boolean;
  /**
   * Look first within this many cells of the last action, and scan the whole board only when
   * nothing there yields; 0 or absent looks everywhere at once. A first model of attention.
   */
  attention?: number;
}

/**
 * What one board demanded of the graded player and what it cost. The alarms (`unsound`,
 * `trickDamage`, `rescueDamage`) must stay 0.
 */
export interface GradedRun {
  cleared: boolean;
  hpLost: number;
  /** Passes on which nothing at the player's grade yielded a move. */
  stuckPoints: number;
  guesses: number;
  /** Guesses whose worst case could have killed at the HP of the moment. */
  lethalGuesses: number;
  /** Guesses that cost HP. */
  guessesHurt: number;
  /** The highest grade that was the lowest yielding one on some pass; -1 if none was needed. */
  hardestGrade: number;
  /** Passes on which grade g was the lowest yielding grade. */
  passesByGrade: number[];
  /** Cells opened or named on those passes. */
  movesByGrade: number[];
  /** Over the passes above grade 0: how many moves the yielding grade offered, summed. */
  availableSum: number;
  availablePasses: number;
  /** Cells each trick concluded, the first trick in order taking the credit. */
  fires: Record<TrickId, number>;
  /** Candidate sets each trick narrowed: the pencil work that concludes nothing yet. */
  pencils: Record<TrickId, number>;
  /** Passes weighted by grade cost, plus the guesses (`PASS_COST`, `GUESS_COST`). */
  effort: number;
  rescued: number;
  couldRescue: number;
  rescueDamage: number;
  /** Times the player let the creatures walk rather than guess, where they walk (PATROL). */
  waits: number;
  casts: number;
  manaSpent: number;
  /** Passes on which nothing near the last action yielded and the whole board was scanned. */
  scans: number;
  /** HP lost on a cell a trick called safe. Anything but 0 is a bug. */
  trickDamage: number;
  /** Times a trick opened, named or narrowed a cell wrongly. Anything but 0 is a bug. */
  unsound: number;
  /** The same, by the trick that was wrong. */
  unsoundBy: Record<TrickId, number>;
}

/**
 * What a pass at each grade costs a person, relative to a glance, and what a guess costs. A
 * first guess following the Sudoku raters' practice, to be calibrated against play
 * (docs/human-tuning-plan.md, section 10).
 */
const PASS_COST: readonly number[] = [1, 2, 4, 8, 8];
const GUESS_COST = 8;

/** Rounds of narrowing at one grade before it is called dry. Candidate sets only ever shrink. */
const NARROW_ROUNDS = 12;

/** What scanning the whole board costs, over the pass that then finds something. A first guess. */
const SCAN_COST = 4;

/** Passes of the play loop a board is allowed, per cell and per wait, before the player stops. */
const PASSES_PER_CELL = 8;

/**
 * Play one board as the graded player, a pass at a time, until it is won or lost; with nothing
 * left to gamble on, it forfeits. Mutates the game; returns what the board demanded and cost.
 */
export function play(game: Game, options: GradedOptions): GradedRun {
  const run: GradedRun = {
    cleared: false,
    hpLost: 0,
    stuckPoints: 0,
    guesses: 0,
    lethalGuesses: 0,
    guessesHurt: 0,
    hardestGrade: -1,
    passesByGrade: GRADES.map(() => 0),
    movesByGrade: GRADES.map(() => 0),
    availableSum: 0,
    availablePasses: 0,
    fires: Object.fromEntries(TRICK_IDS.map((id) => [id, 0])) as Record<TrickId, number>,
    pencils: Object.fromEntries(TRICK_IDS.map((id) => [id, 0])) as Record<TrickId, number>,
    effort: 0,
    rescued: 0,
    couldRescue: 0,
    rescueDamage: 0,
    waits: 0,
    casts: 0,
    manaSpent: 0,
    scans: 0,
    trickDamage: 0,
    unsound: 0,
    unsoundBy: Object.fromEntries(TRICK_IDS.map((id) => [id, 0])) as Record<TrickId, number>,
  };
  const player = new Player(game, options, run);
  const startHp = game.hp;
  // Where the creatures walk (PATROL) every action is a step, what the pencil held is stale
  // after it, and a stuck point is waited out before it is gambled on, as the honest player
  // does (`waitBudget`).
  const patience = waitBudget(game);
  let guard = game.config.width * game.config.height * PASSES_PER_CELL * (1 + patience);
  let waited = 0;
  let movesRead = game.moves;
  while (game.status === 'playing' && guard-- > 0) {
    if (game.moves !== movesRead) {
      player.forget();
      movesRead = game.moves;
    }
    if (player.pass()) {
      waited = 0;
      player.castsHere = 0;
      continue;
    }
    if (waited < patience) {
      game.wait();
      waited++;
      run.waits++;
      continue;
    }
    run.stuckPoints++;
    waited = 0;
    if (player.spend()) continue;
    if (player.rescue()) continue;
    player.guess();
  }
  run.cleared = game.status === 'won';
  run.hpLost = startHp - game.hp;
  return run;
}

class Player {
  private readonly domains = new Map<Cell, number>();
  private readonly scaffold: ReadonlySet<Cell>;
  private readonly draw: () => number;
  private readonly all: number;
  /** Information casts at the current stuck point. */
  castsHere = 0;
  /** Where the player last acted, which is where it looks first when attention is bounded. */
  private focus: Cell | null = null;

  constructor(
    private readonly game: Game,
    private readonly options: GradedOptions,
    private readonly run: GradedRun,
  ) {
    this.scaffold = dungeonScaffold(game);
    this.draw = mulberry32(game.seed ^ 0x9e3779b9);
    this.all = everyTier(game.config.tiers);
  }

  private domain(cell: Cell): number {
    return this.domains.get(cell) ?? this.all;
  }

  /** Rub out the pencil: what it held was true of the board before the creatures stepped. */
  forget(): void {
    this.domains.clear();
  }

  private view(reading: Reading): View {
    return {
      game: this.game,
      reading,
      level: this.game.level,
      peek: this.options.peek ?? false,
      domain: (cell) => this.domain(cell),
      scaffold: this.scaffold,
    };
  }

  /**
   * One pass: the cheapest grade with a move, applied. False when stuck. With attention bounded
   * each grade is tried near the last action first and then over the whole board, so the grade
   * stays what is measured and locality only decides where a grade is found; a grade found only
   * by scanning is counted and costed.
   */
  pass(): boolean {
    const radius = this.options.attention ?? 0;
    for (const grade of GRADES) {
      if (grade > this.options.grade) return false;
      if (radius > 0 && this.focus) {
        if (this.passOver(grade, radius)) return true;
        if (this.passOver(grade, 0)) {
          this.run.scans++;
          this.run.effort += SCAN_COST;
          return true;
        }
      } else if (this.passOver(grade, 0)) return true;
    }
    return false;
  }

  /** One grade over the numbers within `radius` of the focus, or over all of them for 0. */
  private passOver(grade: Grade, radius: number): boolean {
    const { game, run } = this;
    for (let round = 0; round < NARROW_ROUNDS; round++) {
      const reading = this.nearby(readBoard(game, this.options.peek ?? false), radius);
      const view = this.view(reading);
      const moves = noMoves();
      let narrowed = 0;
      for (const id of TRICKS_BY_GRADE[grade]) {
        const found = runTrick(id, view);
        narrowed += this.narrow(id, found);
        this.credit(id, found, moves);
      }
      const applied = this.apply(moves, game.patrols);
      if (applied > 0) {
        run.passesByGrade[grade]!++;
        run.movesByGrade[grade]! += applied;
        run.hardestGrade = Math.max(run.hardestGrade, grade);
        run.effort += PASS_COST[grade]!;
        if (grade > 0) {
          run.availableSum += applied;
          run.availablePasses++;
        }
        return true;
      }
      if (!narrowed) break;
    }
    return false;
  }

  /** The reading with only the numbers within `radius` of the focus, or all of it for 0. */
  private nearby(reading: Reading, radius: number): Reading {
    const at = this.focus;
    if (radius <= 0 || !at) return reading;
    const constraints = reading.constraints.filter(
      (c) => Math.abs(c.cell.x - at.x) <= radius && Math.abs(c.cell.y - at.y) <= radius,
    );
    return { ...reading, constraints, touching: touchingOf(constraints) };
  }

  /** Narrow the pencil by what a trick found, and count what was new. */
  private narrow(id: TrickId, found: Moves): number {
    let n = 0;
    for (const [cell, mask] of found.narrow) {
      const before = this.domain(cell);
      const after = before & mask;
      if (after === before || after === 0) continue;
      this.domains.set(cell, after);
      this.run.pencils[id]++;
      if (!hasNote(after, cell.tier)) this.alarm(id, cell, `narrowed to ${after.toString(2)}`);
      n++;
    }
    return n;
  }

  /**
   * The one hidden read: a trick was wrong about a cell. With `CS_DEBUG` set it throws at the
   * first one, naming the trick, the cell and its ring, which is how a wrong trick is found.
   */
  private alarm(id: TrickId, cell: Cell, what: string): void {
    this.run.unsound++;
    this.run.unsoundBy[id]++;
    if (!process.env['CS_DEBUG']) return;
    const ring = this.game.neighboursOf(cell).map((n) => {
      const at = `(${n.x},${n.y})`;
      if (n.open) return `${at} open, number ${n.num}`;
      return `${at} covered, a ${n.tier}, pencil ${this.domain(n).toString(2)}`;
    });
    throw new Error(
      `${id} ${what} at (${cell.x},${cell.y}), a ${cell.tier} at LV${this.game.level}\n  ` +
        ring.join('\n  '),
    );
  }

  /** Merge a trick's moves into the pass's, crediting the first trick to conclude each cell. */
  private credit(id: TrickId, found: Moves, moves: Moves): void {
    for (const cell of found.open) {
      if (moves.open.has(cell) || moves.mark.has(cell) || cell.open) continue;
      if (cell.mark > this.game.level || !this.game.inReach(cell)) continue;
      moves.open.add(cell);
      this.run.fires[id]++;
      if (cell.tier > this.game.level) this.alarm(id, cell, 'opened');
    }
    // A mark is a claim about a cell everywhere but where the creatures walk (it is a route
    // there), so on such a board a name goes into the pencil instead, until the next step.
    if (!this.game.marksAreClaims) {
      for (const [cell, tier] of found.mark) {
        const before = this.domain(cell);
        const after = before & noteBit(tier);
        if (cell.open || after === 0 || after === before) continue;
        this.domains.set(cell, after);
        this.run.pencils[id]++;
        if (!hasNote(after, cell.tier)) this.alarm(id, cell, `named ${tier} in the pencil`);
      }
      return;
    }
    for (const [cell, tier] of found.mark) {
      if (moves.open.has(cell) || moves.mark.has(cell) || cell.open || cell.mark > 0) continue;
      moves.mark.set(cell, tier);
      this.run.fires[id]++;
      if (cell.tier !== tier) this.alarm(id, cell, `marked ${tier}`);
    }
  }

  /** Play the pass's moves. */
  private apply(moves: Moves, oneAtATime: boolean): number {
    const { game, run } = this;
    let applied = 0;
    for (const [cell, tier] of moves.mark) {
      if (game.status !== 'playing') break;
      if (!game.setMark(cell.x, cell.y, tier).some((e) => e.type === 'blocked')) applied++;
      this.focus = cell;
    }
    for (const cell of moves.open) {
      if (game.status !== 'playing') break;
      if (cell.open) continue;
      const hp = game.hp;
      if (!game.open(cell.x, cell.y).some((e) => e.type === 'blocked')) applied++;
      run.trickDamage += hp - game.hp;
      this.domains.delete(cell);
      this.focus = cell;
      // Where the creatures walk the open was a move, and the reading is stale after it.
      if (oneAtATime) break;
    }
    return applied;
  }

  /** Take the attached deducer's free moves, if any; count them either way. */
  rescue(): boolean {
    const { game, run, options } = this;
    if (!options.rescue) return false;
    const found = options.rescue(game).filter((c) => !c.open && game.inReach(c));
    if (!found.length) return false;
    if (options.observe) {
      run.couldRescue++;
      return false;
    }
    run.rescued++;
    for (const cell of found) {
      if (game.status !== 'playing' || cell.open) continue;
      const hp = game.hp;
      game.open(cell.x, cell.y);
      run.rescueDamage += hp - game.hp;
      this.domains.delete(cell);
      // Where the creatures walk the open was a move, and what the deducer said is stale.
      if (game.patrols) break;
    }
    return true;
  }

  /**
   * Where a person gambles: a cell whose worst case cannot kill, then the lowest ceiling, then
   * the lowest expectation, then the one more numbers touch; ties by the run's own draw, never by
   * grid order (docs/strategies.md, section 8). The ceiling of a cell is the smallest remainder
   * among the visible numbers touching it, capped by the pencil and the top live tier; a cell no
   * number touches is worth the top tier at worst and the counters' average on average.
   */
  private pick(reading: Reading): Gamble | null {
    const { game } = this;
    const field = reading.unknown.filter((c) => game.inReach(c));
    if (!field.length) return null;
    const loose = reading.totalHiding / Math.max(1, reading.unknown.length);
    let best: Gamble | null = null;
    let ties = 0;
    for (const cell of field) {
      const near = reading.touching.get(cell) ?? [];
      let ceiling = Math.min(reading.top, Math.max(0, highestTier(this.domain(cell))));
      let mean = loose;
      for (const c of near) {
        ceiling = Math.min(ceiling, c.residual);
        mean = Math.min(mean, c.residual / c.unknown.length);
      }
      // Priced as the fight would be, through the creature-damage dial, so a lethal guess is one
      // that kills at the dial in force.
      const worst =
        ceiling <= game.level ? 0 : fightCostFor(game.level, game.hp, ceiling, game.settings);
      const key = [worst >= game.hp ? 1 : 0, ceiling, mean, -near.length];
      const order = best ? compare(key, best.key) : -1;
      if (order < 0) {
        best = { cell, key, ceiling, near };
        ties = 1;
      } else if (order === 0 && this.draw() * ++ties < 1) {
        best = { cell, key, ceiling, near };
      }
    }
    return best;
  }

  /** Gamble, spending an Exercise first where the worst case is above the level and it can. */
  guess(): void {
    const { game, run } = this;
    const gamble = this.pick(readBoard(game, this.options.peek ?? false));
    if (!gamble) {
      game.forfeit();
      return;
    }
    const { cell } = gamble;
    if (this.options.spells && gamble.ceiling > game.level && game.exerciseCharge === 0) {
      this.cast('exercise');
    }
    if (gamble.key[0] === 1) run.lethalGuesses++;
    run.guesses++;
    run.effort += GUESS_COST;
    const hp = game.hp;
    game.open(cell.x, cell.y);
    if (game.hp < hp) run.guessesHurt++;
    this.domains.delete(cell);
    this.focus = cell;
  }

  /**
   * Spend mana before HP (docs/strategies.md, section 8): at a stuck point, Reveal on the cell
   * that would otherwise be gambled on; else Augur on the number whose list is likeliest to free a
   * cell (`expectedFreed`); else Census on the number over the gamble that a count would tighten
   * most; else Beacon. At most `CASTS_AT_A_STUCK_POINT` information casts a stuck point, as the
   * honest player allows itself. True when something was cast, so the board is re-read.
   */
  spend(): boolean {
    const { game } = this;
    if (!this.options.spells || this.castsHere >= CASTS_AT_A_STUCK_POINT) return false;
    const gamble = this.pick(readBoard(game, this.options.peek ?? false));
    if (!gamble) return false;
    if (this.cast('reveal', gamble.cell)) return true;
    const augur = game.canCast('augur') ? this.augurTarget() : null;
    if (augur && this.cast('augur', augur.cell)) return true;
    const spread = (c: Constraint): number => c.residual / c.unknown.length;
    let target: Constraint | null = null;
    for (const c of gamble.near) {
      if (c.cell.census !== null) continue;
      if (!target || spread(c) > spread(target)) target = c;
    }
    if (target && this.cast('census', target.cell)) return true;
    return this.cast('beacon');
  }

  /** The number whose Augur would free most, on average, of what the pencil leaves open. */
  private augurTarget(): Constraint | null {
    const { game } = this;
    const reading = readBoard(game, this.options.peek ?? false);
    let best: Constraint | null = null;
    let most = 0;
    for (const c of reading.constraints) {
      if (c.tiers !== null) continue;
      const freed = expectedFreed(c, reading, (cell) => this.domain(cell), game.level, augurAnswer);
      if (freed > most) {
        best = c;
        most = freed;
      }
    }
    return best;
  }

  /** Cast if the ladder offers it and the mana is there; count it. */
  private cast(id: SpellId, target?: Cell): boolean {
    const { game, run } = this;
    if (!game.canCast(id)) return false;
    const before = game.mana;
    const events = target ? game.cast(id, target.x, target.y) : game.cast(id);
    if (events.some((e) => e.type === 'blocked')) return false;
    run.casts++;
    run.manaSpent += before - game.mana;
    if (id !== 'exercise') this.castsHere++;
    return true;
  }
}

interface Gamble {
  cell: Cell;
  key: number[];
  ceiling: number;
  near: readonly Constraint[];
}

function compare(a: readonly number[], b: readonly number[]): number {
  if (!b.length) return -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}
