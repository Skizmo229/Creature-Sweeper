/**
 * The Interface section: what the page around the board wears and how it behaves, for every
 * ladder at once. The text size, the size of the settings screen's own examples, and where a
 * game-type card wears its ladder's colour.
 */

import { el } from '../dom.js';
import { clockText } from '../game/hud.js';
import { sampleBoard, samplePin } from '../preview.js';
import {
  type ClockStyle,
  DEFAULT_PREVIEW_SIZE,
  DEFAULT_TEXT_SIZE,
  MAX_PREVIEW_SIZE,
  MAX_TEXT_SIZE,
  type MenuStrip,
  MIN_PREVIEW_SIZE,
  MIN_TEXT_SIZE,
  OFF,
} from '../presentation.js';
import { type PresentationPatch, type ScreenContext, previewCell, typeName } from './context.js';
import { hudCopy } from './look.js';
import { CHIP_CELL, renderPreview } from './render.js';
import { gallery, row, section, slider, toggle, wideRow } from './widgets.js';

export function interfaceSection(ctx: ScreenContext): void {
  const host = section(ctx.host, 'Interface', 'The page around the board, on every ladder.');
  textSizeRow(ctx, host);
  previewSizeRow(ctx, host);
  menuStripRow(ctx, host);
  clockRow(ctx, host);
  row(
    host,
    'Hint line',
    toggle(ctx.p.hintLine, (v) => ctx.settings.setPresentation({ hintLine: v })),
    'The line under the board saying what a click does now and which keys do what. The tutor ' +
      'and the lessons speak there whatever this says.',
  );
}

/** A copy of the HUD's clock readout, as a sample of a style. */
function clockSample(text: string): () => HTMLElement {
  return () => {
    const copy = el('div', 'hud clock-demo');
    copy.append(el('span', 'hud-item hud-t', text));
    return copy;
  };
}

/** The clock's style, each shown as the readout it gives at two minutes and five seconds in. */
function clockRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p } = ctx;
  const sample = 125;
  const at = (style: ClockStyle): string => `TIME ${clockText(sample, style)}`;
  wideRow(
    host,
    'Clock',
    'How the time reads in the HUD, or hidden. The clock runs either way, so best times and Time ' +
      'Attack are unchanged.',
    gallery(
      [
        { value: 'seconds', label: 'Seconds', example: clockSample(at('seconds')) },
        { value: 'minutes', label: 'Minutes and seconds', example: clockSample(at('minutes')) },
        { value: 'hidden', label: 'Hidden' },
      ],
      p.clock,
      (v) => ctx.pick({ clock: v as ClockStyle }),
    ),
  );
}

/**
 * Save a setting that resizes the screen, from a slider in `control`. Rebuilding reflows
 * everything above the row, so the row is held where the player's pointer left it rather than
 * where the scroll offset says. `control` carries `data-setting`, so its rebuilt copy is found.
 */
function pickHoldingRow(ctx: ScreenContext, control: HTMLElement, patch: PresentationPatch): void {
  const before = control.getBoundingClientRect().top;
  ctx.pick(patch);
  const after = document
    .querySelector(`[data-setting="${control.dataset.setting}"]`)
    ?.getBoundingClientRect().top;
  if (after !== undefined) window.scrollBy(0, after - before);
}

/**
 * The whole page is the example, but not DURING a drag: resizing every line on the screen moves
 * the slider out from under the pointer. So a copy of the HUD follows the thumb, and the page
 * itself changes once, on release.
 */
function textSizeRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p } = ctx;
  const textDemo = hudCopy('text-size-demo', ctx.display().tierColors);
  const showTextSize = (size: number): void => {
    // Relative to what the page is already set at, which is what rem means.
    textDemo.style.setProperty('--demo-scale', String(size / p.textSize));
  };
  const textControl = el('div', 'settings-stack');
  textControl.dataset.setting = 'textSize';
  textControl.append(
    slider(
      MIN_TEXT_SIZE,
      MAX_TEXT_SIZE,
      0.05,
      p.textSize,
      (v) => `${Math.round(v * 100)}%`,
      showTextSize,
      (v) => pickHoldingRow(ctx, textControl, { textSize: v }),
      DEFAULT_TEXT_SIZE,
    ),
  );
  textControl.append(textDemo);

  wideRow(
    host,
    'Text size',
    'The HUD, the menus and this screen. The board is sized by zoom instead.',
    textControl,
  );
}

/**
 * Every example board on this screen is drawn again at the new size, so, like the text size, the
 * screen changes on release; while the thumb moves, one thumbnail beside it follows. The zoom
 * example is left alone: it is drawn at the size it sets.
 */
function previewSizeRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, currentTheme } = ctx;
  const sample = el('div', 'preview-size-demo');
  const drawSample = (size: number): void => {
    sample.replaceChildren(
      renderPreview(sampleBoard(), currentTheme, ctx.display({ highlight: null }), {
        cell: previewCell(CHIP_CELL, size),
        pin: samplePin(),
      }).canvas,
    );
  };
  drawSample(p.previewSize);

  const control = el('div', 'settings-stack');
  control.dataset.setting = 'previewSize';
  control.append(
    slider(
      MIN_PREVIEW_SIZE,
      MAX_PREVIEW_SIZE,
      0.05,
      p.previewSize,
      (v) => `${Math.round(v * 100)}%`,
      drawSample,
      (v) => pickHoldingRow(ctx, control, { previewSize: v }),
      DEFAULT_PREVIEW_SIZE,
    ),
  );
  control.append(sample);

  wideRow(
    host,
    'Preview size',
    'The example boards on this screen and in its windows. The zoom example keeps its own size.',
    control,
  );
}

/** Each option is shown on a copy of this ladder's own card from the ladder list. */
function menuStripRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, typeId } = ctx;
  const card = (strip: MenuStrip) => (): HTMLElement => {
    const demo = el('div', `type-card strip-${strip} strip-demo`);
    demo.append(el('span', 'type-name', typeName(typeId)));
    demo.append(el('span', 'type-meta', '0 boards cleared'));
    return demo;
  };
  wideRow(
    host,
    'Palette strip on the game types',
    'Where each card on the list of game types wears its ladder’s colour.',
    gallery(
      [
        { value: 'left', label: 'Default — down the left side', example: card('left') },
        { value: 'sides', label: 'Palette strip on vertical sides', example: card('sides') },
        { value: 'all', label: 'Palette strip on all sides', example: card('all') },
        { value: OFF, label: 'No palette strip', example: card(OFF) },
      ],
      p.menuStrip,
      (v) => ctx.pick({ menuStrip: v as MenuStrip }),
    ),
  );
}
