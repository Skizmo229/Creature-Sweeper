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
import {
  type ScreenContext,
  type SettingsScreenOptions,
  makeContext,
  typeName,
} from './context.js';
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
import { soundSection } from './sound.js';
import { scopeBar } from './scope.js';
import { section } from './widgets.js';

export type { SettingsScreenOptions } from './context.js';

/** The Presentation section's rows, top to bottom. */
const PRESENTATION_ROWS: readonly ((ctx: ScreenContext, host: HTMLElement) => void)[] = [
  iconsRow,
  glyphRow,
  tierColorsRow,
  paletteRow,
  boardFontRow,
  digitSizeRow,
  interfaceFontRow,
  markColorRow,
  highlightRow,
  highlightColorRow,
  highlightWidthRow,
  beatenLookRow,
  reachShadingRow,
  zoomRow,
  startAtCeilingRow,
  soundRow,
  fightRimRow,
  motionRow,
  clearEffectRow,
];

/** The screen's title, and the line naming the ladder whose defaults it shows. */
function titleBar(typeId: string): HTMLElement {
  const head = el('header', 'title-bar');
  head.append(el('h1', undefined, 'Settings'));
  head.append(
    el(
      'p',
      'sub',
      `“Game type default” follows whichever ladder you are on — shown here for ${typeName(typeId)}.`,
    ),
  );
  return head;
}

/** The two resets at the foot of the screen, each rebuilding it from the store. */
function resetTools(ctx: ScreenContext, rebuild: () => void): HTMLElement {
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
  return tools;
}

/** The settings screen, built detached and handed back; it rebuilds itself in place. */
export function buildSettingsScreen(opts: SettingsScreenOptions): HTMLElement {
  const { typeId, onBack } = opts;

  stopSettingsDemo();

  const wrap = el('div', 'screen settings-screen');
  // Rebuild in place. A reset moves every control at once and the galleries describe each other,
  // so rebuilding from the store cannot drift from what was saved.
  const rebuild = (): void => {
    const y = window.scrollY;
    const fresh = buildSettingsScreen(opts);
    wrap.replaceWith(fresh);
    window.scrollTo({ top: y });
  };
  const ctx = makeContext(opts, wrap, rebuild);

  wrap.style.setProperty('--tint', themeFor(typeId).accent);
  // A tile with no board in it is sized like one with, so a row of tiles stands level.
  const { width, height } = sampleBoard().config;
  wrap.style.setProperty('--chip-w', `${width * ctx.chipCell}px`);
  wrap.style.setProperty('--chip-h', `${height * ctx.chipCell}px`);

  const back = el('button', 'ghost sticky-back', '← Back');
  back.addEventListener('click', onBack);
  const head = titleBar(typeId);
  wrap.append(back, head);
  scopeBar(ctx, head);

  const look = section(
    wrap,
    'Presentation',
    'None of this touches a rule or a record. Every example is a real board drawn by the game.',
  );
  for (const row of PRESENTATION_ROWS) row(ctx, look);

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

  wrap.append(resetTools(ctx, rebuild));
  return wrap;
}
