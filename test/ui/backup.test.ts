// @vitest-environment happy-dom
/**
 * The save backup card (decision 0022): restoring asks before it replaces the save, and saying no
 * to that question hands the card back with the pasted code still in it, whether the answer is the
 * Cancel button or Escape. The modal holds one overlay at a time, so the question replaces the
 * card; the cancel path is what brings it back.
 */

import './setup.js';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/ui/app.js';
import { encodeSave } from '../../src/ui/savefile.js';
import { PLAYTEST_REPORT_URL } from '../../src/ui/screens/backup.js';

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

/**
 * The play statistics' code goes into a play-test report on GitHub (decision 0085): the card
 * links the repository's issue form, whose required field is where the code is pasted.
 */
describe('the play statistics', () => {
  it('link the play-test report, in a tab of its own, whose form asks for the code', () => {
    openBackup();
    const report = [...card()!.querySelectorAll('a')].find(
      (a) => a.textContent === 'play-test report',
    )!;
    expect(report.getAttribute('href')).toBe(PLAYTEST_REPORT_URL);
    expect(PLAYTEST_REPORT_URL).toBe(
      'https://github.com/Skizmo229/Creature-Sweeper/issues/new?template=playtest.yml',
    );
    expect(report.target).toBe('_blank');
    expect(report.rel.split(' ')).toContain('noopener');
    const form = readFileSync('.github/ISSUE_TEMPLATE/playtest.yml', 'utf8');
    expect(form).toMatch(/- type: textarea\n {4}id: statistics\n/);
    expect(form).toContain('required: true');
  });
});
