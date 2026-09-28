/**
 * Dressing the page in the presentation settings: the interface's face and the title's as CSS
 * variables, so the menus follow them; the text size as a percentage of the browser's own; and
 * the renderer's slice of the settings, handed to the board directly because nothing cascades
 * into a canvas. Pure functions of the settings and the ladder, so `App` only says when.
 */

import type { BoardDisplay } from './board/view.js';
import type { Settings } from './settings.js';

/** The interface's face on this ladder, with its x-height correction. */
export function wearInterfaceFont(settings: Settings, typeId: string): void {
  const face = settings.interfaceFont(typeId);
  document.documentElement.style.setProperty('--font', face.stack);
  document.documentElement.style.setProperty('--ex-fix', String(face.exHeightFix ?? 1));
}

/** Everything the document wears: the interface's face, the title's, and the text size. */
export function dressDocument(settings: Settings, typeId: string): void {
  wearInterfaceFont(settings, typeId);
  const title = settings.titleFont();
  document.documentElement.style.setProperty('--title-font', title.stack);
  document.documentElement.style.setProperty('--title-ex-fix', String(title.exHeightFix ?? 1));
  // A percentage, so it multiplies the browser's own text size rather than replacing it.
  document.documentElement.style.fontSize = `${settings.presentation.textSize * 100}%`;
}

/** The renderer's slice of the presentation settings. */
export function boardDisplayFor(settings: Settings, typeId: string): BoardDisplay {
  const p = settings.presentation;
  return {
    maxCell: p.maxZoom,
    font: settings.boardFont(typeId),
    glyph: p.glyph,
    highlight: settings.highlightStyle(typeId),
    highlightColor: settings.highlightColor(typeId),
    beatenLook: p.beatenLook,
    digitScale: p.digitSize,
    reachShading: p.reachShading,
    markColor: settings.markColor(typeId),
    longPressMs: p.longPress,
    beatenNumbers: p.beatenNumbers,
    tierColors: settings.tierColors(typeId),
  };
}
