// @vitest-environment happy-dom
/**
 * An error nothing caught shows a card rather than a dead page (decision 0081): the message, once
 * per breakage, and a way back to the list.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { type AppDriver, key, mountApp } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

const throwAt = (type: string, fields: Record<string, unknown>): void => {
  window.dispatchEvent(Object.assign(new Event(type), fields));
};
const card = (): HTMLElement | null => document.querySelector('.overlay-card.crash');

describe('an error nothing caught', () => {
  it('shows a card with the message, once, and a way back to the list', () => {
    app.play('normal', 1, 7);
    throwAt('error', { error: new TypeError('boom') });
    expect(card()?.textContent).toContain('TypeError: boom');
    expect(card()?.textContent).toContain('Version ');

    // A broken screen can throw on every frame; the card stays the first one's.
    throwAt('error', { error: new Error('again') });
    expect(document.querySelectorAll('.overlay-card.crash')).toHaveLength(1);
    expect(card()?.textContent).not.toContain('again');

    card()!.querySelector('button')!.click();
    expect(card()).toBeNull();
    expect(document.querySelector('.type-groups')).not.toBeNull();

    // Back re-arms it.
    throwAt('error', { error: new Error('later') });
    expect(card()?.textContent).toContain('Error: later');
  });

  it('takes Escape as Back to the list, so the watch re-arms and the screen is rebuilt', () => {
    app.play('normal', 1, 7);
    throwAt('error', { error: new Error('boom') });
    expect(card()).not.toBeNull();

    key('Escape');
    expect(card()).toBeNull();
    expect(document.querySelector('.type-groups')).not.toBeNull();

    throwAt('error', { error: new Error('later') });
    expect(card()?.textContent).toContain('Error: later');
  });

  it('reads a rejection by its reason, and an error event with no error by its message', () => {
    throwAt('unhandledrejection', { reason: 'lost the thread' });
    expect(card()?.textContent).toContain('lost the thread');
    card()!.querySelector('button')!.click();
    throwAt('error', { message: 'Script error.' });
    expect(card()?.textContent).toContain('Script error.');
  });
});
