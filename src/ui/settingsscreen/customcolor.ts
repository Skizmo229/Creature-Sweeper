/**
 * The cursor highlight's Custom tile: a window with a slider for each of red, green and blue, the
 * same three numbers to type, the colour in hex, and the highlight's example board drawn in the
 * colour as any of them moves. "Use this colour" saves it, as Enter does from a typed field.
 *
 * Red is the one colour the highlight already means something in: it crosses out a click that
 * would do nothing (decision 0051). So the window shows the two side by side, and says so when the
 * colour mixed comes close enough to the red to be mistaken for it (decision 0050).
 */

import { CHANNEL_MAX, type Rgb, colorDifference, hexOf, rgbOf } from '../colorspace.js';
import { el } from '../dom.js';
import { readHexColor } from '../settings.js';
import { OUT_OF_REACH_COLOR } from '../theme.js';
import { settingsWindow } from './widgets.js';

const CHANNEL_NAMES = ['Red', 'Green', 'Blue'] as const;

/**
 * How close a colour can come to the red of a click that would do nothing before the window says
 * so, as a colour difference (`colorDifference`). Measured 27 Sep 2026: pure red is 38 from it, a
 * light red 37 and a red-orange 35, where orange is 46 and hot pink 45; every preset is 81 or more.
 */
export const NEAR_REFUSAL = 40;

/** A labelled line of the window: a slider and its number, or the hex field. */
function line(name: string, ...controls: HTMLElement[]): HTMLElement {
  const row = el('div', 'color-channel');
  row.append(el('span', 'color-channel-name', name), ...controls);
  return row;
}

/** One channel's slider and the number beside it, which always say the same. */
interface Channel {
  range: HTMLInputElement;
  number: HTMLInputElement;
}

function channelControls(name: string): Channel {
  const range = el('input', 'color-range');
  range.type = 'range';
  const number = el('input', 'color-number');
  number.type = 'number';
  for (const input of [range, number]) {
    input.min = '0';
    input.max = String(CHANNEL_MAX);
    input.step = '1';
  }
  range.setAttribute('aria-label', name);
  number.setAttribute('aria-label', `${name}, 0 to ${CHANNEL_MAX}`);
  return { range, number };
}

function hexField(): HTMLInputElement {
  const hex = el('input', 'color-hex');
  hex.type = 'text';
  hex.maxLength = '#rrggbb'.length;
  hex.spellcheck = false;
  hex.autocomplete = 'off';
  hex.setAttribute('aria-label', 'Hex');
  return hex;
}

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
  let rgb = rgbOf(spec.current);

  const channels = CHANNEL_NAMES.map(channelControls);
  const hex = hexField();
  const swatches = legend();
  const warn = el(
    'p',
    'color-warn',
    'This is close to the red of a click that would do nothing. The board still crosses that out, ' +
      'but the two colours may be hard to tell apart.',
  );
  const use = el('button', 'primary color-use', 'Use this colour');
  use.type = 'submit';
  const form = el('form', 'color-controls');
  form.append(
    ...channels.map((c, i) => line(CHANNEL_NAMES[i]!, c.range, c.number)),
    line('Hex', hex),
    swatches.box,
    warn,
    use,
  );
  const example = el('div', 'color-example');
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

  /** Show the colour everywhere but the field it is being typed in, which keeps what was typed. */
  const show = (typing?: HTMLInputElement): void => {
    const color = hexOf(rgb);
    channels.forEach((c, i) => {
      c.range.value = String(rgb[i]);
      if (c.number !== typing) c.number.value = String(rgb[i]);
      // The track runs from this colour with none of the channel to this colour with all of it.
      const at = (v: number): string => hexOf(rgb.map((w, j) => (j === i ? v : w)) as Rgb);
      c.range.style.setProperty(
        '--track',
        `linear-gradient(to right, ${at(0)}, ${at(CHANNEL_MAX)})`,
      );
    });
    if (hex !== typing) hex.value = color;
    swatches.lands.style.background = color;
    warn.hidden = colorDifference(color, OUT_OF_REACH_COLOR) >= NEAR_REFUSAL;
    example.replaceChildren(spec.example(color));
  };

  channels.forEach((c, i) => {
    c.range.addEventListener('input', () => {
      rgb[i] = Number(c.range.value);
      show();
    });
    c.number.addEventListener('input', () => {
      const v = Math.round(Number(c.number.value));
      if (c.number.value.trim() === '' || !Number.isFinite(v)) return;
      rgb[i] = Math.min(CHANNEL_MAX, Math.max(0, v));
      show(c.number);
    });
    // Leaving the field writes back what the channel holds: whole, and within its range.
    c.number.addEventListener('change', () => show());
  });
  hex.addEventListener('input', () => {
    const color = readHexColor(hex.value);
    if (!color) return;
    rgb = rgbOf(color);
    show(hex);
  });
  hex.addEventListener('change', () => show());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    dismiss();
    spec.onUse(hexOf(rgb));
  });

  show();
  channels[0]!.range.focus();
}
