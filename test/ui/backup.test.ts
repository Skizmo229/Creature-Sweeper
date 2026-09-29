// @vitest-environment happy-dom
/**
 * The save backup card (decision 0022): restoring asks before it replaces the save, and saying no
 * to that question hands the card back with the pasted code still in it, whether the answer is the
 * Cancel button or Escape. The modal holds one overlay at a time, so the question replaces the
 * card; the cancel path is what brings it back.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { encodeSave } from '../../src/ui/savefile.js';

const progress = JSON.stringify({
  version: 1,
  types: { easy: { highestBoard: 10, cleared: true } },
  boards: { 'easy#1': { cleared: true, perfect: false, bestTime: 42 } },
  runs: {},
  scaling: {},
  unlockAll: false,
  seenHowTo: true,
});
const code = encodeSave({ progress, settings: null });

const card = (): HTMLElement | null => document.querySelector('.overlay-card.backup');
const button = (root: ParentNode, label: string): HTMLButtonElement =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;
/** The restore box: the second code box on the card, after the export. */
const restoreBox = (): HTMLTextAreaElement =>
  card()!.querySelectorAll<HTMLTextAreaElement>('textarea.backup-code')[1];
const question = (): HTMLElement | null => document.querySelector('.overlay.lose');

const openBackup = (): void => button(document, 'Back up / restore save').click();
/** Paste a valid code and press Restore, which asks REPLACE SAVE? */
const askToRestore = (): void => {
  restoreBox().value = code;
  button(card()!, 'Restore').click();
};

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  new App(document.getElementById('app')!);
});

describe('cancelling REPLACE SAVE?', () => {
  it('asks over the card, replacing it', () => {
    openBackup();
    askToRestore();
    expect(question()?.querySelector('h2')?.textContent).toBe('REPLACE SAVE?');
    expect(card()).toBeNull();
  });

  it('with the Cancel button brings the card back with the pasted code', () => {
    openBackup();
    askToRestore();
    button(question()!, 'Cancel').click();
    expect(question()).toBeNull();
    expect(card()).not.toBeNull();
    expect(restoreBox().value).toBe(code);
    expect(card()!.querySelector('.backup-error')?.textContent).toBe('');
  });

  it('with Escape brings the card back with the pasted code', () => {
    openBackup();
    askToRestore();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(question()).toBeNull();
    expect(card()).not.toBeNull();
    expect(restoreBox().value).toBe(code);
  });

  it('leaves the card closed when the card itself is closed', () => {
    openBackup();
    button(card()!, 'Close').click();
    expect(card()).toBeNull();
    expect(document.querySelector('.overlay')).toBeNull();
  });
});
