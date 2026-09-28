/**
 * The settings screen's scope: whether the presentation choices below are for every ladder or
 * for the ladder the player came from alone (decision 0070). A switch under the title, and in
 * the ladder's scope a line naming what the ladder already has of its own, with a way to give it
 * up. Only the look and sound of a board can be a ladder's own; the interface, the sound's
 * volume and the gameplay dials are for every ladder, and their sections wait for that scope.
 */

import { el } from '../dom.js';
import { LADDER_SCOPED } from '../ladderown.js';
import type { PresentationSettings } from '../presentation.js';
import type { ScreenContext } from './context.js';
import { typeName } from './context.js';

/**
 * The scope the screen is showing. Module-level so it outlives a rebuild, since a pick rebuilds
 * the screen; it means "this ladder" whichever ladder the screen was opened from.
 */
let ladderScope = false;

/** Whether the screen's choices are for the ladder the player came from alone. */
export function inLadderScope(): boolean {
  return ladderScope;
}

/** What the settings screen calls each setting a ladder can have of its own. */
const OWN_NAMES: Partial<Record<keyof PresentationSettings, string>> = {
  icons: 'icons',
  glyph: 'creature tiers',
  tierColors: 'creature colours',
  palette: 'palette',
  font: 'board font',
  interfaceFont: 'interface font',
  digitSize: 'digit size',
  beatenLook: 'beaten creatures',
  markColor: 'mark colour',
  highlight: 'cursor highlight',
  highlightColor: 'highlight colour',
  highlightWidth: 'highlight thickness',
  reachShading: 'reach shading',
  maxZoom: 'zoom ceiling',
  startAtCeiling: 'starting zoom',
  sfx: 'sound effects',
  fightRim: 'glow after a fight',
  motion: 'motion after a fight',
  victory: 'clear effect',
  victoryWhen: 'when the clear effect plays',
  cardHold: 'clear card',
  effectSpeed: 'clear effect speed',
};

/** The switch, and in the ladder's scope the line saying what it has of its own. */
export function scopeBar(ctx: ScreenContext, host: HTMLElement): void {
  const { settings, typeId } = ctx;
  const name = typeName(typeId);
  const bar = el('div', 'settings-scope');
  const choose = (label: string, ladder: boolean): HTMLButtonElement => {
    const button = el('button', ladder === ladderScope ? 'small active' : 'ghost small', label);
    button.setAttribute('aria-pressed', String(ladder === ladderScope));
    button.addEventListener('click', () => {
      if (ladder === ladderScope) return;
      ladderScope = ladder;
      ctx.rebuild();
    });
    return button;
  };
  bar.append(
    el('span', 'settings-scope-name', 'These settings are for'),
    choose('Every ladder', false),
    choose(`${name} only`, true),
  );
  host.append(bar);
  if (!ladderScope) return;

  const own = LADDER_SCOPED.filter((key) => settings.ownKeys(typeId).includes(key));
  const note = el('p', 'settings-blurb settings-scope-note');
  note.textContent = own.length
    ? `Choices below change ${name} alone. ${name} has its own: ` +
      `${own.map((key) => OWN_NAMES[key] ?? key).join(', ')}.`
    : `Choices below change ${name} alone; every other ladder keeps the settings for all.`;
  host.append(note);
  if (own.length) {
    const clear = el('button', 'ghost small', `Give ${name} the settings for every ladder`);
    clear.addEventListener('click', () => {
      settings.clearLadder(typeId);
      ctx.rebuild();
    });
    host.append(clear);
  }
}
