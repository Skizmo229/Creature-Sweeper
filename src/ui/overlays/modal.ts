/**
 * The one modal overlay a screen carries at a time: a question, the rules card, the save backup,
 * the field guide, About. Shown over the current screen, and closed by every rebuild (decision
 * 0017). While one is up it holds the keyboard: Escape closes it, or takes the overlay's own way out
 * where it has one, and every other key is swallowed (docs/ui.md).
 */

import type { FullRun } from '../../engine/run.js';
import { buildAbout } from '../screens/about.js';
import { buildSaveBackup } from '../screens/backup.js';
import { buildHowTo } from '../screens/howto.js';
import { type AskOptions, buildAsk } from './ask.js';
import { buildCrash } from './crash.js';

/**
 * Note where the focus is, as an overlay is about to take it; the function returned hands it back
 * when the overlay closes, if that element is still on the page. Without it a keyboard player is
 * left at the top of the document whenever a card or a window closes.
 */
export function keepFocus(): () => void {
  const active = document.activeElement;
  const back = active instanceof HTMLElement && active !== document.body ? active : null;
  return () => {
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
}

/**
 * The modal overlay over the screen in `root`: at most one up at a time, each shown through
 * `show`, with the cards and questions the screens open built here.
 */
export class Modal {
  /** The overlay up, if any. */
  private overlay: HTMLElement | null = null;

  /** What Escape does for the overlay up; null means close it. */
  private onEscape: (() => void) | null = null;

  /** Hands the focus back to where it was before the overlay up took it. */
  private giveFocusBack: (() => void) | null = null;

  constructor(private readonly root: HTMLElement) {}

  /**
   * Show an overlay over the current screen, closing any other; false when there is no screen.
   * `onEscape` is what Escape does instead of a plain close, for a card with one way on.
   */
  show(overlay: HTMLElement, focus?: HTMLElement, onEscape?: () => void): boolean {
    this.close();
    const screen = this.root.querySelector('.screen');
    if (!screen) return false;
    this.giveFocusBack = keepFocus();
    screen.append(overlay);
    this.overlay = overlay;
    this.onEscape = onEscape ?? null;
    focus?.focus();
    return true;
  }

  /** Take the overlay down, and the focus back where it was when it went up. */
  close(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.onEscape = null;
    const giveBack = this.giveFocusBack;
    this.giveFocusBack = null;
    giveBack?.();
  }

  /** A key, while an overlay is up: Escape answers "no", nothing else gets through. */
  onKey(e: KeyboardEvent): boolean {
    if (!this.overlay) return false;
    if (e.key === 'Escape') {
      e.preventDefault();
      const escape = this.onEscape;
      if (escape) escape();
      else this.close();
    }
    return true;
  }

  /**
   * Ask before doing something irreversible, in the page rather than in a browser dialog. The
   * question takes the place of any overlay up; `opts.onCancel` is how that overlay comes back
   * when the answer is no, by the button or by Escape.
   */
  ask(opts: AskOptions): void {
    const { overlay, focus } = buildAsk(opts, () => this.close());
    // Escape is the "no" button: the close, and then what "no" owes, where the asker set it.
    const no = (): void => {
      this.close();
      opts.onCancel?.();
    };
    if (!this.show(overlay, focus, opts.onCancel ? no : undefined)) opts.onConfirm();
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
  howTo(onGuide: () => void, onSchool: () => void): void {
    const { overlay, focus } = buildHowTo(() => this.close(), onGuide, onSchool);
    this.show(overlay, focus);
  }

  /** Who made the game, its licence and its source (decision 0069). */
  about(): void {
    const { overlay, focus } = buildAbout(() => this.close());
    this.show(overlay, focus);
  }

  /**
   * An error nothing caught (decision 0081): what broke, where to report it, and the way back to
   * the list. Escape takes that way too, since a plain close would leave the player on the broken
   * board with its clock no longer ticking and the watch disarmed. With no screen to show it on,
   * the way back is taken at once.
   */
  crashed(message: string, onBack: () => void): void {
    const back = (): void => {
      this.close();
      onBack();
    };
    const { overlay, focus } = buildCrash(message, back);
    if (!this.show(overlay, focus, back)) onBack();
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
