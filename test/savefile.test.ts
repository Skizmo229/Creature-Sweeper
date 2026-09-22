/**
 * Save export and import.
 *
 * The failure this guards against is quiet: a code that decodes to something
 * the game loads as a fresh save would wipe a player's progress on "restore",
 * which is the exact loss the feature exists to prevent.
 */

import { describe, expect, it } from 'vitest';
import { decodeSave, describeSave, encodeSave, localDate } from '../src/ui/savefile.js';

const progress = JSON.stringify({
  version: 1,
  types: { easy: { highestBoard: 10, cleared: true } },
  boards: { 'easy#1': { cleared: true, perfect: false, bestTime: 42 } },
  runs: {}, scaling: {}, unlockAll: false, seenHowTo: true,
});
const settings = JSON.stringify({ version: 1, presentation: {}, gameplay: {} });

describe('save codes', () => {
  it('round-trips progress and settings', () => {
    const code = encodeSave({ progress, settings });
    const result = decodeSave(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.bundle.progress!)).toEqual(JSON.parse(progress));
    expect(JSON.parse(result.bundle.settings!)).toEqual(JSON.parse(settings));
  });

  it('survives being wrapped and indented by a chat app', () => {
    const code = encodeSave({ progress, settings });
    const mangled = `  ${code.match(/.{1,40}/g)!.join('\n   ')}\n`;
    expect(decodeSave(mangled).ok).toBe(true);
  });

  it('ignores the invisible characters an app slips into a long string', () => {
    const code = encodeSave({ progress, settings });
    const invisible = ['​', '‌', '‍', '⁠', '­'];
    const mangled = code.match(/.{1,16}/g)!
      .map((part, i) => part + invisible[i % invisible.length]).join('');
    expect(decodeSave(mangled).ok).toBe(true);
  });

  it('dates a save in local time, not UTC', () => {
    // 23:30 on 21 September wherever the test runs; UTC is already the 22nd
    // for anyone west of Greenwich, which is the bug this guards.
    expect(localDate(new Date(2026, 8, 21, 23, 30))).toBe('2026-09-21');
    const result = decodeSave(encodeSave({ progress, settings }, new Date(2026, 8, 21, 23, 30)));
    expect(result.ok && localDate(new Date(result.exported!))).toBe('2026-09-21');
  });

  it('drops an export stamp that is not a date', () => {
    const envelope = JSON.stringify({
      format: 'creature-sweeper-save', version: 1, exported: 'yesterday',
      progress: JSON.parse(progress), settings: null,
    });
    const result = decodeSave(envelope);
    expect(result.ok && result.exported).toBe(null);
  });

  it('carries no quotes a chat app could curl', () => {
    expect(encodeSave({ progress, settings })).toMatch(/^CS1:[A-Za-z0-9+/=]+$/);
  });

  it('accepts a save with no settings', () => {
    const result = decodeSave(encodeSave({ progress, settings: null }));
    expect(result.ok && result.bundle.settings).toBe(null);
  });

  it('refuses anything that would load as a blank save', () => {
    expect(decodeSave('').ok).toBe(false);
    expect(decodeSave('hello').ok).toBe(false);
    expect(decodeSave(encodeSave({ progress: null, settings })).ok).toBe(false);
    expect(decodeSave(encodeSave({ progress: 'not json', settings })).ok).toBe(false);
    const future = encodeSave({ progress: JSON.stringify({ version: 2, types: {}, boards: {} }), settings });
    expect(decodeSave(future).ok).toBe(false);
  });

  it('refuses a code cut short', () => {
    const code = encodeSave({ progress, settings });
    expect(decodeSave(code.slice(0, code.length - 30)).ok).toBe(false);
  });

  it('summarises what a save holds', () => {
    expect(describeSave({ progress, settings })).toBe('1 board cleared, 1 game type finished.');
    expect(describeSave({ progress: null, settings: null })).toBe('No progress.');
  });
});
