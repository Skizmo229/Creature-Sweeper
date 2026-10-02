/**
 * Paused games: one board per board of a ladder, and one Full Run per ladder (decision 0057). A
 * paused game is the seed, the dials and the moves (`src/engine/replay.ts`), with the clock, the
 * tutor's count and a fingerprint of where the moves reached.
 *
 * It is the live board, never a checkpoint: it is written after every move and deleted the moment
 * the board ends, so pausing before a guess and taking it back after is not something it can do.
 * Each slot is its own storage key, so a write is one small game and a bad slot spoils nothing
 * else. A token says which tab is keeping a game: a slot taken up in another tab, or ended there,
 * is not written over by the copy this tab still holds.
 *
 * localStorage can throw or come back empty, so every access is guarded, as in `progress.ts`.
 */

import type { FullRunLeg } from '../engine/run.js';
import { DEFAULT_GAMEPLAY, type GameplaySettings } from '../engine/settings.js';
import type { MoveCode } from '../engine/replay.js';

/** Every paused game's key begins with this; nothing else in storage does. */
const PAUSED_PREFIX = 'creature-sweeper.paused.v1:';

/** One paused game as stored: enough to replay it, check the replay, and list it unreplayed. */
export interface PausedGame {
  typeId: string;
  /** The board being played; in a run, the board of the run it has reached. */
  board: number;
  /** The board's seed, or for a run, the run's. */
  seed: number;
  /** The dials the game was dealt with, which it keeps whatever the settings say now. */
  gameplay: GameplaySettings;
  /** A run's cleared boards; absent on a single board. */
  legs?: FullRunLeg[];
  moves: MoveCode[];
  /** `boardDigest` of the board the moves reached. */
  digest: string;
  /** The digest's version (`DIGEST_VERSION`); absent on a game paused by 0.9.1 or before, version 1. */
  digestVersion?: number;
  /** The clock, which stands still while the game is paused. */
  elapsedMs: number;
  /** Time Attack's countdown, in seconds, or null. */
  timeLimit: number | null;
  /** The tutor's presses on this board and over this run. */
  hints: number;
  runHints: number;
  /** For the board list: where the game stands, without replaying it. */
  hp: number;
  maxHp: number;
  token: string;
}

/** Which game a slot holds: a single board of a ladder, or the ladder's run. */
export type Slot = { typeId: string; board: number } | { typeId: string; run: true };

const keyOf = (slot: Slot): string =>
  'run' in slot
    ? `${PAUSED_PREFIX}run:${slot.typeId}`
    : `${PAUSED_PREFIX}board:${slot.typeId}#${slot.board}`;

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A stored game, read back: stored data is never trusted to be the shape it was written in. */
function readGame(raw: string | null): PausedGame | null {
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as Partial<PausedGame>;
    const fits =
      typeof g.typeId === 'string' &&
      whole(g.board) &&
      whole(g.seed) &&
      typeof g.gameplay === 'object' &&
      g.gameplay !== null &&
      Array.isArray(g.moves) &&
      typeof g.digest === 'string' &&
      (g.digestVersion === undefined || whole(g.digestVersion)) &&
      typeof g.elapsedMs === 'number' &&
      (g.timeLimit === null || typeof g.timeLimit === 'number') &&
      whole(g.hints) &&
      whole(g.runHints) &&
      whole(g.hp) &&
      whole(g.maxHp) &&
      typeof g.token === 'string' &&
      (g.legs === undefined || Array.isArray(g.legs));
    if (!fits) return null;
    return { ...g, gameplay: { ...DEFAULT_GAMEPLAY, ...g.gameplay } } as PausedGame;
  } catch {
    return null;
  }
}

/** A token for a game taken up in this tab. Not a secret, only different from the last one. */
export function newToken(): string {
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
}

/** The paused games in storage, a slot at a time; every access is guarded. */
export const pausedGames = {
  /** The game paused in a slot, or null. */
  get(slot: Slot): PausedGame | null {
    try {
      return readGame(localStorage.getItem(keyOf(slot)));
    } catch {
      return null;
    }
  },

  /**
   * Keep a game in its slot. `claim` takes the slot whatever holds it, for a game just begun or
   * just taken up; otherwise the write happens only while the slot still holds this game's token,
   * and false says it did not, so the caller stops keeping a game another tab has taken.
   */
  put(slot: Slot, game: PausedGame, claim: boolean): boolean {
    try {
      if (!claim && readGame(localStorage.getItem(keyOf(slot)))?.token !== game.token) return false;
      localStorage.setItem(keyOf(slot), JSON.stringify(game));
      return true;
    } catch {
      return false;
    }
  },

  /** A game has ended or been abandoned: empty its slot, if the slot is still this game's. */
  drop(slot: Slot, token?: string): void {
    try {
      const held = readGame(localStorage.getItem(keyOf(slot)));
      if (token === undefined || held?.token === token) localStorage.removeItem(keyOf(slot));
    } catch {
      // Nothing to do; a slot that cannot be read cannot be resumed either.
    }
  },

  /** How many games are paused on a ladder, runs included, for the ladder list. */
  countOn(typeId: string): number {
    const board = `${PAUSED_PREFIX}board:${typeId}#`;
    const run = `${PAUSED_PREFIX}run:${typeId}`;
    return storedKeys().filter((k) => k.startsWith(board) || k === run).length;
  },

  /** Every paused game on this device, gone: the ladder list's erase takes them with the rest. */
  clearAll(): void {
    try {
      for (const k of storedKeys()) localStorage.removeItem(k);
    } catch {
      // As above.
    }
  },
};

function storedKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PAUSED_PREFIX)) keys.push(k);
    }
    return keys;
  } catch {
    return [];
  }
}
