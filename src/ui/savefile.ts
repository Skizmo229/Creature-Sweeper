/**
 * Save export and import.
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
 * reach it. Storage, files and the clipboard are the caller's business.
 */

export const PROGRESS_KEY = 'creature-sweeper.progress.v1';
export const SETTINGS_KEY = 'creature-sweeper.settings.v1';

const PREFIX = 'CS1:';
const FORMAT = 'creature-sweeper-save';

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
  progress: unknown;
  settings: unknown;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(code: string): string {
  const bin = atob(code);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A calendar date in the player's own time zone, as YYYY-MM-DD. The obvious
 *  `toISOString().slice(0, 10)` is the UTC date, which names a save made on
 *  an evening in the Americas after the following day. */
export function localDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The stored strings as a pasteable code. Unparseable stored data is dropped
 *  rather than exported, so a corrupt save cannot be carried to a new device. */
export function encodeSave(bundle: SaveBundle, now: Date = new Date()): string {
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
    progress: parse(bundle.progress),
    settings: parse(bundle.settings),
  };
  return PREFIX + toBase64(JSON.stringify(envelope));
}

export type DecodeResult =
  { ok: true; bundle: SaveBundle; exported: string | null } | { ok: false; error: string };

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
    // Whitespace, plus the invisible characters some apps slip into a long
    // unbroken string so that it can wrap — zero-width space, non-joiner and
    // joiner, word joiner, soft hyphen. `\s` covers none of them, none is
    // base64, and any one left in makes the code read as damaged.
    const compact = trimmed.replace(/[\s\u00ad\u200b-\u200d\u2060]+/g, '');
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
    exported:
      typeof envelope.exported === 'string' && !Number.isNaN(Date.parse(envelope.exported))
        ? envelope.exported
        : null,
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
    return (
      `${boards} board${boards === 1 ? '' : 's'} cleared, ` +
      `${types} game type${types === 1 ? '' : 's'} finished.`
    );
  } catch {
    return 'Unreadable progress.';
  }
}
