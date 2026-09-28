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
import { type SettingsScreenOptions, makeContext, previewCell, typeName } from './context.js';
import { clearEffectRow, fightRimRow, motionRow, soundRow, stopSettingsDemo } from './effects.js';
import {
  digitSizeRow,
  glyphRow,
  highlightWidthRow,
  markColorRow,
  reachShadingRow,
  startAtCeilingRow,
} from './board.js';
import { gameplaySection } from './gameplay.js';
import { interfaceSection } from './interface.js';
import {
  beatenLookRow,
  boardFontRow,
  highlightColorRow,
  highlightRow,
  iconsRow,
  interfaceFontRow,
  paletteRow,
  tierColorsRow,
  zoomRow,
} from './look.js';
import { CHIP_CELL } from './render.js';
import { soundSection } from './sound.js';
import { scopeBar } from './scope.js';
import { section } from './widgets.js';

export type { SettingsScreenOptions } from './context.js';

export function buildSettingsScreen(opts: SettingsScreenOptions): HTMLElement {
  const { typeId, onBack } = opts;

  stopSettingsDemo();

  const wrap = el('div', 'screen settings-screen');
  wrap.style.setProperty('--tint', themeFor(typeId).accent);
  // A tile with no board in it is sized like one with, so a row of tiles stands level.
  const { width, height } = sampleBoard().config;
  const cell = previewCell(CHIP_CELL, opts.settings.presentation.previewSize);
  wrap.style.setProperty('--chip-w', `${width * cell}px`);
  wrap.style.setProperty('--chip-h', `${height * cell}px`);

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
  scopeBar(ctx, head);

  const look = section(
    wrap,
    'Presentation',
    'None of this touches a rule or a record. Every example is a real board drawn by the game.',
  );
  iconsRow(ctx, look);
  glyphRow(ctx, look);
  tierColorsRow(ctx, look);
  paletteRow(ctx, look);
  boardFontRow(ctx, look);
  digitSizeRow(ctx, look);
  interfaceFontRow(ctx, look);
  markColorRow(ctx, look);
  highlightRow(ctx, look);
  highlightColorRow(ctx, look);
  highlightWidthRow(ctx, look);
  beatenLookRow(ctx, look);
  reachShadingRow(ctx, look);
  zoomRow(ctx, look);
  startAtCeilingRow(ctx, look);
  soundRow(ctx, look);
  fightRimRow(ctx, look);
  motionRow(ctx, look);
  clearEffectRow(ctx, look);

  // What a ladder cannot have of its own waits for the scope that can set it.
  if (ctx.ladderScope) {
    wrap.append(
      el(
        'p',
        'settings-blurb',
        'The interface, the sound and the gameplay dials are for every ladder; switch to Every ' +
          'ladder above to set them.',
      ),
    );
  } else {
    interfaceSection(ctx);
    soundSection(ctx);
    gameplaySection(ctx);
  }

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
