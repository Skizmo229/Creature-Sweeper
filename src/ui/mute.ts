/**
 * The speaker in the corner: one switch for every sound in the game. It lives on
 * `document.body` rather than in the app root, because every screen begins by clearing the
 * root, and "always there" has to mean surviving that. Drawn as inline SVG, not a character: the
 * font is a player setting, and a glyph renders as tofu under a face that lacks it (decision
 * 0024).
 */

import { el } from './dom.js';

export function buildMuteButton(onToggle: () => void): HTMLElement {
  const btn = el('button', 'mute-toggle');
  btn.type = 'button';
  btn.addEventListener('click', onToggle);
  document.body.append(btn);
  return btn;
}

/** Repaint the speaker for the current state, and say so for screen readers. */
export function syncMuteButton(btn: HTMLElement, muted: boolean): void {
  // The cone is common to both; muted adds the cross, unmuted the waves. A label as well as a
  // title, because an icon-only control is unreadable to anything that cannot see it.
  const cone = 'M4 9.5h3.2L11.5 6v12L7.2 14.5H4z';
  btn.innerHTML =
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="${cone}" />` +
    (muted
      ? `<path class="mute-slash" d="M15 9.5l5 5M20 9.5l-5 5" />`
      : `<path class="mute-wave" d="M14.5 9a4.5 4.5 0 010 6M17.5 6.8a8 8 0 010 10.4" />`) +
    `</svg>`;
  btn.classList.toggle('is-muted', muted);
  const label = muted ? 'Sound off — click to turn sound on' : 'Sound on — click to turn sound off';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(muted));
}
