/**
 * The settings screen's controls: sections and rows, the gallery of option tiles, the picker
 * window behind a "User choice" tile, sliders and toggles. None of them knows what setting it is
 * showing.
 */

import { el } from '../dom.js';
import { keepFocus } from '../overlays/modal.js';
import { DEFAULT } from '../presentation.js';
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

/** An option's tile: its example and its name, lit when it is the option in force. */
function optionTile(c: Choice, current: string): HTMLButtonElement {
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
  return chip;
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
    const chip = optionTile(c, current);
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
 * A window over the settings screen: a card with a title bar and a close button, handed back to
 * be filled.
 *
 * It lives inside the screen's own element, so the rebuild that follows a pick, or leaving the
 * screen by any route, takes it away with everything else. Escape closes it and is caught before
 * it reaches the app, where Escape on a board in progress means something else.
 */
export function settingsWindow(
  screen: HTMLElement,
  title: string,
  cardClass = '',
): { card: HTMLElement; close: HTMLElement; dismiss: () => void } {
  const overlay = el('div', 'overlay picker');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);
  const card = el('div', `overlay-card picker-card ${cardClass}`.trim());
  const head = el('div', 'picker-head');
  const close = el('button', 'ghost small', 'Close (Esc)');
  head.append(el('h2', undefined, title), close);

  const giveFocusBack = keepFocus();
  const dismiss = (): void => {
    overlay.remove();
    window.removeEventListener('keydown', onKey, true);
    giveFocusBack();
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

  card.append(head);
  overlay.append(card);
  screen.append(overlay);
  return { card, close, dismiss };
}

/** A run of a picker's options, shown under its heading if it has one. */
export interface SortGroup {
  heading?: string;
  values: readonly string[];
}

/** One order a picker can show its options in: every option's value exactly once, in runs. */
export interface PickerSort {
  /** Its button, after "Sort by". */
  label: string;
  groups: readonly SortGroup[];
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
  /** The orders the window offers, the first by default; without any, the options' own. */
  sorts?: readonly PickerSort[];
  onPick: (value: string) => void;
}

/** The order each window last showed, by its title, so it reopens the way the player left it. */
const lastSort = new Map<string, string>();

/** "Sort by" and a button for each order, the one showing lit; a press lays the tiles out again. */
function sortBar(
  title: string,
  sorts: readonly PickerSort[],
  lay: (groups: readonly SortGroup[]) => void,
): HTMLElement {
  const bar = el('div', 'picker-sorts');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Sort by');
  const name = el('span', 'picker-sorts-name', 'Sort by');
  name.setAttribute('aria-hidden', 'true');
  const buttons = sorts.map((s) => el('button', 'picker-sort', s.label));
  const show = (sort: PickerSort): void => {
    lastSort.set(title, sort.label);
    sorts.forEach((s, i) => {
      buttons[i]!.classList.toggle('active', s === sort);
      buttons[i]!.setAttribute('aria-pressed', String(s === sort));
    });
    lay(sort.groups);
  };
  sorts.forEach((s, i) => buttons[i]!.addEventListener('click', () => show(s)));
  bar.append(name, ...buttons);
  show(sorts.find((s) => s.label === lastSort.get(title)) ?? sorts[0]!);
  return bar;
}

/**
 * A window holding every option of one setting. Its examples are drawn only when it opens
 * (decision 0025), and a sort moves the tiles already drawn rather than drawing them again. A
 * tile that opens a window of its own closes this one first, so only one window is ever open to
 * take Escape.
 */
function openPicker(screen: HTMLElement, spec: ChoiceRowSpec): void {
  const { card, close, dismiss } = settingsWindow(screen, spec.title);
  const tiles = new Map<string, HTMLElement>();
  for (const c of spec.options) {
    const tile = optionTile(c, spec.current);
    tile.addEventListener('click', () => {
      dismiss();
      if (c.open) c.open();
      else spec.onPick(c.value);
    });
    tiles.set(c.value, tile);
  }
  const body = el('div', 'picker-body');
  const lay = (groups: readonly SortGroup[]): void => {
    body.replaceChildren(
      ...groups.flatMap((g) => {
        const box = el('div', 'settings-gallery');
        box.append(...g.values.map((v) => tiles.get(v)!));
        return g.heading ? [el('h3', 'picker-group-head', g.heading), box] : [box];
      }),
    );
  };
  if (spec.sorts?.length) card.append(sortBar(spec.title, spec.sorts, lay));
  else lay([{ values: spec.options.map((c) => c.value) }]);
  card.append(body);
  (card.querySelector<HTMLElement>('.preview-chip.active') ?? close).focus();
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
    open: () => openPicker(screen, spec),
  };
  wideRow(host, spec.label, spec.hint, gallery([spec.fallback, user], spec.current, spec.onPick));
}

/**
 * A slider with its value spelled out beside it.
 *
 * `input` rather than `change`, so the number under the thumb tracks the drag. `onCommit`, if
 * given, fires once on release, for a setting too big to apply on every frame of a drag. With a
 * `defaultValue` the slider carries a Reset, lit while it stands anywhere else, which moves it
 * there as a drag and a release would: a slider is the one control on the screen with no tile
 * to say what the default is, or to get back to it short of resetting its whole section.
 */
export function slider(
  min: number,
  max: number,
  step: number,
  current: number,
  format: (v: number) => string,
  onSet: (value: number) => void,
  onCommit?: (value: number) => void,
  defaultValue?: number,
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
  if (defaultValue !== undefined) {
    box.dataset.default = String(defaultValue);
    const reset = el('button', 'ghost small settings-reset', 'Reset');
    reset.type = 'button';
    reset.title = `Back to ${format(defaultValue)}`;
    reset.addEventListener('click', () => {
      input.value = String(defaultValue);
      // Through the input's own events, so everything listening to the drag hears the reset.
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
    });
    input.addEventListener('input', () => syncReset(box));
    box.append(reset);
    syncReset(box);
  }
  return box;
}

/** A slider's Reset is lit only while the slider stands off its default. */
function syncReset(box: HTMLElement): void {
  const reset = box.querySelector<HTMLButtonElement>('.settings-reset');
  if (!reset) return;
  reset.disabled = box.querySelector('input')!.value === box.dataset.default;
}

/** Move a `slider` to a value set somewhere else, without calling its handlers. */
export function showSliderValue(
  box: HTMLElement,
  value: number,
  format: (v: number) => string,
): void {
  box.querySelector('input')!.value = String(value);
  box.querySelector('.settings-value')!.textContent = format(value);
  syncReset(box);
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
