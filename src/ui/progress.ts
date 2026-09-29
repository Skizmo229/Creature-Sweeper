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

import { type Ladders, boardFingerprint, ladderFingerprint } from '../engine/config.js';
import { PROGRESS_KEY as KEY } from './savefile.js';

export interface BoardRecord {
  cleared: boolean;
  /** Cleared without losing a single point of HP. */
  perfect: boolean;
  /** Best clear time in seconds. */
  bestTime: number | null;
  /**
   * Fewest hints on a hinted clear, kept only while no clear without hints has set a best time
   * (decision 0065). Absent in saves written before it, and on boards never cleared with hints.
   */
  fewestHints?: number;
  /**
   * The board this record was set on, as `boardFingerprint` writes it (decision 0079). Absent in
   * saves from before it, which are taken as set on the board as it is now.
   */
  fingerprint?: string;
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
  /** Fewest hints on a completed hinted run, kept as a board's is (`BoardRecord.fewestHints`). */
  fewestHints?: number;
  attempts: number;
  /** The ladder this record was set on, as `ladderFingerprint` writes it (decision 0079). */
  fingerprint?: string;
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
  /** "Unlock everything": ignore the unlock chain; clears still count (decision 0066). */
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
  /** The school's lessons finished, by id. Absent in saves written before the school. */
  lessons: string[];
  /** Ladders whose first-visit card has been shown, by id. Absent in saves before the cards. */
  ladderCards: string[];
}

/**
 * Where a stored value this build could not read is kept, beside the fresh one that replaces it
 * (decision 0080): a save from a newer version, or a damaged one, is set aside rather than
 * written over, so a later build, or a person, can still get at it.
 */
export function keptKey(key: string): string {
  return `${key}.unreadable`;
}

/** Set an unreadable stored value aside under its kept key. Storage that throws keeps nothing. */
export function keepUnreadable(key: string, raw: string): void {
  try {
    localStorage.setItem(keptKey(key), raw);
  } catch {
    // Blocked storage: nothing could be read from it, and nothing can be written to it.
  }
}

/** Whether something is kept aside under this key. */
function hasKept(key: string): boolean {
  try {
    return localStorage.getItem(keptKey(key)) !== null;
  } catch {
    return false;
  }
}

/** Let what was kept aside under this key go, as Reset progress does. */
export function dropKept(key: string): void {
  try {
    localStorage.removeItem(keptKey(key));
  } catch {
    // Nothing to do.
  }
}

function emptySave(): SaveData {
  return {
    version: 1,
    types: {},
    boards: {},
    runs: {},
    scaling: {},
    unlockAll: false,
    seenHowTo: false,
    lessons: [],
    ladderCards: [],
  };
}

/** Every board key of a ladder begins with this. */
function ladderPrefix(typeId: string): string {
  return `${typeId}#`;
}

function boardKey(typeId: string, board: number): string {
  return `${ladderPrefix(typeId)}${board}`;
}

/**
 * A clear's best time and fewest hints, from the previous record's. A clear without hints races
 * the clock, and its time retires the hint count. A hinted clear sets no best time; while there is
 * none, it keeps the fewest hints instead (decision 0065).
 */
function bestOf(
  prev: { bestTime: number | null; fewestHints?: number },
  seconds: number,
  hints: number,
): { bestTime: number | null; fewestHints?: number } {
  if (hints === 0) {
    return { bestTime: prev.bestTime === null ? seconds : Math.min(prev.bestTime, seconds) };
  }
  if (prev.bestTime !== null) return { bestTime: prev.bestTime };
  return { bestTime: null, fewestHints: Math.min(prev.fewestHints ?? hints, hints) };
}

export class Progress {
  private data: SaveData;

  constructor(data: SaveData = emptySave()) {
    this.data = data;
  }

  static load(): Progress {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveData;
        if (parsed.version === 1) return new Progress({ ...emptySave(), ...parsed });
      }
    } catch {
      // Unreadable or blocked storage just means a fresh run.
    }
    // A save this build cannot read, a newer version's or a damaged one, is set aside rather than
    // written over by the fresh one (decision 0080). Blocked storage read nothing, and keeps nothing.
    if (raw) keepUnreadable(KEY, raw);
    return new Progress();
  }

  /** Whether a save this build could not read is kept aside, which the ladder list says. */
  get unreadableKept(): boolean {
    return hasKept(KEY);
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

  /** Whether a school lesson has been taken to its end. Nothing waits on it (principle 7). */
  lessonDone(id: string): boolean {
    return this.data.lessons.includes(id);
  }

  markLessonDone(id: string): void {
    if (this.lessonDone(id)) return;
    this.data.lessons.push(id);
    this.save();
  }

  /** Whether a ladder's first-visit card has been shown, which it is once. */
  ladderCardSeen(typeId: string): boolean {
    return this.data.ladderCards.includes(typeId);
  }

  markLadderCardSeen(typeId: string): void {
    if (this.ladderCardSeen(typeId)) return;
    this.data.ladderCards.push(typeId);
    this.save();
  }

  typeRecord(typeId: string): TypeRecord {
    return this.data.types[typeId] ?? { highestBoard: 1, cleared: false };
  }

  /**
   * A ladder's Full Run record as it applies to the ladder as it is tuned now. A record set on
   * another tuning (decision 0079) keeps its clear, how deep it reached and its attempts, and
   * offers no time and no HP, which were another ladder's.
   */
  runRecord(ladders: Ladders, typeId: string): FullRunRecord {
    const rec = this.data.runs[typeId];
    if (!rec) return { cleared: false, bestBoard: 0, bestHp: null, bestTime: null, attempts: 0 };
    if (rec.fingerprint !== undefined && rec.fingerprint !== ladderFingerprint(ladders, typeId)) {
      const { cleared, bestBoard, attempts } = rec;
      return { cleared, bestBoard, bestHp: null, bestTime: null, attempts };
    }
    return rec;
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
    ladders: Ladders,
    typeId: string,
    opts: {
      completed: boolean;
      reachedBoard: number;
      hp: number;
      seconds: number;
      /** Times the tutor was asked over the run. */
      hints?: number;
    },
  ): void {
    const prev = this.runRecord(ladders, typeId);
    // A run the tutor helped with is cleared and counts, but races nothing.
    const { bestTime, fewestHints } = opts.completed
      ? bestOf(prev, opts.seconds, opts.hints ?? 0)
      : prev;
    this.data.runs[typeId] = {
      cleared: prev.cleared || opts.completed,
      bestBoard: Math.max(prev.bestBoard, opts.reachedBoard),
      bestHp: opts.completed ? Math.max(prev.bestHp ?? 0, opts.hp) : prev.bestHp,
      bestTime,
      ...(fewestHints === undefined ? {} : { fewestHints }),
      attempts: prev.attempts + 1,
      fingerprint: ladderFingerprint(ladders, typeId),
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

  /**
   * A board's record as it applies to the board as it is tuned now. A record set on another
   * tuning of the board (decision 0079) keeps its clear, which unlocked what it unlocked, and
   * offers no time and no perfect, which were another board's; the next clear writes over it.
   */
  boardRecord(ladders: Ladders, typeId: string, board: number): BoardRecord {
    const rec = this.data.boards[boardKey(typeId, board)];
    if (!rec) return { cleared: false, perfect: false, bestTime: null };
    if (
      rec.fingerprint !== undefined &&
      rec.fingerprint !== boardFingerprint(ladders, typeId, board)
    ) {
      return { cleared: rec.cleared, perfect: false, bestTime: null };
    }
    return rec;
  }

  /**
   * Distinct boards cleared, anywhere in the game or on the one ladder named.
   *
   * Every board counts once, including the scaling boards past 10 — they are
   * boards you cleared, and a player who would rather go deep on one ladder
   * than wide across several should get there too.
   */
  boardsCleared(typeId?: string): number {
    const prefix = typeId === undefined ? '' : ladderPrefix(typeId);
    let n = 0;
    for (const key of Object.keys(this.data.boards)) {
      if (key.startsWith(prefix) && this.data.boards[key]?.cleared) n++;
    }
    return n;
  }

  /**
   * A type opens once it has all of its gates.
   *
   * `requires` is readiness — the ladders this one assumes you have played.
   * `requires_boards` is time served, counted across the whole game. A type
   * may carry either, both or neither.
   */
  isTypeUnlocked(ladders: Ladders, typeId: string): boolean {
    if (this.data.unlockAll) return true;
    const type = ladders.find((t) => t.id === typeId);
    if (!type) return false;
    if (this.boardsCleared() < type.requires_boards) return false;
    return type.requires.every((req) => this.typeRecord(req).cleared);
  }

  /** Selection is one predicate: you may replay anything you have reached. */
  isBoardUnlocked(ladders: Ladders, typeId: string, board: number): boolean {
    if (this.data.unlockAll) return true;
    if (!this.isTypeUnlocked(ladders, typeId)) return false;
    return board <= this.typeRecord(typeId).highestBoard;
  }

  /**
   * Record a clear and advance the ladder. Returns the newly unlocked board. A board the tutor
   * helped with (`hints`) is cleared, unlocks the next and may be perfect, but sets no best time:
   * the one cost of asking why (docs/teaching-plan.md, 4.4). Until a best time exists, it keeps
   * the fewest hints instead (decision 0065).
   */
  recordClear(
    ladders: Ladders,
    typeId: string,
    board: number,
    opts: { perfect: boolean; seconds: number; hints?: number },
  ): { unlockedBoard: number | null; clearedType: boolean } {
    const type = ladders.find((t) => t.id === typeId);
    const lastBoard = type?.boards.length ?? 10;

    const key = boardKey(typeId, board);
    const prev = this.boardRecord(ladders, typeId, board);
    this.data.boards[key] = {
      cleared: true,
      perfect: prev.perfect || opts.perfect,
      ...bestOf(prev, opts.seconds, opts.hints ?? 0),
      fingerprint: boardFingerprint(ladders, typeId, board),
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
    dropKept(KEY);
  }
}
