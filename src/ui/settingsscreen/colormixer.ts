/**
 * Mixing a colour: a slider for each of red, green and blue, the same three numbers to type, and
 * the colour in hex, which always say the same colour. Each slider's track runs through the
 * colours it reaches from where the other two stand. The windows that choose a colour lay these
 * lines out beside an example of their own (`customcolor.ts`).
 */

import { CHANNEL_MAX, type Rgb, hexOf, rgbOf } from '../colorspace.js';
import { el } from '../dom.js';
import { readHexColor } from '../presentation.js';

const CHANNEL_NAMES = ['Red', 'Green', 'Blue'] as const;

/** A labelled line of the mixer: a slider and its number, or the hex field. */
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

/** A colour mixer's controls, and the colour they say. */
export interface ColorMixer {
  /** The three channels' lines and the hex's, in that order, to lay out in a form. */
  readonly lines: HTMLElement[];
  /** The colour mixed, as `#rrggbb`. */
  color(): string;
  /** Show a colour in every control, and report it as though the player had mixed it. */
  set(color: string): void;
  /** Focus the red slider. */
  focus(): void;
}

/**
 * The controls start empty: `set` fills them, once whatever `onChange` reports to has been built.
 * `onChange` hears every colour mixed, from a slider, a number or the hex.
 */
export function colorMixer(onChange: (color: string) => void): ColorMixer {
  let rgb: Rgb = [0, 0, 0];
  const channels = CHANNEL_NAMES.map(channelControls);
  const hex = hexField();

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
    onChange(color);
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

  return {
    lines: [
      ...channels.map((c, i) => line(CHANNEL_NAMES[i]!, c.range, c.number)),
      line('Hex', hex),
    ],
    color: () => hexOf(rgb),
    set(color) {
      rgb = rgbOf(color);
      show();
    },
    focus: () => channels[0]!.range.focus(),
  };
}
