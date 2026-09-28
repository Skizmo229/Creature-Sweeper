/**
 * One-click bundles of settings, and the fullscreen button: a row of buttons that each set
 * several settings at once and rebuild the screen, for a player who wants a whole kind of game
 * or a whole kind of look without walking every row. A preset is a patch, so what it sets is
 * what the rows then show, and any row can be moved after it.
 */

import type { GameplaySettings } from '../../engine/settings.js';
import { el } from '../dom.js';
import type { PresentationSettings } from '../presentation.js';
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

/** The presentation bundle for low vision: the legible face everywhere, everything larger, tiers by count. */
const LOW_VISION: Preset<PresentationSettings> = {
  name: 'Low vision',
  blurb: 'the easiest face on the board and the page, larger text and digits, a thick cursor',
  patch: {
    font: LEGIBLE_FONT,
    interfaceFont: LEGIBLE_FONT,
    textSize: 1.5,
    digitSize: 1.4,
    glyph: 'digit',
    highlightWidth: 4,
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

/**
 * Fullscreen, as a button rather than a setting: a browser lets a page go fullscreen only from a
 * click, so it cannot be kept and applied on arrival. Not every browser offers it, and the
 * itch.io frame is small, which is what this is for.
 */
export function fullscreenRow(ctx: ScreenContext, host: HTMLElement): void {
  const page = document.documentElement;
  const offered = typeof page.requestFullscreen === 'function';
  const button = el('button', 'ghost small');
  const paint = (): void => {
    button.textContent = document.fullscreenElement ? 'Leave fullscreen' : 'Fullscreen';
  };
  button.disabled = !offered;
  button.addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void page.requestFullscreen?.();
  });
  const unhook = (): void => {
    if (!button.isConnected) document.removeEventListener('fullscreenchange', onChange);
  };
  const onChange = (): void => {
    paint();
    unhook();
  };
  document.addEventListener('fullscreenchange', onChange);
  paint();
  // In the presets' box, so the button is its own width rather than the column's.
  const box = el('div', 'settings-presets');
  box.append(button);
  row(
    host,
    'Fullscreen',
    box,
    offered
      ? 'The whole screen, until Escape or the button. A browser allows it from a click only, so ' +
          'it is not kept between visits.'
      : 'This browser does not offer it.',
  );
  void ctx;
}
