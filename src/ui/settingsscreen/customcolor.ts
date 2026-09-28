/**
 * A Custom tile's window for a colour: the colour mixer (`colormixer.ts`), a slider for each of
 * red, green and blue, the same three numbers to type and the colour in hex, and an example
 * board drawn in the colour as any of them moves. "Use this colour" saves it, as Enter does from
 * a typed field.
 *
 * The board already means something by a few colours: red crosses out a click that would do
 * nothing (decision 0051), gold is a given, and so on (decision 0032). So the window shows the
 * colour mixed beside the ones its setting must stay clear of, and says so when it comes close
 * enough to one to be mistaken for it (decision 0050).
 */

import { colorDifference } from '../colorspace.js';
import { el } from '../dom.js';
import { colorMixer } from './colormixer.js';
import { settingsWindow } from './widgets.js';

/**
 * How close a colour can come to one the board already means something by before the window says
 * so, as a colour difference (`colorDifference`). Measured 27 Sep 2026 against the red of a
 * refused click: pure red is 38 from it, a light red 37 and a red-orange 35, where orange is 46
 * and hot pink 45; every preset is 81 or more.
 */
export const NEAR_REFUSAL = 40;

/** A colour the board already means something by, as the legend names it and the warning does. */
export interface TakenColor {
  readonly color: string;
  /** Beside its swatch: "A click that would do nothing". */
  readonly label: string;
  /** In the warning: "the red that crosses out a click that would do nothing". */
  readonly name: string;
}

export interface ColorWindowSpec {
  title: string;
  /** What the window is for, under its title. */
  blurb: string;
  /** Beside the mixed colour's swatch: what the colour will mean on a board. */
  mixedLabel: string;
  /** The colours the setting must stay clear of, shown beside the mixed one. */
  taken: readonly TakenColor[];
  /** The colour the window opens on: the one in force. */
  current: string;
  /** The example board, drawn in a colour. */
  example: (color: string) => HTMLElement;
  /** Save a colour as the setting's. */
  onUse: (color: string) => void;
}

/** The colour being mixed beside the taken ones, each with what it means on a board. */
function legend(spec: ColorWindowSpec): { box: HTMLElement; mixed: HTMLElement } {
  const mixed = el('span', 'color-swatch');
  const box = el('div', 'color-legend');
  box.append(mixed, el('span', undefined, spec.mixedLabel));
  for (const t of spec.taken) {
    const swatch = el('span', 'color-swatch');
    swatch.style.background = t.color;
    box.append(swatch, el('span', undefined, t.label));
  }
  return { box, mixed };
}

export function openColorWindow(screen: HTMLElement, spec: ColorWindowSpec): void {
  const { card, dismiss } = settingsWindow(screen, spec.title, 'color-card');

  const swatches = legend(spec);
  const warn = el('p', 'color-warn');
  const example = el('div', 'color-example');
  const mixer = colorMixer((color) => {
    swatches.mixed.style.background = color;
    const near = spec.taken.find((t) => colorDifference(color, t.color) < NEAR_REFUSAL);
    warn.hidden = near === undefined;
    warn.textContent = near ? `Close to ${near.name}.` : '';
    example.replaceChildren(spec.example(color));
  });
  const use = el('button', 'primary color-use', 'Use this colour');
  use.type = 'submit';
  const form = el('form', 'color-controls');
  form.append(...mixer.lines, swatches.box, warn, use);
  const body = el('div', 'color-body');
  body.append(example, form);
  card.append(el('p', 'settings-blurb', spec.blurb), body);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    dismiss();
    spec.onUse(mixer.color());
  });

  mixer.set(spec.current);
  mixer.focus();
}
