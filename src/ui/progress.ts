/**
 * Saved progress.
 *
 * Unlocks are permanent: every board you have reached stays selectable after a
 * loss, after quitting, across sessions. Losing costs the attempt, never the
 * progress.
 *
 * localStorage can throw or come back empty (private windows, blocked site
 * data), so every access is guarded and the game works fine without it.
 */

import type { Ladders } from '../engine/config.js';
import { PROGRESS_KEY as KEY } from './savefile.js';

export interface BoardRecord {
  cleared: boolean;
  /** Cleared without losing a single point of HP. */
  perfect: boolean;
  /** Best clear time in seconds. */
  bestTime: number | null;
}

export interface TypeRecord {
  /** Highest board index unlocked; you always start with board 1. */
  highestBoard: number;
  /** Board 10 beaten — the type is cleared and unlocks what it gates. */
  cleared: boolean;
}

/**
 * A type's Full Run history.
 *
 * `bestBoard` is how deep the best attempt reached, so an unfinished run still
 * leaves a mark — the mode is long enough that "board 7" is the only honest
 * thing to show for an hour's play.
 */
export interface FullRunRecord {
  cleared: boolean;
  /** Deepest board reached by any attempt, 1-based. */
  bestBoard: number;
  /** HP left at the end of the best completed run. */
  bestHp: number | null;
  /** Best completed-run time in seconds. */
  bestTime: number | null;
  attempts: number;
}

export interface SaveData {
  version: 1;
  types: Record<string, TypeRecord>;
  boards: Record<string, BoardRecord>;
  /** Full Run history per type. Absent in saves written before the mode. */
  runs: Record<string, FullRunRecord>;
  /**
   * Where the scaling picker was left, per type.
   *
   * Remembered because the continuation runs to board 34 on some ladders, and
   * clicking an arrow twenty times to get back to where you were is not a
   * choice anyone makes twice.
   */
  scaling: Record<string, number>;
  /** Prototype escape hatch: ignore the unlock chain. */
  unlockAll: boolean;
  /**
   * The rules card has been shown once, so it stops opening itself.
   *
   * Absent in saves written before it existed, which `load` handles by
   * spreading an empty save underneath — an older save is simply a player who
   * has not seen it, and showing it once to a returning player is a far
   * smaller cost than never showing it to a new one.
   */
  seenHowTo: boolean;
}

function emptySave(): SaveData {
  return {
    version: 1, types: {}, boards: {}, runs: {}, scaling: {},
    unlockAll: false, seenHowTo: false,
  };
}

export function boardKey(typeId: string, board: number): string {
  return `${typeId}#${board}`;
}

export class Progress {
  private data: SaveData;

  constructor(data: SaveData = emptySave()) {
    this.data = data;
  }

  static load(): Progress {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveData;
        if (parsed.version === 1) return new Progress({ ...emptySave(), ...parsed });
      }
    } catch {
      // Unreadable or blocked storage just means a fresh run.
    }
    return new Progress();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Nothing to do; the session still plays correctly.
    }
  }

  get unlockAll(): boolean {
    return this.data.unlockAll;
  }

  setUnlockAll(on: boolean): void {
    this.data.unlockAll = on;
    this.save();
  }

  get seenHowTo(): boolean {
    return this.data.seenHowTo;
  }

  markHowToSeen(): void {
    this.data.seenHowTo = true;
    this.save();
  }

  typeRecord(typeId: string): TypeRecord {
    return this.data.types[typeId] ?? { highestBoard: 1, cleared: false };
  }

  runRecord(typeId: string): FullRunRecord {
    return this.data.runs[typeId] ?? {
      cleared: false, bestBoard: 0, bestHp: null, bestTime: null, attempts: 0,
    };
  }

  /**
   * Full Run opens once the type's board 10 is cleared.
   *
   * Deliberately the type's own clear and nothing else: a run is a victory lap
   * down a ladder you have already walked, so it can never be the way a player
   * first meets a board.
   */
  isFullRunUnlocked(ladders: Ladders, typeId: string): boolean {
    if (this.data.unlockAll) return true;
    if (!this.isTypeUnlocked(ladders, typeId)) return false;
    return this.typeRecord(typeId).cleared;
  }

  /** Record how a run ended. Runs never advance the board ladder — every
   *  board of a run was already cleared, or the run would not have opened. */
  recordRun(
    typeId: string,
    opts: { completed: boolean; reachedBoard: number; hp: number; seconds: number },
  ): void {
    const prev = this.runRecord(typeId);
    this.data.runs[typeId] = {
      cleared: prev.cleared || opts.completed,
      bestBoard: Math.max(prev.bestBoard, opts.reachedBoard),
      bestHp: opts.completed
        ? Math.max(prev.bestHp ?? 0, opts.hp)
        : prev.bestHp,
      bestTime: opts.completed
        ? (prev.bestTime === null ? opts.seconds : Math.min(prev.bestTime, opts.seconds))
        : prev.bestTime,
      attempts: prev.attempts + 1,
    };
    this.save();
  }

  /**
   * Scaling boards open on the same condition a Full Run does: board 10.
   *
   * Same reasoning too — the continuation is the ladder carried on past its
   * end, so meeting it before finishing the ladder would be meeting the
   * ladder out of order.
   */
  isScalingUnlocked(ladders: Ladders, typeId: string): boolean {
    if (this.data.unlockAll) return true;
    if (!this.isTypeUnlocked(ladders, typeId)) return false;
    return this.typeRecord(typeId).cleared;
  }

  /** The scaling board this type is pointed at. Never below the first one. */
  scalingBoard(typeId: string, first: number, last: number): number {
    const saved = this.data.scaling[typeId] ?? first;
    return Math.min(last, Math.max(first, saved));
  }

  setScalingBoard(typeId: string, board: number): void {
    this.data.scaling[typeId] = board;
    this.save();
  }

  boardRecord(typeId: string, board: number): BoardRecord {
    return this.data.boards[boardKey(typeId, board)] ?? {
      cleared: false, perfect: false, bestTime: null,
    };
  }

  /**
   * Distinct boards cleared, anywhere in the game.
   *
   * Every board counts once, including the scaling boards past 10 — they are
   * boards you cleared, and a player who would rather go deep on one ladder
   * than wide across several should get there too.
   */
  boardsCleared(): number {
    let n = 0;
    for (const key of Object.keys(this.data.boards)) {
      if (this.data.boards[key]?.cleared) n++;
    }
    return n;
  }

  /**
   * Types with a completed Full Run. Each type counts once however many times
   * it has been run, which is what "separate" means in the BLIND gate.
   */
  fullRunsCompleted(): number {
    return Object.values(this.data.runs).filter((r) => r.cleared).length;
  }

  /**
   * A type opens once it has all of its gates.
   *
   * `requires` is readiness — the ladders this one assumes you have played.
   * `requires_boards` is time served, counted across the whole game.
   * `requires_runs` is Full Runs completed on distinct types. A type may carry
   * any of them or none.
   */
  isTypeUnlocked(ladders: Ladders, typeId: string): boolean {
    if (this.data.unlockAll) return true;
    const type = ladders.find((t) => t.id === typeId);
    if (!type) return false;
    if (this.boardsCleared() < type.requires_boards) return false;
    if (this.fullRunsCompleted() < type.requires_runs) return false;
    return type.requires.every((req) => this.typeRecord(req).cleared);
  }

  /** Selection is one predicate: you may replay anything you have reached. */
  isBoardUnlocked(ladders: Ladders, typeId: string, board: number): boolean {
    if (this.data.unlockAll) return true;
    if (!this.isTypeUnlocked(ladders, typeId)) return false;
    return board <= this.typeRecord(typeId).highestBoard;
  }

  /** Record a clear and advance the ladder. Returns the newly unlocked board. */
  recordClear(
    ladders: Ladders,
    typeId: string,
    board: number,
    opts: { perfect: boolean; seconds: number },
  ): { unlockedBoard: number | null; clearedType: boolean } {
    const type = ladders.find((t) => t.id === typeId);
    const lastBoard = type?.boards.length ?? 10;

    const key = boardKey(typeId, board);
    const prev = this.boardRecord(typeId, board);
    this.data.boards[key] = {
      cleared: true,
      perfect: prev.perfect || opts.perfect,
      bestTime: prev.bestTime === null ? opts.seconds : Math.min(prev.bestTime, opts.seconds),
    };

    const rec = this.typeRecord(typeId);
    let unlockedBoard: number | null = null;
    if (board >= rec.highestBoard && board < lastBoard) {
      unlockedBoard = board + 1;
      rec.highestBoard = unlockedBoard;
    }
    const clearedType = rec.cleared || board >= lastBoard;
    this.data.types[typeId] = { highestBoard: rec.highestBoard, cleared: clearedType };

    this.save();
    return { unlockedBoard, clearedType: clearedType && !rec.cleared ? true : clearedType };
  }

  reset(): void {
    this.data = emptySave();
    this.save();
  }
}
