/**
 * The card for an error nothing caught (decision 0081): the game does not die silently. What
 * broke, in the error's own words, where to report it, and the one way on, back to the list,
 * since the board it happened on can no longer be trusted.
 */

import { type OverlayCard, el, link } from '../dom.js';
import { SOURCE_LABEL, SOURCE_URL } from '../screens/about.js';
import { VERSION } from '../version.js';
import type { Modal } from './modal.js';

/** The crash card for `message`, and its one button, Back to the list, which runs `onBack`. */
export function buildCrash(message: string, onBack: () => void): OverlayCard {
  const overlay = el('div', 'overlay lose');
  const card = el('div', 'overlay-card crash');
  card.append(el('h2', undefined, 'SOMETHING BROKE'));
  card.append(
    el(
      'p',
      'overlay-note',
      'An error stopped the game. Boards you finished are saved; this one is not.',
    ),
  );
  card.append(el('p', 'overlay-stats', message));
  const report = el('p', 'overlay-note');
  report.append(
    `Version ${VERSION}. To report it, with the message above: `,
    link(`${SOURCE_URL}/issues`, SOURCE_LABEL),
  );
  card.append(report);

  const row = el('div', 'overlay-actions');
  const back = el('button', 'primary', 'Back to the list');
  back.addEventListener('click', onBack);
  row.append(back);
  card.append(row);
  overlay.append(card);
  return { overlay, focus: back };
}

/**
 * The watch: installs the window's error listeners once, shows the card once per breakage, since
 * a broken screen can throw on every frame, and re-arms when the player goes back. The board's
 * `clock` stops ticking when the game breaks; `back` is the way home (the ladder list), which
 * rebuilds the screen. Its own class rather than the app's, which is at the size a file may run
 * to.
 */
export class CrashWatch {
  private crashing = false;

  constructor(
    private readonly modal: Modal,
    private readonly clock: { stopTicking(): void },
    private readonly back: () => void,
  ) {
    window.addEventListener('error', (e) => this.crashed(e.error ?? e.message));
    window.addEventListener('unhandledrejection', (e) => this.crashed(e.reason));
  }

  private crashed(thrown: unknown): void {
    if (this.crashing) return;
    this.crashing = true;
    this.clock.stopTicking();
    const message = thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown);
    this.modal.crashed(message.slice(0, 300), () => {
      this.crashing = false;
      this.back();
    });
  }
}
