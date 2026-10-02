// @vitest-environment happy-dom
/**
 * An overlay that closes hands the focus back to where it was when the overlay took it: the modal's
 * cards and questions, and the settings screen's windows. A keyboard player would otherwise be
 * left at the top of the page each time one closed.
 */

import './setup.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { type AppDriver, mountApp, settingsRow, tiles } from './driver.js';

let app: AppDriver;

beforeEach(() => {
  app = mountApp();
});

const button = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)!;

/** Focus a control and press it, as the keyboard does. */
const press = (control: HTMLElement): void => {
  control.focus();
  control.click();
};

const escape = (): void => {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
};

describe('the focus, when an overlay closes', () => {
  it('goes back to the button that opened a card, by its button or by Escape', () => {
    const about = button('About');
    press(about);
    expect(document.querySelector('.overlay-card.about')).not.toBeNull();
    expect(document.activeElement).not.toBe(about);
    button('Close').click();
    expect(document.activeElement).toBe(about);
    press(about);
    escape();
    expect(document.querySelector('.overlay')).toBeNull();
    expect(document.activeElement).toBe(about);
  });

  it('goes back to the button that asked a question answered no', () => {
    const reset = button('Reset progress');
    press(reset);
    expect(document.querySelector('.overlay h2')?.textContent).toBe('ERASE PROGRESS?');
    button('Cancel').click();
    expect(document.activeElement).toBe(reset);
  });

  it('goes back to the tile that opened a settings window', () => {
    app.showSettings(() => app.showTypes());
    const tile = tiles(settingsRow('Board palette'))[1]!;
    press(tile);
    expect(document.querySelector('.picker-card')).not.toBeNull();
    expect(document.activeElement).not.toBe(tile);
    escape();
    expect(document.querySelector('.picker-card')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });
});
