/**
 * A yes/no question in the page, never in a browser dialog. `window.confirm` is not dependable:
 * an embedded webview can suppress it, a browser will after "prevent additional dialogs", and a
 * suppressed dialog returns false, so the button it guards silently stops working (decision
 * 0017). This is the same overlay the win and loss screens use.
 */

import { el } from '../dom.js';

export interface AskOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/** Build the question. `close` removes it; the caller appends it and focuses `focus`. */
export function buildAsk(
  opts: AskOptions,
  close: () => void,
): { overlay: HTMLElement; focus: HTMLElement } {
  const overlay = el('div', 'overlay lose');
  const card = el('div', 'overlay-card');
  card.append(el('h2', undefined, opts.title));
  card.append(el('p', 'overlay-stats', opts.body));

  const row = el('div', 'overlay-actions');
  const yes = el('button', 'primary', opts.confirmLabel);
  yes.addEventListener('click', () => {
    close();
    opts.onConfirm();
  });
  const no = el('button', 'ghost', opts.cancelLabel);
  no.addEventListener('click', close);
  row.append(yes, no);
  card.append(row);
  overlay.append(card);
  // Cancel is the safe answer, so it is what Enter and a stray click land on; confirming an
  // irreversible thing should take aim.
  return { overlay, focus: no };
}
