/**
 * The speaker in the corner: one switch for every sound in the game, and under it the volume,
 * shown while the speaker is hovered or reached by keyboard. It lives on `document.body` rather
 * than in the app root, because every screen begins by clearing the root, and "always there" has
 * to mean surviving that. Drawn as inline SVG, not a character: the font is a player setting, and
 * a glyph renders as tofu under a face that lacks it (decision 0024).
 */

import { el } from './dom.js';
import { MAX_SFX_VOLUME, type Settings } from './settings.js';

/** The same step as the settings screen's slider, so the two always land on the same values. */
const VOLUME_STEP = 0.05;

const percent = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * Build the speaker and keep it painted from the store. It repaints on every change, whoever made
 * it, because "Reset presentation" clears `muted` and the settings screen sets the volume too.
 * `preview` plays a sound at the level just let go of.
 */
export function buildSpeaker(settings: Settings, preview: () => void): void {
  const root = el('div', 'speaker');
  const button = el('button', 'mute-toggle');
  button.type = 'button';
  button.addEventListener('click', () =>
    settings.setPresentation({ muted: !settings.presentation.muted }),
  );

  // After the button, so Tab reaches it next; the button having focus is what shows it.
  const pop = el('div', 'volume-pop');
  const volume = el('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = String(MAX_SFX_VOLUME);
  volume.step = String(VOLUME_STEP);
  volume.setAttribute('aria-label', 'Sound effects volume');
  const readout = el('span', 'volume-readout');
  // Reaching for the volume is reaching to hear it, so moving it turns a muted game back on.
  volume.addEventListener('input', () =>
    settings.setPresentation({ sfxVolume: Number(volume.value), muted: false }),
  );
  // Heard on release, as on the settings screen, rather than a sound per step of the drag.
  volume.addEventListener('change', preview);
  pop.append(volume, readout);

  root.append(button, pop);
  document.body.append(root);
  const paint = (): void => paintSpeaker(button, volume, readout, settings);
  settings.onChange(paint);
  paint();
}

/** Repaint the speaker and its volume for the current state, and say so for screen readers. */
function paintSpeaker(
  button: HTMLButtonElement,
  volume: HTMLInputElement,
  readout: HTMLElement,
  settings: Settings,
): void {
  const { muted, sfxVolume } = settings.presentation;
  // The cone is common to both; muted adds the cross, unmuted the waves. A label as well as a
  // title, because an icon-only control is unreadable to anything that cannot see it.
  const cone = 'M4 9.5h3.2L11.5 6v12L7.2 14.5H4z';
  button.innerHTML =
    `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
    `<path d="${cone}" />` +
    (muted
      ? `<path class="mute-slash" d="M15 9.5l5 5M20 9.5l-5 5" />`
      : `<path class="mute-wave" d="M14.5 9a4.5 4.5 0 010 6M17.5 6.8a8 8 0 010 10.4" />`) +
    `</svg>`;
  button.classList.toggle('is-muted', muted);
  const label = muted ? 'Sound off — click to turn sound on' : 'Sound on — click to turn sound off';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(muted));

  volume.value = String(sfxVolume);
  volume.setAttribute('aria-valuetext', percent(sfxVolume));
  readout.textContent = percent(sfxVolume);
}
