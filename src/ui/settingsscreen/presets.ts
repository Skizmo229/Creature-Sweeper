/**
 * One-click bundles of settings: a row of buttons that each set several settings at once and
 * rebuild the screen, for a player who wants a whole kind of game or a whole kind of look without
 * walking every row. A preset is a patch, so what it sets is what the rows then show, and any row
 * can be moved after it.
 */

import type { GameplaySettings } from '../../engine/settings.js';
import { el } from '../dom.js';
import { MAX_DIGIT_SIZE, MAX_HIGHLIGHT_WIDTH, type PresentationSettings } from '../presentation.js';
import { LEGIBLE_FONT } from '../typefaces.js';
import type { ScreenContext } from './context.js';
import { row } from './widgets.js';

interface Preset<T> {
  readonly name: string;
  readonly blurb: string;
  readonly patch: Partial<T>;
}

/** The gameplay bundles: the tuned game, an easier one that records nothing, a harder one that does. */
const GAMEPLAY_PRESETS: readonly Preset<GameplaySettings>[] = [
  { name: 'Tuned', blurb: 'every dial where the ladders were tuned', patch: {} },
  {
    name: 'Relaxed',
    blurb: 'double HP, half damage, Sweep always on; records nothing',
    patch: { hpRatio: 2, enemyDamageRatio: 0.5, sweep: 'on' },
  },
  {
    name: 'Brutal',
    blurb: 'half HP, double damage, no Sweep, the counters hidden',
    patch: { hpRatio: 0.5, enemyDamageRatio: 2, sweep: 'off', countersHidden: true },
  },
];

/**
 * The presentation bundle for low vision: the legible face everywhere, larger text, the largest
 * digits, the thickest cursor, and every creature drawn as its tier's digit, in white.
 */
const LOW_VISION: Preset<PresentationSettings> = {
  name: 'Low vision',
  blurb: 'the easiest face on the board and the page, larger text and digits, a thick cursor',
  patch: {
    font: LEGIBLE_FONT,
    interfaceFont: LEGIBLE_FONT,
    textSize: 1.5,
    digitSize: MAX_DIGIT_SIZE,
    glyph: 'digit',
    highlightWidth: MAX_HIGHLIGHT_WIDTH,
    tierColors: 'plain',
  },
};

/** A row of buttons, one per preset, each applying its patch through `apply` and rebuilding. */
function presetButtons<T>(
  ctx: ScreenContext,
  presets: readonly Preset<T>[],
  apply: (patch: Partial<T>) => void,
): HTMLElement {
  const box = el('div', 'settings-presets');
  for (const preset of presets) {
    const button = el('button', 'ghost small', preset.name);
    button.title = preset.blurb;
    button.addEventListener('click', () => {
      apply(preset.patch);
      ctx.rebuild();
    });
    box.append(button);
  }
  return box;
}

/** The gameplay presets. The tuned one is every dial's reset. */
export function gameplayPresetsRow(ctx: ScreenContext, host: HTMLElement): void {
  row(
    host,
    'Presets',
    presetButtons(ctx, GAMEPLAY_PRESETS, (patch) => {
      ctx.settings.resetGameplay();
      ctx.settings.setGameplay(patch);
    }),
    GAMEPLAY_PRESETS.map((p) => `${p.name}: ${p.blurb}`).join('. ') + '.',
  );
}

/** The low-vision preset: several rows below, set at once. */
export function lowVisionRow(ctx: ScreenContext, host: HTMLElement): void {
  row(
    host,
    'Low vision',
    presetButtons(ctx, [LOW_VISION], (patch) => ctx.settings.setPresentation(patch)),
    `Sets ${LOW_VISION.blurb}, in one click. Every row it sets can be moved after.`,
  );
}
