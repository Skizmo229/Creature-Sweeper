/**
 * Carry the save out of this browser and back in. A save is one browser on one device, and
 * inside itch.io's iframe it is third-party storage, which Safari caps and may clear. So the whole
 * save leaves as a code the player can keep, copied or downloaded, and comes back by pasting or
 * loading it; both routes exist because the embed can block either one (decision 0022).
 */

import { el, link } from '../dom.js';
import type { AskOptions } from '../overlays/ask.js';
import {
  type SaveBundle,
  decodeSave,
  describeSave,
  encodeSave,
  localDate,
  readStoredSave,
  writeStoredSave,
} from '../savefile.js';
import { describeTelemetry, encodeTelemetry } from '../telemetry.js';
import { VERSION } from '../version.js';
import { TelemetryStore } from '../telemetrystore.js';
import { SOURCE_URL } from './about.js';

/** Where a play-tester sends the statistics: the repository's play-test report (decision 0085). */
export const PLAYTEST_REPORT_URL = `${SOURCE_URL}/issues/new?template=playtest.yml`;

/** What the backup card asks of the modal that shows it. */
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
  const code = encodeSave(current, new Date(), VERSION);

  const overlay = el('div', 'overlay win');
  const card = el('div', 'overlay-card backup');
  card.append(el('h2', undefined, 'SAVE BACKUP'));
  card.append(
    el(
      'p',
      'overlay-note',
      'Your save lives in this browser only. Keep this code to move it or get it back.',
    ),
  );

  appendExport(card, current, code);
  appendRestore(card, current, draft, error, a);
  appendStatistics(card);

  overlay.append(card);
  return overlay;
}

/** A button that copies a code, selecting it in its box; says so, or says what to do instead. */
function copyButton(box: HTMLTextAreaElement, code: string, style: string): HTMLButtonElement {
  const copy = el('button', style, 'Copy code');
  copy.addEventListener('click', async () => {
    box.select();
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
  return copy;
}

/** The way out: this browser's save as a code, to copy or to download as a file. */
function appendExport(card: HTMLElement, current: SaveBundle, code: string): void {
  card.append(el('p', 'backup-label', `This browser — ${describeSave(current)}`));
  const out = codeBox(code, 4);
  card.append(out);

  const exportRow = el('div', 'overlay-actions');
  const copy = copyButton(out, code, 'primary');
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

  const file = fileLoader(input, err);
  card.append(file);

  const importRow = el('div', 'overlay-actions');
  const restore = el('button', 'primary', 'Restore');
  restore.addEventListener('click', () => confirmRestore(input, err, current, a));
  const load = el('button', 'ghost', 'Load file');
  load.addEventListener('click', () => file.click());
  const close = el('button', 'ghost', 'Close');
  close.addEventListener('click', a.close);
  importRow.append(restore, load, close);
  card.append(importRow);
}

/** A read-only box holding a code, `rows` lines high, that selects the code when focused. */
function codeBox(value: string, rows: number): HTMLTextAreaElement {
  const box = el('textarea', 'backup-code');
  box.readOnly = true;
  box.value = value;
  box.rows = rows;
  box.addEventListener('focus', () => box.select());
  return box;
}

/** A hidden file input that loads the chosen file's text into `input`, or says in `err` why not. */
function fileLoader(input: HTMLTextAreaElement, err: HTMLElement): HTMLInputElement {
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
  return file;
}

/**
 * Restore the code in `input`: refused in `err` when it is not a save, otherwise asked about
 * first, since it replaces this browser's save, `current`.
 */
function confirmRestore(
  input: HTMLTextAreaElement,
  err: HTMLElement,
  current: SaveBundle,
  a: SaveBackupActions,
): void {
  const result = decodeSave(input.value);
  if (!result.ok) {
    err.textContent = result.error;
    return;
  }
  const stamp = [
    result.exported && `saved ${localDate(new Date(result.exported))}`,
    result.game && `version ${result.game}`,
  ].filter(Boolean);
  const from = stamp.length ? ` (${stamp.join(', ')})` : '';
  a.ask({
    title: 'REPLACE SAVE?',
    body:
      `Restoring: ${describeSave(result.bundle)}${from} ` +
      `This replaces the save in this browser: ${describeSave(current)}`,
    confirmLabel: 'Replace my save',
    cancelLabel: 'Cancel',
    // The question took the card's place; a change of mind gets the card back, code and all.
    onCancel: () => a.reopen(input.value, ''),
    onConfirm: () => {
      // Reloading is the only way every store, progress, settings and the live board, picks
      // the restored save up at once.
      if (writeStoredSave(result.bundle)) {
        window.location.reload();
      } else {
        a.reopen(input.value, 'This browser is blocking saved data, so nothing could be restored.');
      }
    },
  });
}

/**
 * The play statistics (`src/ui/telemetry.ts`), as a code to paste into a play-test report. Read
 * straight from storage, as the save is; they leave this device only this way, pasted by the
 * player, and never inside the save code. Cleared with the progress, from the ladder list.
 */
function appendStatistics(card: HTMLElement): void {
  const data = TelemetryStore.load().current;
  card.append(el('p', 'backup-label', `Play statistics — ${describeTelemetry(data)}`));
  const note = el(
    'p',
    'overlay-note',
    'What each board cost you: attempts, guesses, HP, time. Kept on this device only; to help ' +
      'tune the game, paste the code into a ',
  );
  note.append(link(PLAYTEST_REPORT_URL, 'play-test report'), '.');
  card.append(note);
  const out = codeBox(encodeTelemetry(data, new Date(), VERSION), 3);
  card.append(out);
  const row = el('div', 'overlay-actions');
  row.append(copyButton(out, out.value, 'ghost'));
  card.append(row);
}
