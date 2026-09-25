/**
 * Carry the save out of this browser and back in. A save is one browser on one device, and
 * inside itch.io's iframe it is third-party storage, which Safari caps and may clear. So the whole
 * save leaves as a code the player can keep, copied or downloaded, and comes back by pasting or
 * loading it; both routes exist because the embed can block either one (decision 0022).
 */

import { el } from '../dom.js';
import type { AskOptions } from '../overlays/ask.js';
import {
  PROGRESS_KEY,
  SETTINGS_KEY,
  type SaveBundle,
  decodeSave,
  describeSave,
  encodeSave,
  localDate,
} from '../savefile.js';

/** The save exactly as stored. Blocked storage reads as no save at all. */
function readStoredSave(): SaveBundle {
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
function writeStoredSave(bundle: SaveBundle): boolean {
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

export interface SaveBackupActions {
  /** Ask before replacing the save. */
  ask(opts: AskOptions): void;
  close(): void;
  /** Rebuild this screen with the draft and an error kept, after a failed restore. */
  reopen(draft: string, error: string): void;
}

/** The backup overlay. The caller registers it as the modal so every rebuild closes it. */
export function buildSaveBackup(draft: string, error: string, a: SaveBackupActions): HTMLElement {
  const current = readStoredSave();
  const code = encodeSave(current);

  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card backup');
  card.append(el('h2', undefined, 'SAVE BACKUP'));
  card.append(
    el(
      'p',
      'overlay-note',
      'Your save lives in this browser only. Keep a copy of this code to move it to ' +
        'another device, or to get it back if the browser clears its data.',
    ),
  );

  appendExport(card, current, code);
  appendRestore(card, current, draft, error, a);

  overlay.append(card);
  return overlay;
}

/** The way out: this browser's save as a code, to copy or to download as a file. */
function appendExport(card: HTMLElement, current: SaveBundle, code: string): void {
  card.append(el('p', 'backup-label', `This browser — ${describeSave(current)}`));
  const out = el('textarea', 'backup-code');
  out.readOnly = true;
  out.value = code;
  out.rows = 4;
  out.addEventListener('focus', () => out.select());
  card.append(out);

  const exportRow = el('div', 'overlay-actions');
  const copy = el('button', 'primary', 'Copy code');
  copy.addEventListener('click', async () => {
    out.select();
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      try {
        copied = document.execCommand('copy');
      } catch {
        /* fall through */
      }
    }
    copy.textContent = copied ? 'Copied' : 'Select the code and copy it';
  });
  const download = el('button', 'ghost', 'Download file');
  download.addEventListener('click', () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = el('a');
    link.href = url;
    link.download = `creature-sweeper-save-${localDate(new Date())}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  exportRow.append(copy, download);
  card.append(exportRow);
}

/**
 * The way back in: a code pasted or loaded from a file, checked, and restored only after the
 * player confirms, because it replaces this browser's save.
 */
function appendRestore(
  card: HTMLElement,
  current: SaveBundle,
  draft: string,
  error: string,
  a: SaveBackupActions,
): void {
  card.append(el('p', 'backup-label', 'Restore — paste a code or load a file'));
  const input = el('textarea', 'backup-code');
  input.rows = 4;
  input.placeholder = 'CS1:…';
  input.value = draft;
  card.append(input);
  const err = el('p', 'overlay-note backup-error', error);
  card.append(err);

  const file = el('input');
  file.type = 'file';
  file.accept = '.txt,.json,text/plain,application/json';
  file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      input.value = await f.text();
      err.textContent = '';
    } catch {
      err.textContent = 'That file could not be read.';
    }
  });
  card.append(file);

  const importRow = el('div', 'overlay-actions');
  const restore = el('button', 'primary', 'Restore');
  restore.addEventListener('click', () => {
    const result = decodeSave(input.value);
    if (!result.ok) {
      err.textContent = result.error;
      return;
    }
    const from = result.exported ? ` (saved ${localDate(new Date(result.exported))})` : '';
    a.ask({
      title: 'REPLACE SAVE?',
      body:
        `Restoring: ${describeSave(result.bundle)}${from} ` +
        `This replaces the save in this browser: ${describeSave(current)}`,
      confirmLabel: 'Replace my save',
      cancelLabel: 'Cancel',
      onConfirm: () => {
        // Reloading is the only way every store, progress, settings and the live board, picks
        // the restored save up at once.
        if (writeStoredSave(result.bundle)) {
          window.location.reload();
        } else {
          a.reopen(
            input.value,
            'This browser is blocking saved data, so nothing could be restored.',
          );
        }
      },
    });
  });
  const load = el('button', 'ghost', 'Load file');
  load.addEventListener('click', () => file.click());
  const close = el('button', 'ghost', 'Close');
  close.addEventListener('click', a.close);
  importRow.append(restore, load, close);
  card.append(importRow);
}
