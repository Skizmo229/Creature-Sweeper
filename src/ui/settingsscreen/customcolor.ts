/**
 * The cursor highlight's Custom tile: a window with the colour mixer (`colormixer.ts`), a slider
 * for each of red, green and blue, the same three numbers to type and the colour in hex, and the
 * highlight's example board drawn in the colour as any of them moves. "Use this colour" saves it,
 * as Enter does from a typed field.
 *
 * Red is the one colour the highlight already means something in: it crosses out a click that
 * would do nothing (decision 0051). So the window shows the two side by side, and says so when the
 * colour mixed comes close enough to the red to be mistaken for it (decision 0050).
 */

import { colorDifference } from '../colorspace.js';
import { el } from '../dom.js';
import { OUT_OF_REACH_COLOR } from '../theme.js';
import { colorMixer } from './colormixer.js';
import { settingsWindow } from './widgets.js';

/**
 * How close a colour can come to the red of a click that would do nothing before the window says
 * so, as a colour difference (`colorDifference`). Measured 27 Sep 2026: pure red is 38 from it, a
 * light red 37 and a red-orange 35, where orange is 46 and hot pink 45; every preset is 81 or more.
 */
export const NEAR_REFUSAL = 40;

/** The colour being mixed beside the red, each with what it means on a board. */
function legend(): { box: HTMLElement; lands: HTMLElement } {
  const lands = el('span', 'color-swatch');
  const refused = el('span', 'color-swatch');
  refused.style.background = OUT_OF_REACH_COLOR;
  const box = el('div', 'color-legend');
  box.append(
    lands,
    el('span', undefined, 'A click that lands'),
    refused,
    el('span', undefined, 'A click that would do nothing'),
  );
  return { box, lands };
}

export interface ColorWindowSpec {
  /** The colour the window opens on: the one in force. */
  current: string;
  /** The highlight's example board, drawn in a colour. */
  example: (color: string) => HTMLElement;
  /** Save a colour as the highlight's. */
  onUse: (color: string) => void;
}

export function openColorWindow(screen: HTMLElement, spec: ColorWindowSpec): void {
  const { card, dismiss } = settingsWindow(screen, 'Custom highlight colour', 'color-card');

  const swatches = legend();
  const warn = el(
    'p',
    'color-warn',
    'This is close to the red of a click that would do nothing. The board still crosses that out, ' +
      'but the two colours may be hard to tell apart.',
  );
  const example = el('div', 'color-example');
  const mixer = colorMixer((color) => {
    swatches.lands.style.background = color;
    warn.hidden = colorDifference(color, OUT_OF_REACH_COLOR) >= NEAR_REFUSAL;
    example.replaceChildren(spec.example(color));
  });
  const use = el('button', 'primary color-use', 'Use this colour');
  use.type = 'submit';
  const form = el('form', 'color-controls');
  form.append(...mixer.lines, swatches.box, warn, use);
  const body = el('div', 'color-body');
  body.append(example, form);
  card.append(
    el(
      'p',
      'settings-blurb',
      'Mix any colour from red, green and blue, or type it in hex. Red itself is taken: it crosses ' +
        'out a click that would do nothing, as on the right of the example.',
    ),
    body,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    dismiss();
    spec.onUse(mixer.color());
  });

  mixer.set(spec.current);
  mixer.focus();
}
