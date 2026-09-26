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
 * Spell-less in this version; the honest player's spending policies are the next step
 * (docs/human-tuning-plan.md, section 10).
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { damageIfSurvived } from '../engine/combat.js';
import { hasNote, noteBit } from '../engine/notes.js';
import { mulberry32 } from '../engine/rng.js';
import { type Reading, everyTier, highestTier, readBoard } from './reader.js';
import {
  GRADES,
  type Grade,
  type Moves,
  TRICKS,
  TRICK_IDS,
  type TrickId,
  type View,
  noMoves,
} from './tricks.js';
import { dungeonScaffold } from './scaffold.js';

export interface GradedOptions {
  /** The highest grade of trick the player uses. */
  grade: Grade;
  /** Read a beaten creature's number even where the game hides it. */
  peek?: boolean;
  /** A stronger deducer to fall back on when stuck, as `honest.ts` takes one. */
  rescue?: (game: Game) => Cell[];
  /** Ask the rescue and ignore it, to count the stuck points it would have rescued. */
  observe?: boolean;
}

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

/** How long a stuck point is waited out where the creatures walk, in laps of the longest route. */
const PATIENCE_LAPS = 1;

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
    trickDamage: 0,
    unsound: 0,
    unsoundBy: Object.fromEntries(TRICK_IDS.map((id) => [id, 0])) as Record<TrickId, number>,
  };
  const player = new Player(game, options, run);
  const startHp = game.hp;
  // Where the creatures walk (PATROL) every action is a step, what the pencil held is stale
  // after it, and a stuck point is waited out before it is gambled on, as the honest player
  // does: one lap of the longest route shows the biggest creature on every cell it can stand on.
  const patience = game.patrols ? PATIENCE_LAPS * 4 * game.config.tiers : 0;
  let guard = game.config.width * game.config.height * 8 * (1 + patience);
  let waited = 0;
  let movesRead = game.moves;
  while (game.status === 'playing' && guard-- > 0) {
    if (game.moves !== movesRead) {
      player.forget();
      movesRead = game.moves;
    }
    if (player.pass()) {
      waited = 0;
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

  /** One pass: the cheapest grade with a move, applied. False when stuck. */
  pass(): boolean {
    const { game, run } = this;
    for (const grade of GRADES) {
      if (grade > this.options.grade) return false;
      for (let round = 0; round < NARROW_ROUNDS; round++) {
        const reading = readBoard(game, this.options.peek ?? false);
        const view = this.view(reading);
        const moves = noMoves();
        let narrowed = 0;
        for (const id of TRICK_IDS) {
          const trick = TRICKS[id];
          if (trick.grade !== grade) continue;
          const found = noMoves();
          trick.apply(view, found);
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
    }
    return false;
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
    }
    for (const cell of moves.open) {
      if (game.status !== 'playing') break;
      if (cell.open) continue;
      const hp = game.hp;
      if (!game.open(cell.x, cell.y).some((e) => e.type === 'blocked')) applied++;
      run.trickDamage += hp - game.hp;
      this.domains.delete(cell);
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
  guess(): void {
    const { game, run } = this;
    const reading = readBoard(game, this.options.peek ?? false);
    const field = reading.unknown.filter((c) => game.inReach(c));
    if (!field.length) {
      game.forfeit();
      return;
    }
    const loose = reading.totalHiding / Math.max(1, reading.unknown.length);
    let best: Cell | null = null;
    let bestKey: number[] = [];
    let ties = 0;
    for (const cell of field) {
      const near = reading.touching.get(cell) ?? [];
      let ceiling = Math.min(reading.top, Math.max(0, highestTier(this.domain(cell))));
      let mean = loose;
      for (const c of near) {
        ceiling = Math.min(ceiling, c.residual);
        mean = Math.min(mean, c.residual / c.unknown.length);
      }
      const worst = ceiling <= game.level ? 0 : damageIfSurvived(game.level, ceiling);
      const key = [worst >= game.hp ? 1 : 0, ceiling, mean, -near.length];
      const order = compare(key, bestKey);
      if (best === null || order < 0) {
        best = cell;
        bestKey = key;
        ties = 1;
      } else if (order === 0 && this.draw() * ++ties < 1) {
        best = cell;
      }
    }
    const cell = best!;
    if (bestKey[0] === 1) run.lethalGuesses++;
    run.guesses++;
    run.effort += GUESS_COST;
    const hp = game.hp;
    game.open(cell.x, cell.y);
    if (game.hp < hp) run.guessesHurt++;
    this.domains.delete(cell);
  }
}

function compare(a: readonly number[], b: readonly number[]): number {
  if (!b.length) return -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}
