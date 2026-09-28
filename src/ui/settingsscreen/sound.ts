/**
 * The Sound section: how loud the game is and whether retuned sounds reach it, for every ladder
 * at once. The pack a ladder speaks in is chosen with its look, in the Presentation section.
 */

import { DEFAULT_SFX_VOLUME, MAX_SFX_VOLUME } from '../presentation.js';
import type { ScreenContext } from './context.js';
import { row, section, showSliderValue, slider, toggle } from './widgets.js';

export function soundSection(ctx: ScreenContext): void {
  const { p, settings } = ctx;
  const host = section(ctx.host, 'Sound', 'Every sound the game makes, on every ladder.');
  const percent = (v: number): string => `${Math.round(v * 100)}%`;
  const volume = slider(
    0,
    MAX_SFX_VOLUME,
    0.05,
    p.sfxVolume,
    percent,
    (v) => settings.setPresentation({ sfxVolume: v }),
    // Heard on release rather than a sound per step of the drag.
    () => ctx.onPreview('levelup'),
    DEFAULT_SFX_VOLUME,
  );
  // The speaker's own slider sets the same volume, and can while this screen is open.
  const unhook = settings.onChange(() => {
    if (volume.isConnected) showSliderValue(volume, settings.presentation.sfxVolume, percent);
    else unhook();
  });
  row(
    host,
    'Sound effects volume',
    volume,
    'How loud every sound in play is, up to three times usual; past 100% the loudest are held ' +
      'back. The speaker in the corner shows this slider too. The sound check has its own volume.',
  );
  // Updates only the store, like the sound gallery: nothing on the screen is drawn in terms of it.
  row(
    host,
    'Custom pitches in play',
    toggle(p.customPitches, (v) => settings.setPresentation({ customPitches: v })),
    'Sounds retuned in the sound check play at their new pitch in games too. Off, they play at ' +
      'their own pitch and the tuning is kept.',
  );
}
