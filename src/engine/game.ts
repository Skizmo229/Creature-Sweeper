/**
 * The rules engine.
 *
 * Pure state plus transitions — no rendering, no timers, no storage. Every
 * action returns the events it caused, so a renderer can animate them and a
 * test can assert on them. Elapsed time is entirely the caller's business.
 */

import type { BoardConfig, Cell, GameEvent, SweepOptions } from './types.js';
import { Progression, resolveBattle, expForTier } from './combat.js';
import { EXERCISE_LEVELS, SPELLS, type SpellId } from './spells.js';
import {
  DEFAULT_GAMEPLAY,
  type GameplaySettings,
  biteFor,
  cellsPerMana,
  effectiveHp,
  manaRewardFor,
} from './settings.js';
import {
  hasNote,
  hasNotes,
  lowestNote,
  noteBit,
  toggleNote as toggleNoteBit,
} from './notes.js';
import {
  type Grid,
  findBestOpening,
  findFallbackOpening,
  generateGrid,
  inBounds,
  neighbours,
} from './board.js';
import { allowsTier, hiddenCap, shadeOf } from './checker.js';
import { isPaired, pairCandidates, ringIsFree } from './pairs.js';
import { missingFrom } from './packs.js';
import { congoClear } from './congo.js';
import { mulberry32 } from './rng.js';

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
  status: 'playing' | 'won' | 'lost' = 'playing';

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
   * False until the player's first real action on this board.
   *
   * It is NOT what starts the clock, and deliberately so. A board deals its
   * opening before the player touches anything, and reading that opening is
   * the first thing you do — so the clock starts when the board is dealt and
   * this flag answers a different question: whether the player has done
   * anything here yet.
   *
   * No caller today. Kept because "untouched board" is a real distinction the
   * engine is the only thing that can make, and because the alternative is for
   * the next feature that wants it to re-derive it from the grid.
   */
  started = false;

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
    config: BoardConfig, seed: number, grid: Grid, startHp: number,
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
        if (cell.mark > 0) this.marksPlaced[cell.mark - 1] = (this.marksPlaced[cell.mark - 1] ?? 0) + 1;
      }
    }
    // Only ground that exists counts toward a search-mode clear.
    this.totalEmpty = grid.flat().filter((c) => c.present).length -
      config.quantity.reduce((a, b) => a + b, 0);
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

  /**
   * Cells that Sweep would open.
   *
   * The base rule is a proof. A revealed cell's number is the SUM of its
   * neighbouring tiers, so if the part still hidden is at or below your level,
   * no single hidden neighbour can exceed your level, and a creature at or
   * below your level costs nothing to kill.
   *
   * With `useMarks` (the default) the player's marks are subtracted from that
   * sum too, which reaches a great deal further: a 5 beside a cell you marked
   * "4" leaves a residual of 1, so everything else around it is free at LV1.
   *
   * That second step is only as good as the marks. It is an assumption, not a
   * proof — a wrong mark can cost HP. Pass `useMarks: false` for the strictly
   * provable subset. Either way, a cell marked above your level is never
   * opened; that lock is the player's own and always wins.
   *
   * SWEEP MUST STAY STRICTLY WEAKER THAN THE GENERATOR'S SOLVER. On every
   * other type that is automatic, because those boards contain real ambiguity
   * and any deducer runs out. A Sudoku board does not: it is generated by
   * rejecting anything `clearableWithoutGuessing` cannot finish, so a Sweep
   * that reasoned with the Sudoku rule would clear 100% of every board in one
   * click, by construction. It did, briefly. The rule is therefore deliberately
   * absent here and the player supplies it as pencil marks instead.
   *
   * What makes that safe is that notes are player-authored and do not
   * regenerate: opening cells reveals new numbers, but it never pencils
   * anything, so the loop below cannot iterate its way to a solution. Any
   * future helper that fills candidates automatically would hand that property
   * straight back and turn Sweep into a solve button again.
   */
  safeCells(options: SweepOptions = {}): Cell[] {
    const useMarks = options.useMarks ?? true;
    const out: Cell[] = [];
    if (this.status !== 'playing' || this.level <= 0) return out;
    if (this.config.placement === 'sudoku') return this.markedSafe(useMarks);
    const checkered = this.config.placement === 'checker';
    const paired = isPaired(this.config.placement);
    // The highest tier each open creature's pack could still be hiding. Worked
    // out once per call rather than per cell, because a pack's piece is shared
    // by every creature in it.
    // A congo line is a pack, so the pack proof reads it unchanged.
    const grouped = this.config.placement === 'packs' || this.config.placement === 'congo';
    const packGaps = grouped
      ? missingFrom(this.grid.flat(), (c) => this.neighboursOf(c), this.config.tiers)
      : null;
    // Cells the line's own shape has proven empty; see `congoClear`. Decided
    // per cell rather than per ring, like the checkerboard's parity.
    const lineClear = this.config.placement === 'congo'
      ? congoClear(this.grid, this.config.tiers)
      : null;
    const seen = new Set<Cell>();

    for (const row of this.grid) {
      for (const cell of row) {
        if (!cell.present || !cell.open) continue;
        const ns = this.neighboursOf(cell);

        // Tiers you can already see: open ground counts 0, and a defeated
        // creature's tier is a fact, not a guess. Subtracting them is free
        // certainty -- a 7 beside a dead tier-6 only hides a 1.
        let known = 0;
        let claimed = 0;
        let hasClaims = false;
        let openCreatures = 0;
        // Covered dark neighbours, counted whether or not they carry a mark.
        // The checkerboard proof is about what the cells ARE, and a mark is
        // the player's claim about one; counting only the unmarked would make
        // a proof depend on annotation. Zero on every other board.
        let darkCovered = 0;
        for (const n of ns) {
          if (n.open) {
            known += n.tier;
            if (n.tier > 0) openCreatures++;
          } else {
            if (checkered && shadeOf(n) === 'dark') darkCovered++;
            if (n.mark > 0) {
              claimed += n.mark;
              hasClaims = true;
            }
          }
        }

        const hidden = cell.num - known;
        // Proven: the covered neighbours together sum to at most your level,
        // so no single one can exceed it.
        let proven = hidden <= this.level;

        // Proven again, by counting. A Census says how many creatures are
        // around this cell; take off the ones already open and you know how
        // many share the hidden sum. Each of them is worth at least 1, so the
        // biggest can be at most the sum less one for every other — a tighter
        // cap than the sum alone, and the one thing the count can prove that
        // the number could not.
        //
        // This is a fact, not a claim, so it stands with `proven` rather than
        // with the marks. Without it a Census is information the game cannot
        // act on: measured at 0.01 HP saved per cast against Reveal's 0.39,
        // largely because Sweep could not read the answer the player paid for.
        if (!proven && cell.census !== null) {
          const hiddenCreatures = cell.census - openCreatures;
          if (hiddenCreatures > 0 && hidden - (hiddenCreatures - 1) <= this.level) proven = true;
        }

        // Proven a fourth way, by pairing. A creature has exactly one creature
        // neighbour, so an open one is surrounded by its partner and empty
        // ground — and its own number IS that partner's tier, because nothing
        // else beside it carries one. So the whole ring is free once either
        // the partner is within your level or you have already met it.
        //
        // It folds into `proven` rather than standing beside it because it
        // answers for the entire ring at once, which is what that flag means.
        // See `ringIsFree` for why this cannot iterate: a freed ring holds the
        // partner and otherwise blank ground, since no second pair may touch
        // the first, so a trigger clears one domino and stops.
        if (!proven && paired && ringIsFree(cell, ns, this.level)) proven = true;

        // Proven a fifth way, by packs. Packs never touch, so every covered
        // neighbour of an open creature is a packmate or empty ground, and a
        // packmate is one of the tiers its pack has not shown yet. When the
        // highest of those is within your level the ring is free — and when
        // none is missing, the pack is whole and the ring is empty at ANY
        // level. Like the pairing proof it cannot run away: a freed ring holds
        // packmates and blank ground, so a trigger finishes one pack and stops.
        if (!proven && packGaps) {
          const gap = packGaps.get(cell);
          if (gap !== undefined && gap <= this.level) proven = true;
        }

        // Claimed: the same bound, but only after trusting the player's marks.
        // A negative residual means the marks contradict the number, so the
        // claim is already known to be wrong and is not acted on.
        const residual = hidden - claimed;
        const claimedSafe = useMarks && hasClaims && residual >= 0 && residual <= this.level;

        // Proven a third way, by colour. On a checkerboard the light cells
        // behind a number sum to an even total, so the number's parity belongs
        // entirely to the dark ones -- which caps what any ONE covered cell
        // can be holding below the hidden sum, and sometimes pins it at zero.
        // See `hiddenCap`. It is a fact about the board, so it stands with
        // `proven` rather than with the marks, and unlike the other two it is
        // decided per neighbour rather than for the whole ring at once.
        const provenByColour = (n: Cell): boolean =>
          checkered && hiddenCap(shadeOf(n), hidden, darkCovered) <= this.level;

        const provenByLine = (n: Cell): boolean => !!lineClear && lineClear.has(n);

        if (!proven && !claimedSafe && !ns.some(
          (n) => !n.open && (provenByColour(n) || provenByLine(n)))) continue;

        for (const n of ns) {
          if (n.open || seen.has(n)) continue;
          // The player's own lock always wins.
          if (n.mark > this.level) continue;
          // And so does the same lock written as a set. Without this, Sweep
          // would be a way around the guard rather than a tool inside it.
          if (hasNotes(n.notes) && lowestNote(n.notes) > this.level) continue;
          const cellProof = provenByColour(n) || provenByLine(n);
          if (!proven && !cellProof) {
            // Nothing proved this particular cell, so all that is left is the
            // mark-assisted bound -- and that covers only the UNMARKED
            // neighbours: the marked ones are the assumption that produced the
            // bound, never a conclusion drawn from it.
            if (!claimedSafe || n.mark > 0) continue;
          }
          seen.add(n);
          out.push(n);
        }
      }
    }

    // NOTES ARE DELIBERATELY ABSENT HERE. They can protect you; they must
    // never expose you.
    //
    // A pencil mark means "these are the tiers I have not eliminated yet",
    // which is the opposite of a claim about what the cell is. Reading it as
    // one inverts the meaning: scratch work like "might be a 2 or a 3" would
    // make the cell sweepable, and if it is really a 7 the player pays for
    // thinking out loud. Measured on a live board at LV5, exactly that — a
    // cell pencilled {2,3}, actually tier 7, offered up by Sweep for 7 damage.
    //
    // The guard in `open()` reads notes in the other direction, refusing a
    // cell when every candidate is above your level, and that asymmetry is the
    // point: a conservative reading of an uncertain annotation is safe, a
    // permissive one is not. When the player is sure, they commit the pencil
    // to a mark — which is the Sudoku idiom exactly, pencil for candidates and
    // pen for a digit you have solved.

    return out;
  }

  /**
   * Sweep on a Sudoku board: harvest the cells you have already identified.
   *
   * The neighbour-sum proof is not weak here, it is empty — measured at zero
   * cells on every board of the ladder, even with half the grid correctly
   * marked. Hidden sums run to sixty at this density, so `hidden <= level`
   * never holds, and the mark-assisted residual never gets near a level
   * either. Both buttons were permanently dark.
   *
   * So the rule is the one thing that is both useful and safe: open every cell
   * whose tier you have written down and which your level already covers. It
   * cannot run away and solve the board, because marks are player-authored and
   * nothing regenerates them — you only ever get back the work you put in.
   *
   * The proof/claim split survives intact. A given is the board talking, so it
   * is a fact and the strict Sweep will act on it; a mark is the player's own
   * claim, so it needs mark-assistance, and a wrong one costs HP exactly as it
   * does everywhere else.
   */
  private markedSafe(useMarks: boolean): Cell[] {
    const out: Cell[] = [];
    for (const row of this.grid) {
      for (const cell of row) {
        if (!cell.present || cell.open) continue;
        if (cell.mark <= 0 || cell.mark > this.level) continue;
        if (!cell.given && !useMarks) continue;
        out.push(cell);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- actions

  /** Open a cell: reveal it, cascade if it is blank, fight what is there. */
  open(x: number, y: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    const cell = this.cellAt(x, y);
    if (!cell) return [{ type: 'blocked', reason: 'out-of-bounds' }];

    if (cell.open) {
      // A defeated creature flips between its sprite and its own number.
      if (cell.tier > 0 && !cell.alive) {
        cell.showNum = !cell.showNum;
        return [{ type: 'toggleNum', x, y, showNum: cell.showNum }];
      }
      return [{ type: 'blocked', reason: 'already-open' }];
    }

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

    this.started = true;
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

    if (cell.tier > 0 && cell.alive) events.push(...this.fight(cell));
    if (this.status === 'playing') events.push(...this.checkSearchWin());
    return events;
  }

  /**
   * Is this cell close enough to ground you have already uncovered to act on?
   *
   * The dungeon crawl rule. Distance is measured through `neighbours()` rather
   * than across grid coordinates, which is the whole design in one line: it is
   * how far you could WALK, so it stops dead at a wall instead of reaching
   * through two feet of rock into the next room, and it needs no special case
   * for hex boards or wrapped seams because adjacency already knows about
   * both.
   *
   * Measured outward from the CANDIDATE rather than inward from every open
   * cell. Distance is symmetric, so the answer is the same, but the work is a
   * couple of dozen cells instead of a sweep of the board — which matters,
   * because the renderer asks this nine times a frame while the cursor moves.
   *
   * A board with nothing open at all is entirely in reach. That is not a
   * special case for its own sake: `opening: 'none'` exists, and a reach rule
   * on top of it would otherwise present the player with a board they are
   * forbidden to touch.
   */
  inReach(cell: Cell): boolean {
    const reach = this.config.reach;
    if (reach <= 0 || cell.open) return true;
    if (this.sealedIn()) return true;

    const seen = new Set<Cell>([cell]);
    let frontier: Cell[] = [cell];
    let anyOpen = false;

    for (let step = 0; step < reach; step++) {
      const next: Cell[] = [];
      for (const at of frontier) {
        for (const n of this.neighboursOf(at)) {
          if (seen.has(n)) continue;
          seen.add(n);
          if (n.open) return true;
          next.push(n);
        }
      }
      frontier = next;
    }

    // Nothing within reach is open. Before refusing, check the board has an
    // open cell anywhere at all — see the note above.
    for (const row of this.grid) {
      for (const c of row) if (c.open) { anyOpen = true; break; }
      if (anyOpen) break;
    }
    return !anyOpen;
  }

  /**
   * Has the board sealed the player in? If so the crawl rule lifts.
   *
   * THIS IS WHAT KEEPS THE ZERO-DAMAGE GUARANTEE TRUE ON A CRAWL BOARD, and
   * it is not a precaution against something hypothetical. The guarantee is a
   * statement about what is *possible*, and a rule that restricts where you
   * may act can take a possibility away that the EXP economy was relying on:
   * the free kills you need are on the board, just not near you. Measured at
   * reach 2 over 2,280 boards, five of them ended with the frontier walled in
   * by creatures above the player's level and every free kill out of reach.
   * All five were on the opening move, where your level is 1 and a ring of
   * tier 2s is enough to do it.
   *
   * Widening the radius only makes it rarer — reach 3, 4, 5 and 6 each came
   * back clean over the same 2,280 — and "rare" is the wrong shape of answer
   * for an invariant the whole risk model rests on. One board in five hundred
   * that quietly cannot be finished is worse than a rule with a stated
   * exception, because the player has no way to tell which one they are on.
   *
   * So the exception is stated: THE DUNGEON NEVER FORCES A FIGHT YOU CANNOT
   * WIN FOR FREE. When nothing within reach can be opened at your level, the
   * radius lifts until something can. In play it lasts exactly one click —
   * you take a free kill somewhere, and the frontier is yours again.
   *
   * Deliberately read off `level` alone, not `level + exerciseCharge`: the
   * question is whether the BOARD has sealed you, not whether you happen to
   * hold a purchase that would open it. A spell should be a choice, never the
   * thing standing between a run and a dead end. That was hypothetical when it
   * was written and is not any more, because DUNGEON carries Exercise — and
   * reading the charge would now mean that holding one CLOSES the escape
   * hatch, which is a punishment for having bought the spell.
   */
  sealedIn(): boolean {
    if (this.config.reach <= 0) return false;
    // Two things can change the answer: a cell opening, which clears the
    // cache, and the level moving, which is compared rather than hooked —
    // `progression` is public and a caller that sets a level directly would
    // otherwise be reading a stale seal.
    if (this.sealed === null || this.sealedLevel !== this.level) {
      this.sealed = this.computeSealed();
      this.sealedLevel = this.level;
    }
    return this.sealed;
  }

  /**
   * One flood from every open cell at once, `reach` rings deep, asking whether
   * any covered cell it lands on is free to open.
   *
   * Outward from the open ground rather than inward from a candidate, which is
   * the opposite of `inReach` and right for the opposite reason: this is one
   * question about the whole board, where that is the same question asked of
   * two dozen cells a frame. The answer is cached and thrown away whenever a
   * cell opens or the level moves, which are the only two things that can
   * change it.
   */
  private computeSealed(): boolean {
    let frontier: Cell[] = [];
    const seen = new Set<Cell>();
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.present && cell.open) { frontier.push(cell); seen.add(cell); }
      }
    }
    // A board with nothing open is not sealed — everything is in reach there.
    if (!frontier.length) return false;

    for (let step = 0; step < this.config.reach; step++) {
      const next: Cell[] = [];
      for (const at of frontier) {
        for (const n of this.neighboursOf(at)) {
          if (seen.has(n)) continue;
          seen.add(n);
          if (n.tier <= this.level) return false;
          next.push(n);
        }
      }
      frontier = next;
    }
    return true;
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
    this.started = true;
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
    this.started = true;
    events.push({ type: 'noted', x, y, from, to });
    return events;
  }

  /**
   * The tiers this covered cell could still be holding by the placement rule
   * alone, as a note mask — what the pencil may offer here.
   *
   * Only what the rule says outright, read off what is already on screen: the
   * square's colour on CHECKERBOARD, the partner's number beside a defeated
   * creature on a pairing board (`pairCandidates`), and on SUDOKU the fact that
   * the opening uncovered every empty cell, so nothing covered can be tier 0.
   * Deliberately NOT anything that takes deduction — a Sudoku row already
   * holding a 3 does not strike the 3 here. Pencil marks are where the player
   * does that work, and a pencil that did it for them would be the
   * auto-candidates convenience that turns Sweep back into a solve button.
   *
   * Sound one way only, which is the way that matters: a tier the rule has
   * not refused stays in even when the numbers could rule it out, and the tier
   * a cell really holds is never taken out. The tests check the second half on
   * every covered cell of real boards played part-way.
   */
  noteCandidates(cell: Cell): number {
    const tiers = this.config.tiers;
    let mask = (1 << (tiers + 1)) - 1;
    const { placement } = this.config;
    if (placement === 'sudoku') mask &= ~noteBit(0);
    if (placement === 'checker') {
      for (let t = 1; t <= tiers; t++) {
        if (!allowsTier(cell.x, cell.y, t)) mask &= ~noteBit(t);
      }
    }
    if (isPaired(placement)) {
      const pair = pairCandidates(cell, (c) => this.neighboursOf(c));
      if (pair !== null) mask &= pair;
    }
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
    this.revealAllCreatures();
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
   * Cast a spell, optionally at a target cell.
   *
   * Mana is only spent when the spell actually does something, so a Beacon
   * with no region left or a Reveal on an open cell is refused rather than
   * silently burning the cost.
   */
  cast(id: SpellId, x?: number, y?: number): GameEvent[] {
    if (this.status !== 'playing') return [{ type: 'blocked', reason: 'game-over' }];
    if (!this.config.spells.includes(id)) return [{ type: 'blocked', reason: 'no-such-spell' }];
    const spell = SPELLS[id];
    const cost = this.spellCost(id);
    if (this.mana < cost) return [{ type: 'blocked', reason: 'no-mana' }];

    let target: Cell | null = null;
    if (spell.targeted) {
      if (x === undefined || y === undefined) return [{ type: 'blocked', reason: 'out-of-bounds' }];
      target = this.cellAt(x, y);
      if (!target) return [{ type: 'blocked', reason: 'out-of-bounds' }];
      // A targeted spell is a click on the board, so the crawl rule applies to
      // it too. Exempting Reveal would be the larger change it looks like the
      // smaller one: revealing distant empty ground OPENS it, which re-roots
      // the frontier on the far side of the map and buys a teleport for 25
      // mana. One rule with no exceptions is also one rule to explain.
      if (!this.inReach(target)) return [{ type: 'blocked', reason: 'out-of-reach' }];
    }

    const events: GameEvent[] = [];
    let detail: string;

    switch (id) {
      case 'reveal': {
        const cell = target!;
        if (cell.open) return [{ type: 'blocked', reason: 'already-open' }];
        const opened: Array<{ x: number; y: number }> = [];
        if (cell.tier === 0) {
          // Empty ground is safe by definition, so just open it.
          opened.push(...this.reveal(cell));
          detail = 'empty';
        } else {
          // A truthful mark. It also feeds mark-assisted Sweep, which is the
          // point: Reveal buys deduction, not just one square.
          //
          // And it is a GIVEN, not a player mark — the same flag a Sudoku clue
          // carries, because it is the same kind of claim: the board talking
          // rather than the player guessing. That buys two things. It renders
          // gold instead of green, so a fact you paid for never looks like a
          // hypothesis you wrote; and `setMark` refuses to toggle it off, so
          // 25 mana of information cannot be rubbed out by a stray right-click
          // and cannot be got back.
          //
          // It does NOT strengthen Sweep. The strict proof consults `given`
          // only on the Sudoku path, which no board carrying spells uses, so
          // a revealed tier still reaches Sweep as mark assistance exactly as
          // it did before.
          this.applyMark(cell, cell.tier);
          cell.given = true;
          detail = `tier ${cell.tier}`;
        }

        // And clear the empty ground touching it. What you bought was "what is
        // here", and the ring around it is the part of that answer the board
        // can show rather than assert: a cell with no creature on it is a cell
        // you would have been free to open anyway, so opening it gives away no
        // safety the player did not already have — it saves the clicks.
        //
        // This cannot run away, and the reason is structural rather than a
        // limit imposed here. Revealing a CREATURE can never cascade: every
        // neighbour of a tier-N cell carries at least N in its own number, so
        // none of them can be a zero cell, and a cascade needs one. Revealing
        // EMPTY ground can cascade, but it already could — `reveal` above does
        // it — so the ring adds nothing new there either.
        //
        // These cells pay no exploration mana, the same as Beacon's and the
        // dealt opening's. Ground you bought is not ground you explored, and
        // paying for it would refund part of the spell's own price.
        for (const n of this.neighboursOf(cell)) {
          if (!n.open && n.tier === 0) opened.push(...this.reveal(n));
        }
        if (opened.length) events.push({ type: 'revealed', cells: opened });
        break;
      }

      case 'census': {
        const cell = target!;
        if (cell.census !== null) return [{ type: 'blocked', reason: 'no-effect' }];
        cell.census = this.neighboursOf(cell).filter((n) => n.tier > 0).length;
        detail = `${cell.census} adjacent`;
        break;
      }

      case 'exercise': {
        if (this.exerciseCharge > 0) return [{ type: 'blocked', reason: 'no-effect' }];
        this.exerciseCharge = EXERCISE_LEVELS;
        detail = `+${EXERCISE_LEVELS} level`;
        break;
      }

      case 'beacon': {
        const region = findBestOpening(this.grid, true, this.config.topology, this.config.wrap);
        if (!region) return [{ type: 'blocked', reason: 'no-effect' }];
        const opened: Array<{ x: number; y: number }> = [];
        for (const cell of region.cells) {
          if (this.markOpen(cell)) opened.push({ x: cell.x, y: cell.y });
        }
        if (opened.length === 0) return [{ type: 'blocked', reason: 'no-effect' }];
        events.push({ type: 'revealed', cells: opened });
        detail = `${opened.length} cells`;
        break;
      }
    }

    this.mana -= cost;
    // The price rises only once the cast has gone through, so a refused cast
    // costs nothing now and nothing later.
    if (id === 'exercise' && this.config.workout) {
      this.exerciseSurcharge += this.config.workout.step;
    }
    this.started = true;
    events.push(
      target
        ? { type: 'spell', id, x: target.x, y: target.y, detail }
        : { type: 'spell', id, detail },
    );
    if (this.status === 'playing') events.push(...this.checkSearchWin());
    return events;
  }

  /** Shared by setMark and Reveal so the per-tier counters stay honest. */
  private applyMark(cell: Cell, mark: number): void {
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

  private markOpen(cell: Cell): boolean {
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
  private reveal(start: Cell): Array<{ x: number; y: number }> {
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

  private fight(cell: Cell): GameEvent[] {
    const events: GameEvent[] = [];

    // Exercise is spent on the fight itself, not on the damage afterwards:
    // you swing at the borrowed level, so a creature that would have taken
    // three rounds off you takes two. The creature's fate is unchanged, and it
    // still pays its EXP in full — nothing here can skip that.
    const lent = this.exerciseCharge;
    this.exerciseCharge = 0;
    const bite = biteFor(cell.tier, this.settings);
    const result = resolveBattle(this.level + lent, this.hp, cell.tier, bite);
    const taken = result.damage;
    this.hp = Math.max(0, this.hp - taken);

    // WORKOUT pays extra EXP for a kill made on a borrowed level. Extra, never
    // less: the gates are C_k, so a kill paying short could strand one, but a
    // kill paying over only reaches a gate sooner. The bonus is counted here so
    // the event can say what it was worth.
    const workout = this.config.workout;
    const bonusExp = lent > 0 && workout && result.defeated
      ? expForTier(cell.tier) * (workout.expMultiplier - 1)
      : 0;
    if (lent > 0) {
      const unaided = resolveBattle(this.level, this.hp + taken, cell.tier, bite).damage;
      events.push({ type: 'exercised', levels: lent, spared: unaided - taken, bonusExp });
    }
    events.push({
      type: 'battle',
      x: cell.x,
      y: cell.y,
      tier: cell.tier,
      damage: taken,
      defeated: result.defeated,
    });

    if (result.defeated) {
      cell.alive = false;
      this.remaining[cell.tier - 1] = (this.remaining[cell.tier - 1] ?? 0) - 1;
      // Every removal must pay full EXP. The upper level thresholds are the
      // TOTAL exp available from tiers at or below k, so a creature that dies
      // without paying makes that threshold permanently unreachable.
      this.mana += manaRewardFor(cell.tier, this.settings);
      const levelBefore = this.level;
      if (this.progression.award(expForTier(cell.tier) + bonusExp)) {
        events.push({ type: 'levelUp', level: this.level });
        // Levelling eases WORKOUT's price, a step per level gained. A double
        // kill can buy two levels at once, and both count.
        if (workout) {
          this.exerciseSurcharge = Math.max(
            0, this.exerciseSurcharge - workout.relief * (this.level - levelBefore));
        }
      }
      if (this.creaturesLeft() === 0 && !this.config.search) {
        this.status = 'won';
        events.push({ type: 'won' });
        return events;
      }
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.status = 'lost';
      this.revealAllCreatures();
      events.push({ type: 'lost' });
    }
    return events;
  }

  private checkSearchWin(): GameEvent[] {
    if (!this.config.search || this.openEmptyCount < this.totalEmpty) return [];
    this.status = 'won';
    return [{ type: 'won' }];
  }

  private revealAllCreatures(): void {
    for (const row of this.grid) {
      for (const cell of row) {
        if (cell.tier > 0) cell.open = true;
      }
    }
  }
}
