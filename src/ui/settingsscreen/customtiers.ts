/**
 * The creature colours' Custom tile: a window with a swatch for each tier and one for the halo
 * tiers 6 to 9 wear, the colour mixer (`colormixer.ts`) for whichever swatch is chosen, and the
 * example board redrawn in the palette as it is mixed. A row of buttons starts again from any
 * preset, so a preset can be the start of a palette of the player's own. "Use these colours"
 * saves it, as Enter does from a typed field (decision 0053).
 */

import { el } from '../dom.js';
import { TIER_COUNT, type TierPalette } from '../tiercolors.js';
import { colorMixer } from './colormixer.js';
import { settingsWindow } from './widgets.js';

/** The swatches' order: the nine tiers, then the halo. */
const HALO = TIER_COUNT;

export interface TierWindowSpec {
  /** The palette the window opens on. */
  current: TierPalette;
  /** Palettes to start again from, by name. */
  starts: readonly { readonly name: string; readonly palette: TierPalette }[];
  /** The example board, drawn in a palette. */
  example: (palette: TierPalette) => HTMLElement;
  /** Save a palette as the player's own, and choose it. */
  onUse: (palette: TierPalette) => void;
}

/** What a swatch is called, in its button and above the mixer. */
function swatchName(slot: number): string {
  return slot === HALO ? 'Halo' : String(slot + 1);
}

function swatchTitle(slot: number): string {
  return slot === HALO ? 'The halo of tiers 6 to 9' : `Tier ${slot + 1}`;
}

/** A button per swatch, each showing its colour above its name: the halo's as a ring. */
function swatchButtons(onChoose: (slot: number) => void): HTMLButtonElement[] {
  return Array.from({ length: TIER_COUNT + 1 }, (_, slot) => {
    const button = el('button', slot === HALO ? 'tier-swatch halo' : 'tier-swatch');
    button.type = 'button';
    button.title = swatchTitle(slot);
    button.append(el('span', 'tier-swatch-color'), el('span', undefined, swatchName(slot)));
    button.addEventListener('click', () => onChoose(slot));
    return button;
  });
}

export function openTierWindow(screen: HTMLElement, spec: TierWindowSpec): void {
  const { card, dismiss } = settingsWindow(screen, 'Custom creature colours', 'color-card');
  let colors = [...spec.current.colors, spec.current.halo];
  let chosen = 0;

  const example = el('div', 'color-example');
  const editing = el('p', 'tier-editing');
  const redraw = (): void => {
    swatches.forEach((button, slot) => {
      const color = colors[slot]!;
      button.style.setProperty('--swatch', color);
      button.setAttribute('aria-pressed', String(slot === chosen));
      button.setAttribute('aria-label', `${swatchTitle(slot)}, ${color}`);
    });
    editing.textContent = swatchTitle(chosen);
    example.replaceChildren(
      spec.example({ colors: colors.slice(0, TIER_COUNT), halo: colors[HALO]! }),
    );
  };
  const mixer = colorMixer((color) => {
    colors[chosen] = color;
    redraw();
  });
  const swatches = swatchButtons((slot) => {
    chosen = slot;
    mixer.set(colors[slot]!);
  });

  const starts = el('div', 'tier-starts');
  starts.append(el('span', undefined, 'Start from'));
  for (const start of spec.starts) {
    const button = el('button', 'ghost small', start.name);
    button.type = 'button';
    button.addEventListener('click', () => {
      colors = [...start.palette.colors, start.palette.halo];
      mixer.set(colors[chosen]!);
    });
    starts.append(button);
  }

  const row = el('div', 'tier-swatches');
  row.append(...swatches);
  const use = el('button', 'primary color-use', 'Use these colours');
  use.type = 'submit';
  const form = el('form', 'color-controls');
  form.append(starts, row, editing, ...mixer.lines, use);
  const body = el('div', 'color-body');
  body.append(example, form);
  card.append(
    el(
      'p',
      'settings-blurb',
      'Choose a tier, then mix its colour or type it in hex. The halo on tiers 6 to 9 has a ' +
        'swatch of its own.',
    ),
    body,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    dismiss();
    spec.onUse({ colors: colors.slice(0, TIER_COUNT), halo: colors[HALO]! });
  });

  mixer.set(colors[chosen]!);
  swatches[chosen]!.focus();
}
