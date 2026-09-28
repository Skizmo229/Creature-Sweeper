/**
 * The one modal overlay a screen carries at a time: a question, the rules card, the save backup,
 * the field guide. Shown over the current screen, and closed by every rebuild (decision 0017).
 * While one is up it holds the keyboard: Escape closes it and every other key is swallowed
 * (docs/ui.md).
 */

import { buildSaveBackup } from '../screens/backup.js';
import { buildHowTo } from '../screens/howto.js';
import { type AskOptions, buildAsk } from './ask.js';

export class Modal {
  /** The overlay up, if any. */
  private overlay: HTMLElement | null = null;

  constructor(private readonly root: HTMLElement) {}

  /** Show an overlay over the current screen, closing any other; false when there is no screen. */
  show(overlay: HTMLElement, focus?: HTMLElement): boolean {
    this.close();
    const screen = this.root.querySelector('.screen');
    if (!screen) return false;
    screen.append(overlay);
    this.overlay = overlay;
    focus?.focus();
    return true;
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  /** A key, while an overlay is up: Escape answers "no", nothing else gets through. */
  onKey(e: KeyboardEvent): boolean {
    if (!this.overlay) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
    return true;
  }

  /** Ask before doing something irreversible, in the page rather than in a browser dialog. */
  ask(opts: AskOptions): void {
    const { overlay, focus } = buildAsk(opts, () => this.close());
    if (!this.show(overlay, focus)) opts.onConfirm();
  }

  /** The ladder list's reset: every record on this device, asked about first. */
  eraseProgress(onErase: () => void): void {
    this.ask({
      title: 'ERASE PROGRESS?',
      body:
        'Every unlock, clear time, full run, paused game and play statistic on this device. ' +
        'This cannot be undone.',
      confirmLabel: 'Erase everything',
      cancelLabel: 'Cancel',
      onConfirm: onErase,
    });
  }

  /** The rules card, with its ways to the field guide and the school. */
  howTo(onGuide: () => void, onSchool: () => void, onClose?: () => void): void {
    const { overlay, focus } = buildHowTo(
      () => {
        this.close();
        onClose?.();
      },
      onGuide,
      onSchool,
    );
    if (!this.show(overlay, focus)) onClose?.();
  }

  saveBackup(draft = '', error = ''): void {
    this.show(
      buildSaveBackup(draft, error, {
        ask: (opts) => this.ask(opts),
        close: () => this.close(),
        reopen: (d, e) => this.saveBackup(d, e),
      }),
    );
  }
}
