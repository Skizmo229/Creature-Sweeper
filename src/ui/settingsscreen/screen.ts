/**
 * The settings screen, built as a detached element and handed back: it needs the settings store,
 * the ladder the player came from and a way home, and nothing else.
 *
 * Every visual setting shows its options as real boards rather than naming them, every "game
 * type default" says what it resolves to, and the record status line is live (decisions 0014 and
 * 0025). Picking any visual option rebuilds the screen, because the galleries are drawn in terms
 * of each other; scroll position is carried over so the rebuild is invisible.
 */

import { el } from '../dom.js';
import { themeFor } from '../looks.js';
import { sampleBoard } from '../preview.js';
import { type SettingsScreenOptions, makeContext, typeName } from './context.js';
import { clearEffectRow, fightRimRow, soundRow, stopSettingsDemo } from './effects.js';
import { gameplaySection } from './gameplay.js';
import {
  boardFontRow,
  highlightRow,
  iconsRow,
  interfaceFontRow,
  paletteRow,
  strikeRow,
  textSizeRow,
  zoomRow,
} from './look.js';
import { CHIP_CELL } from './render.js';
import { section } from './widgets.js';

export type { SettingsScreenOptions } from './context.js';

export function buildSettingsScreen(opts: SettingsScreenOptions): HTMLElement {
  const { typeId, onBack } = opts;

  stopSettingsDemo();

  const wrap = el('div', 'screen settings-screen');
  wrap.style.setProperty('--tint', themeFor(typeId).accent);
  // A tile with no board in it is sized like one with, so a row of tiles stands level.
  const { width, height } = sampleBoard().config;
  wrap.style.setProperty('--chip-w', `${width * CHIP_CELL}px`);
  wrap.style.setProperty('--chip-h', `${height * CHIP_CELL}px`);

  const back = el('button', 'ghost sticky-back', '← Back');
  back.addEventListener('click', onBack);
  wrap.append(back);
  const head = el('header', 'title-bar');
  head.append(el('h1', undefined, 'Settings'));
  head.append(
    el(
      'p',
      'sub',
      `“Game type default” follows whichever ladder you are on — shown here for ${typeName(typeId)}.`,
    ),
  );
  wrap.append(head);

  /**
   * Rebuild in place. A reset moves every control at once and the galleries describe each other,
   * so rebuilding from the store cannot drift from what was saved.
   */
  const rebuild = (): void => {
    const y = window.scrollY;
    const fresh = buildSettingsScreen(opts);
    wrap.replaceWith(fresh);
    window.scrollTo({ top: y });
  };

  const ctx = makeContext(opts, wrap, rebuild);

  const look = section(
    wrap,
    'Presentation',
    'None of this touches a rule, so none of it affects whether a board counts. ' +
      'Every example below is a real board drawn by the game’s own renderer.',
  );
  iconsRow(ctx, look);
  paletteRow(ctx, look);
  boardFontRow(ctx, look);
  interfaceFontRow(ctx, look);
  textSizeRow(ctx, look);
  highlightRow(ctx, look);
  strikeRow(ctx, look);
  zoomRow(ctx, look);
  soundRow(ctx, look);
  fightRimRow(ctx, look);
  clearEffectRow(ctx, look);

  gameplaySection(ctx);

  const tools = el('div', 'tools');
  const resetLook = el('button', 'ghost', 'Reset presentation');
  resetLook.addEventListener('click', () => {
    ctx.settings.resetPresentation();
    rebuild();
  });
  const resetPlay = el('button', 'ghost', 'Reset gameplay');
  resetPlay.addEventListener('click', () => {
    ctx.settings.resetGameplay();
    rebuild();
  });
  tools.append(resetLook, resetPlay);
  wrap.append(tools);

  return wrap;
}
