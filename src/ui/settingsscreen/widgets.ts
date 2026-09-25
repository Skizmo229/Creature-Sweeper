/**
 * The settings screen's controls: sections and rows, the gallery of option tiles, the picker
 * window behind a "User choice" tile, sliders and toggles. None of them knows what setting it is
 * showing.
 */

import { el } from '../dom.js';
import { DEFAULT } from '../settings.js';
import type { GameFont } from '../typefaces.js';

export interface Choice {
  value: string;
  label: string;
  /** The example for this option, if it has a drawn one. */
  example?: () => HTMLElement;
  /**
   * A face to set the label in, size correction included, so a font's tile names it in its own
   * letters as well as showing it.
   */
  labelFont?: GameFont;
  /** Clicking this tile opens something instead of picking its value (the "User choice" tile). */
  open?: () => void;
}

export function section(host: HTMLElement, title: string, blurb?: string): HTMLElement {
  const box = el('section', 'settings-group');
  box.append(el('h2', 'settings-head', title));
  if (blurb) box.append(el('p', 'settings-blurb', blurb));
  host.append(box);
  return box;
}

export function row(host: HTMLElement, label: string, control: HTMLElement, hint?: string): void {
  const line = el('div', 'settings-row');
  const text = el('div', 'settings-label');
  text.append(el('span', 'settings-name', label));
  if (hint) text.append(el('span', 'settings-hint', hint));
  line.append(text, control);
  host.append(line);
}

/** A row whose control is a gallery, so it gets the full width. */
export function wideRow(
  host: HTMLElement,
  label: string,
  hint: string,
  control: HTMLElement,
): void {
  const line = el('div', 'settings-row wide');
  const text = el('div', 'settings-label');
  text.append(el('span', 'settings-name', label));
  text.append(el('span', 'settings-hint', hint));
  line.append(text, control);
  host.append(line);
}

/**
 * A row of option tiles, each showing what it does.
 *
 * Picking usually rebuilds the whole screen, because the drawn galleries describe each other.
 * `live` is for the two settings nothing else is drawn in terms of, sound and the clear effect:
 * those update their own tiles in place, which is what lets picking one play it on the spot.
 */
export function gallery(
  choices: Choice[],
  current: string,
  onPick: (value: string) => void,
  live = false,
): HTMLElement {
  const box = el('div', 'settings-gallery');
  for (const c of choices) {
    const chip = el('button', 'preview-chip');
    const active = c.value === current;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
    if (c.example) chip.append(c.example());
    const caption = el('span', 'chip-label', c.label);
    if (c.labelFont) {
      caption.style.fontFamily = c.labelFont.stack;
      // Set even when it is 1, or the caption inherits the page's own fix.
      caption.style.setProperty('--ex-fix', String(c.labelFont.exHeightFix ?? 1));
    }
    chip.append(caption);
    if (c.open) chip.setAttribute('aria-haspopup', 'dialog');
    chip.addEventListener('click', () => {
      if (c.open) {
        c.open();
        return;
      }
      if (live) {
        for (const other of box.children) {
          const on = other === chip;
          other.classList.toggle('active', on);
          other.setAttribute('aria-pressed', String(on));
        }
      }
      onPick(c.value);
    });
    box.append(chip);
  }
  return box;
}

/**
 * A window holding every option of one setting, over the settings screen.
 *
 * It lives inside the screen's own element, so the rebuild that follows a pick, or leaving the
 * screen by any route, takes it away with everything else. Escape closes it and is caught before
 * it reaches the app, where Escape on a board in progress means something else. Its examples are
 * drawn only when it opens (decision 0025).
 */
function openPicker(
  screen: HTMLElement,
  title: string,
  options: Choice[],
  current: string,
  onPick: (value: string) => void,
): void {
  const overlay = el('div', 'overlay picker');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  const card = el('div', 'overlay-card picker-card');
  const head = el('div', 'picker-head');
  const close = el('button', 'ghost small', 'Close (Esc)');
  head.append(el('h2', undefined, title), close);

  const dismiss = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!overlay.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    // Immediate as well: an event dispatched at the window itself would otherwise still reach
    // the app's own listener there.
    e.stopImmediatePropagation();
    dismiss();
  };
  close.addEventListener('click', dismiss);
  // A click on the dimmed backdrop, not on the card, closes it too.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  window.addEventListener('keydown', onKey, true);

  card.append(
    head,
    gallery(options, current, (v) => {
      dismiss();
      onPick(v);
    }),
  );
  overlay.append(card);
  screen.append(overlay);
  (card.querySelector<HTMLElement>('.preview-chip.active') ?? close).focus();
}

export interface ChoiceRowSpec {
  label: string;
  hint: string;
  /** What the window is titled, e.g. "Choose a font". */
  title: string;
  current: string;
  /** The game type default, already naming what it resolves to. */
  fallback: Choice;
  options: Choice[];
  onPick: (value: string) => void;
}

/**
 * A setting with more options than a row can show: two tiles, the game type's own and the
 * player's own, and every option in a window behind the second. The "user choice" tile wears the
 * option chosen, so both tiles still show what they do; before anything is chosen it says how many
 * there are to choose from.
 */
export function choiceRow(screen: HTMLElement, host: HTMLElement, spec: ChoiceRowSpec): void {
  const chosen =
    spec.current === DEFAULT ? undefined : spec.options.find((o) => o.value === spec.current);
  const placeholder = (): HTMLElement =>
    el('div', 'picker-placeholder', `${spec.options.length} to choose from`);
  const user: Choice = {
    // Matches `current` only when an option is chosen, so the tile is lit exactly when the
    // player's choice is the one in force.
    value: chosen ? chosen.value : '',
    label: chosen ? `User choice — ${chosen.label}` : 'User choice — pick one',
    example: chosen?.example ?? placeholder,
    ...(chosen?.labelFont ? { labelFont: chosen.labelFont } : {}),
    open: () => openPicker(screen, spec.title, spec.options, spec.current, spec.onPick),
  };
  wideRow(host, spec.label, spec.hint, gallery([spec.fallback, user], spec.current, spec.onPick));
}

/**
 * A slider with its value spelled out beside it.
 *
 * `input` rather than `change`, so the number under the thumb tracks the drag. `onCommit`, if
 * given, fires once on release, for a setting too big to apply on every frame of a drag.
 */
export function slider(
  min: number,
  max: number,
  step: number,
  current: number,
  format: (v: number) => string,
  onSet: (value: number) => void,
  onCommit?: (value: number) => void,
): HTMLElement {
  const box = el('div', 'settings-slider');
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(current);
  const read = el('span', 'settings-value', format(current));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    read.textContent = format(v);
    onSet(v);
  });
  if (onCommit) input.addEventListener('change', () => onCommit(Number(input.value)));
  box.append(input, read);
  return box;
}

export function toggle(current: boolean, onSet: (v: boolean) => void): HTMLElement {
  const label = el('label', 'toggle');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = current;
  box.addEventListener('change', () => onSet(box.checked));
  label.append(box, el('span', undefined, 'On'));
  return label;
}

export const ratio = (v: number): string => `×${v.toFixed(2)}`;
