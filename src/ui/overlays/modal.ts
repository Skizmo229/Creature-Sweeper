/**
 * The one modal overlay a screen carries at a time: a question, the rules card, the save backup,
 * the field guide, About. Shown over the current screen, and closed by every rebuild (decision
 * 0017). While one is up it holds the keyboard: Escape closes it and every other key is swallowed
 * (docs/ui.md).
 */

import type { FullRun } from '../../engine/run.js';
import { buildAbout } from '../screens/about.js';
import { buildSaveBackup } from '../screens/backup.js';
import { buildHowTo } from '../screens/howto.js';
import { type AskOptions, buildAsk } from './ask.js';
import { buildCrash } from './crash.js';

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

  /**
   * Leaving a board, or a run, with something in it: pause it, abandon it, or keep playing.
   * `run` is the run's standing, for the question's body; null on a single board.
   */
  leaveGame(opts: {
    boardIndex: number;
    typeName: string;
    run: Pick<FullRun, 'boardCount' | 'hp' | 'maxHp'> | null;
    onPause: () => void;
    onAbandon: () => void;
  }): void {
    const { run, boardIndex } = opts;
    this.ask({
      title: run ? 'LEAVE RUN?' : `LEAVE BOARD ${boardIndex}?`,
      body:
        (run
          ? `${opts.typeName} full run, board ${boardIndex} of ${run.boardCount}, ` +
            `HP ${run.hp}/${run.maxHp}. `
          : '') + 'Pause it to carry on later from exactly here, or abandon it.',
      confirmLabel: run ? 'Pause run' : 'Pause',
      cancelLabel: 'Keep playing',
      onConfirm: opts.onPause,
      alternate: { label: run ? 'Abandon run' : 'Abandon', onChoose: opts.onAbandon },
    });
  }

  /** A paused game an update has changed cannot be taken up (decision 0057); offer a fresh one. */
  cannotResume(onStartAgain: () => void): void {
    this.ask({
      title: 'CANNOT RESUME',
      body: 'An update has changed this game since it was paused, so it cannot be taken up.',
      confirmLabel: 'Start again',
      cancelLabel: 'Back',
      onConfirm: onStartAgain,
    });
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

  /** Who made the game, its licence and its source (decision 0069). */
  about(): void {
    const { overlay, focus } = buildAbout(() => this.close());
    this.show(overlay, focus);
  }

  /**
   * An error nothing caught (decision 0081): what broke, where to report it, and the way back to
   * the list. With no screen to show it on, the way back is taken at once.
   */
  crashed(message: string, onBack: () => void): void {
    const { overlay, focus } = buildCrash(message, () => {
      this.close();
      onBack();
    });
    if (!this.show(overlay, focus)) onBack();
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
