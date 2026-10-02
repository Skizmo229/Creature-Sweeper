/**
 * Play statistics (docs/human-tuning-plan.md, step 4.8; decision 0060): what each board cost a
 * person, kept on this device only and never inside the save code. Per board: attempts and how
 * they ended, the cells opened by hand and how many of those were guesses (a cell opened outside
 * what was provable at that moment, marks not trusted), sweeps, casts, hints, HP lost, seconds,
 * and the tier that dealt each death. Boards played on the tuned dials and on modified ones are
 * kept apart, since only the tuned game calibrates the graded player.
 *
 * DOM-free: the data, its codec and its reading, so `src/sim/cli/telemetry.ts` and the tests
 * compile without a DOM. `telemetrystore.ts` keeps it in storage; `game/recorder.ts` tallies it.
 */

import { fromBase64, toBase64 } from './savefile.js';

export const TELEMETRY_KEY = 'creature-sweeper.telemetry.v1';

const PREFIX = 'CST1:';
const FORMAT = 'creature-sweeper-telemetry';

/** One board's totals over every attempt. */
export interface BoardStats {
  /** Attempts that ended: cleared, lost or abandoned. A paused board is not over yet. */
  attempts: number;
  cleared: number;
  lost: number;
  abandoned: number;
  /** Losses by what dealt the blow: the tier as a string, or "time" for a countdown run out. */
  deaths: Record<string, number>;
  hpLost: number;
  /** Cells opened by hand (clicks that opened, cascades counted once). */
  opens: number;
  /** Of those, cells not provably safe at that moment with marks untrusted: the player guessed. */
  guesses: number;
  sweeps: number;
  casts: number;
  hints: number;
  seconds: number;
}

/** One attempt as it ended, to be added to its board's totals. */
export interface Attempt {
  how: 'cleared' | 'lost' | 'abandoned';
  /** What dealt a loss; absent unless `how` is 'lost'. */
  deathBy?: string;
  hpLost: number;
  opens: number;
  guesses: number;
  sweeps: number;
  casts: number;
  hints: number;
  seconds: number;
}

export interface TelemetryData {
  version: 1;
  /** Boards played on dials at least as hard as the tuned game, by `boardKey`. */
  tuned: Record<string, BoardStats>;
  /** Boards played on easier dials, kept apart: they say nothing about the tuned game. */
  modified: Record<string, BoardStats>;
}

export function emptyTelemetry(): TelemetryData {
  return { version: 1, tuned: {}, modified: {} };
}

function emptyStats(): BoardStats {
  return {
    attempts: 0,
    cleared: 0,
    lost: 0,
    abandoned: 0,
    deaths: {},
    hpLost: 0,
    opens: 0,
    guesses: 0,
    sweeps: 0,
    casts: 0,
    hints: 0,
    seconds: 0,
  };
}

/** The same key the progress store uses for a board, so the two can be read side by side. */
export function boardKey(typeId: string, board: number): string {
  return `${typeId}#${board}`;
}

/** Add an attempt to its board's totals, in the bucket its dials belong to. */
export function addAttempt(
  data: TelemetryData,
  tuned: boolean,
  key: string,
  attempt: Attempt,
): void {
  const bucket = tuned ? data.tuned : data.modified;
  const stats = bucket[key] ?? emptyStats();
  stats.attempts++;
  stats[attempt.how]++;
  if (attempt.how === 'lost' && attempt.deathBy !== undefined) {
    stats.deaths[attempt.deathBy] = (stats.deaths[attempt.deathBy] ?? 0) + 1;
  }
  stats.hpLost += attempt.hpLost;
  stats.opens += attempt.opens;
  stats.guesses += attempt.guesses;
  stats.sweeps += attempt.sweeps;
  stats.casts += attempt.casts;
  stats.hints += attempt.hints;
  stats.seconds += attempt.seconds;
  bucket[key] = stats;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

const COUNTS = [
  'attempts',
  'cleared',
  'lost',
  'abandoned',
  'hpLost',
  'opens',
  'guesses',
  'sweeps',
  'casts',
  'hints',
  'seconds',
] as const;

/** A board's totals read back, or null where stored data is not the shape it was written in. */
function readStats(v: unknown): BoardStats | null {
  if (!isRecord(v) || !isRecord(v.deaths)) return null;
  const stats = emptyStats();
  for (const k of COUNTS) {
    if (!whole(v[k])) return null;
    stats[k] = v[k];
  }
  for (const [by, n] of Object.entries(v.deaths)) {
    if (!whole(n)) return null;
    stats.deaths[by] = n;
  }
  return stats;
}

function readBucket(v: unknown): Record<string, BoardStats> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, BoardStats> = {};
  for (const [key, stats] of Object.entries(v)) {
    const read = readStats(stats);
    if (!read) return null;
    out[key] = read;
  }
  return out;
}

/** Whether stored text is a record this build can read. Blank storage is: there is nothing to read. */
export function telemetryReadable(raw: string | null): boolean {
  if (!raw) return true;
  try {
    return parseTelemetry(JSON.parse(raw)) !== null;
  } catch {
    return false;
  }
}

/** The stored JSON read back; anything unreadable is an empty record, never a crash. */
export function readTelemetry(raw: string | null): TelemetryData {
  if (!raw) return emptyTelemetry();
  try {
    return parseTelemetry(JSON.parse(raw)) ?? emptyTelemetry();
  } catch {
    return emptyTelemetry();
  }
}

function parseTelemetry(v: unknown): TelemetryData | null {
  if (!isRecord(v) || v.version !== 1) return null;
  const tuned = readBucket(v.tuned);
  const modified = readBucket(v.modified);
  return tuned && modified ? { version: 1, tuned, modified } : null;
}

/** Every attempt in a bucket, and the boards they were on. */
function totals(bucket: Record<string, BoardStats>): { attempts: number; boards: number } {
  let attempts = 0;
  let boards = 0;
  for (const s of Object.values(bucket)) {
    if (s.attempts === 0) continue;
    boards++;
    attempts += s.attempts;
  }
  return { attempts, boards };
}

/** A line for the backup screen: what there is to export. */
export function describeTelemetry(data: TelemetryData): string {
  const t = totals(data.tuned);
  const m = totals(data.modified);
  if (t.attempts + m.attempts === 0) return 'Nothing played yet.';
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const tuned = `${plural(t.attempts, 'attempt')} on ${plural(t.boards, 'board')}`;
  return m.attempts
    ? `${tuned}, and ${plural(m.attempts, 'attempt')} on modified dials.`
    : `${tuned}.`;
}

/**
 * The statistics as a code the owner can paste: base64 behind a prefix, as the save code is, and
 * stamped like it with the game's version that wrote it (decision 0080).
 */
export function encodeTelemetry(
  data: TelemetryData,
  now: Date = new Date(),
  game?: string,
): string {
  const envelope = {
    format: FORMAT,
    version: 1,
    exported: now.toISOString(),
    ...(game === undefined ? {} : { game }),
    telemetry: data,
  };
  return PREFIX + toBase64(JSON.stringify(envelope));
}

export type TelemetryDecode =
  | { ok: true; data: TelemetryData; exported: string | null; game: string | null }
  | { ok: false; error: string };

/** A code read back, whitespace and the invisible characters chat apps add ignored. */
export function decodeTelemetry(text: string): TelemetryDecode {
  const compact = text.trim().replace(/[\s\u00ad\u200b-\u200d\u2060]+/g, '');
  if (!compact.startsWith(PREFIX)) return { ok: false, error: 'not a play statistics code' };
  let envelope: unknown;
  try {
    envelope = JSON.parse(fromBase64(compact.slice(PREFIX.length)));
  } catch {
    return { ok: false, error: 'the code is damaged' };
  }
  if (!isRecord(envelope) || envelope.format !== FORMAT) {
    return { ok: false, error: 'not a play statistics code' };
  }
  if (envelope.version !== 1) return { ok: false, error: 'from a newer version of the game' };
  const data = parseTelemetry(envelope.telemetry);
  if (!data) return { ok: false, error: 'the code holds no readable statistics' };
  const exported = envelope.exported;
  return {
    ok: true,
    data,
    exported: typeof exported === 'string' && !Number.isNaN(Date.parse(exported)) ? exported : null,
    game: typeof envelope.game === 'string' ? envelope.game : null,
  };
}

/** One board's totals as per-attempt figures, for a table. */
export interface StatsRow {
  key: string;
  attempts: number;
  clearRate: number;
  opens: number;
  guesses: number;
  sweeps: number;
  casts: number;
  hints: number;
  hpLost: number;
  seconds: number;
  /** "5:2 time:1", the deaths by what dealt them. */
  deaths: string;
}

/** A bucket's boards as rows, in ladder order then board order. */
export function statsRows(bucket: Record<string, BoardStats>): StatsRow[] {
  const per = (n: number, s: BoardStats) => n / Math.max(1, s.attempts);
  return Object.entries(bucket)
    .filter(([, s]) => s.attempts > 0)
    .sort(([a], [b]) => {
      const [la, na] = a.split('#');
      const [lb, nb] = b.split('#');
      return la === lb ? Number(na) - Number(nb) : la!.localeCompare(lb!);
    })
    .map(([key, s]) => ({
      key,
      attempts: s.attempts,
      clearRate: s.cleared / s.attempts,
      opens: per(s.opens, s),
      guesses: per(s.guesses, s),
      sweeps: per(s.sweeps, s),
      casts: per(s.casts, s),
      hints: per(s.hints, s),
      hpLost: per(s.hpLost, s),
      seconds: per(s.seconds, s),
      deaths: Object.entries(s.deaths)
        .sort()
        .map(([by, n]) => `${by}:${n}`)
        .join(' '),
    }));
}
