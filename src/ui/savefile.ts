/**
 * The save in storage, and its export and import.
 *
 * A save lives in one browser on one device, and on itch.io that is more
 * fragile than it sounds: the game runs in a third-party iframe, Safari caps
 * third-party storage and may drop it after a week away, and a player who
 * clears site data for itch clears every game they have there. So the whole
 * save — progress AND settings, because settings decide whether a clear
 * counted — can be carried out as a code and brought back.
 *
 * The code is base64 behind a prefix rather than bare JSON because it is going
 * to be pasted through chat apps, and a chat app that turns `"` into a curly
 * quote silently breaks JSON where it cannot touch base64. The prefix carries a
 * version so a later format can still read this one.
 *
 * Deliberately DOM-free, so the test pass that compiles with no DOM library can
 * reach it. Storage is read and written here, every access guarded, and so is a
 * stored value a build cannot read, which is set aside rather than written over
 * (decision 0080); files and the clipboard are the caller's business.
 */

import { plural } from './words.js';

/** Where the progress is stored (`progress.ts`). */
export const PROGRESS_KEY = 'creature-sweeper.progress.v1';
/** Where the settings are stored (`settings.ts`). */
export const SETTINGS_KEY = 'creature-sweeper.settings.v1';

const PREFIX = 'CS1:';
const FORMAT = 'creature-sweeper-save';

/** The whole save as stored: the progress and the settings, each its raw JSON. */
export interface SaveBundle {
  /** The raw progress JSON exactly as stored, or null if there was none. */
  progress: string | null;
  /** The raw settings JSON exactly as stored, or null if there was none. */
  settings: string | null;
}

interface Envelope {
  format: typeof FORMAT;
  version: 1;
  exported: string;
  /** The game's version that wrote the code, from 0.9.1 on (decision 0080); absent before. */
  game?: string;
  progress: unknown;
  settings: unknown;
}

/** Text as base64, by its UTF-8 bytes, so any character survives (`btoa` takes Latin-1 only). */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** `toBase64` undone. Throws on a code that is not base64 or not UTF-8. */
export function fromBase64(code: string): string {
  const bin = atob(code);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Whether parsed JSON is an object of named fields: not null, and not a list. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every board key of a ladder begins with this. */
export function ladderPrefix(typeId: string): string {
  return `${typeId}#`;
}

/** A board's key in the save's records and in the play statistics', so the two read side by side. */
export function boardKey(typeId: string, board: number): string {
  return `${ladderPrefix(typeId)}${board}`;
}

/**
 * Whitespace, plus the invisible characters some apps slip into a long unbroken string so that it
 * can wrap: zero-width space, non-joiner and joiner, word joiner, soft hyphen. `\s` covers none of
 * them, none is base64, and any one left in makes a code read as damaged.
 */
const PASTE_JUNK = /[\s\u00ad\u200b-\u200d\u2060]+/g;

/** A pasted code with what a chat app adds taken out: `PASTE_JUNK`, anywhere in it. */
export function compactCode(text: string): string {
  return text.trim().replace(PASTE_JUNK, '');
}

/** An envelope as a code: `prefix`, then its JSON in base64. */
export function wrapCode(prefix: string, envelope: object): string {
  return prefix + toBase64(JSON.stringify(envelope));
}

/** When a code says it was exported, if that is a date, and the version that wrote it, if any. */
export function stampOf(envelope: Record<string, unknown>): {
  exported: string | null;
  game: string | null;
} {
  const { exported, game } = envelope;
  return {
    exported: typeof exported === 'string' && !Number.isNaN(Date.parse(exported)) ? exported : null,
    game: typeof game === 'string' ? game : null,
  };
}

/** A calendar date in the player's own time zone, as YYYY-MM-DD. The obvious
 *  `toISOString().slice(0, 10)` is the UTC date, which names a save made on
 *  an evening in the Americas after the following day. */
export function localDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The stored strings as a pasteable code, stamped with the game's version that wrote it.
 *  Unparseable stored data is dropped rather than exported, so a corrupt save cannot be carried
 *  to a new device. */
export function encodeSave(bundle: SaveBundle, now: Date = new Date(), game?: string): string {
  const parse = (raw: string | null): unknown => {
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  const envelope: Envelope = {
    format: FORMAT,
    version: 1,
    exported: now.toISOString(),
    ...(game === undefined ? {} : { game }),
    progress: parse(bundle.progress),
    settings: parse(bundle.settings),
  };
  return wrapCode(PREFIX, envelope);
}

/** A code read back: the save, when and by which version it was written, or why it was refused. */
export type DecodeResult =
  | { ok: true; bundle: SaveBundle; exported: string | null; game: string | null }
  | { ok: false; error: string };

/**
 * Read a code back, refusing anything that is not a save.
 *
 * Whitespace anywhere is ignored, because a long code pasted from a chat app
 * arrives wrapped. A bare envelope in JSON is accepted too, which is what a
 * hand-edited file would be. Progress must look like a version-1 save: the
 * game would load anything else as a fresh start, so importing it would
 * silently wipe the player's progress — the one outcome import exists to
 * prevent.
 */
export function decodeSave(text: string): DecodeResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste a save code first.' };

  let json: string;
  if (trimmed.startsWith('{')) {
    json = trimmed;
  } else {
    const compact = compactCode(trimmed);
    if (!compact.startsWith(PREFIX)) {
      return { ok: false, error: 'That is not a Creature Sweeper save code.' };
    }
    try {
      json = fromBase64(compact.slice(PREFIX.length));
    } catch {
      return { ok: false, error: 'The save code is damaged — it may have been cut short.' };
    }
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(json);
  } catch {
    return { ok: false, error: 'The save code is damaged — it may have been cut short.' };
  }
  if (!isRecord(envelope) || envelope.format !== FORMAT) {
    return { ok: false, error: 'That is not a Creature Sweeper save code.' };
  }
  if (envelope.version !== 1) {
    return { ok: false, error: 'This save is from a newer version of the game.' };
  }

  const progress = envelope.progress;
  if (
    !isRecord(progress) ||
    progress.version !== 1 ||
    !isRecord(progress.types) ||
    !isRecord(progress.boards)
  ) {
    return { ok: false, error: 'The save code has no readable progress in it.' };
  }
  const settings = envelope.settings;

  return {
    ok: true,
    bundle: {
      progress: JSON.stringify(progress),
      settings: isRecord(settings) ? JSON.stringify(settings) : null,
    },
    ...stampOf(envelope),
  };
}

/** A one-line summary shown before the player commits to replacing a save. */
export function describeSave(bundle: SaveBundle): string {
  if (bundle.progress === null) return 'No progress.';
  try {
    const p = JSON.parse(bundle.progress) as {
      boards?: Record<string, { cleared?: boolean }>;
      types?: Record<string, { cleared?: boolean }>;
    };
    const boards = Object.values(p.boards ?? {}).filter((b) => b?.cleared).length;
    const types = Object.values(p.types ?? {}).filter((t) => t?.cleared).length;
    return `${plural(boards, 'board')} cleared, ${plural(types, 'game type')} finished.`;
  } catch {
    return 'Unreadable progress.';
  }
}

// ------------------------------------------------------------------ storage

/** The save exactly as stored. Blocked storage reads as no save at all. */
export function readStoredSave(): SaveBundle {
  const read = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  return { progress: read(PROGRESS_KEY), settings: read(SETTINGS_KEY) };
}

/**
 * Replace the stored save, and report whether it actually landed. A save with no settings in it
 * clears them rather than keeping this browser's, so a restore is the exported state and not a
 * mixture of two. Read back afterwards because a blocked store can fail without throwing.
 */
export function writeStoredSave(bundle: SaveBundle): boolean {
  try {
    if (bundle.progress === null) localStorage.removeItem(PROGRESS_KEY);
    else localStorage.setItem(PROGRESS_KEY, bundle.progress);
    if (bundle.settings === null) localStorage.removeItem(SETTINGS_KEY);
    else localStorage.setItem(SETTINGS_KEY, bundle.settings);
    return localStorage.getItem(PROGRESS_KEY) === bundle.progress;
  } catch {
    return false;
  }
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
export function hasKept(key: string): boolean {
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
