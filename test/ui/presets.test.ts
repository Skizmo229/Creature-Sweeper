// @vitest-environment happy-dom
/**
 * The presets: one click sets a bundle of gameplay dials, or the low-vision look, and any row can
 * be moved after; and the fullscreen button, offered where the browser allows it.
 */

import './setup.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAMEPLAY } from '../../src/engine/settings.js';
import { LEGIBLE_FONT } from '../../src/ui/typefaces.js';
import { type AppDriver, mountApp, settingsRow } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
  app.showSettings(() => app.showTypes());
});

const button = (host: HTMLElement, label: string): HTMLButtonElement =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;

describe('the gameplay presets', () => {
  it('set a bundle of dials at once, from the tuned game, and Tuned puts every dial back', () => {
    button(settingsRow('Presets'), 'Brutal').click();
    const brutal = app.settings.gameplay;
    expect([brutal.hpRatio, brutal.enemyDamageRatio, brutal.sweep, brutal.countersHidden]).toEqual([
      0.5,
      2,
      'off',
      true,
    ]);
    expect(document.querySelector('.settings-status')!.textContent).toBe(
      'Harder than tuned: everything records.',
    );
    button(settingsRow('Presets'), 'Relaxed').click();
    const relaxed = app.settings.gameplay;
    expect([relaxed.hpRatio, relaxed.enemyDamageRatio, relaxed.sweep]).toEqual([2, 0.5, 'on']);
    // From the tuned game, not on top of Brutal: the counters are back.
    expect(relaxed.countersHidden).toBe(false);
    button(settingsRow('Presets'), 'Tuned').click();
    expect(app.settings.gameplay).toEqual(DEFAULT_GAMEPLAY);
  });
});

describe('the low-vision preset', () => {
  it('sets the legible face everywhere, larger text and digits, and a thick cursor', () => {
    button(settingsRow('Low vision'), 'Low vision').click();
    const p = app.settings.presentation;
    expect([p.font, p.interfaceFont]).toEqual([LEGIBLE_FONT, LEGIBLE_FONT]);
    expect([p.textSize, p.digitSize, p.glyph, p.highlightWidth, p.tierColors]).toEqual([
      1.5,
      1.4,
      'digit',
      4,
      'plain',
    ]);
    expect(document.documentElement.style.fontSize).toBe('150%');
  });
});

describe('the fullscreen button', () => {
  it('asks the browser for the whole screen, and says so, where the browser offers it', () => {
    const page = document.documentElement;
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(page, 'requestFullscreen', { value: request, configurable: true });
    app.showSettings(() => app.showTypes());
    const fullscreen = settingsRow('Fullscreen');
    const go = button(fullscreen, 'Fullscreen');
    expect(go.disabled).toBe(false);
    go.click();
    expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(page, 'requestFullscreen', { value: undefined, configurable: true });
    app.showSettings(() => app.showTypes());
    expect(button(settingsRow('Fullscreen'), 'Fullscreen').disabled).toBe(true);
    expect(settingsRow('Fullscreen').textContent).toContain('does not offer it');
  });
});
