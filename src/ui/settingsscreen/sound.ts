/**
 * The Sound section: how loud the game is and whether retuned sounds reach it, for every ladder
 * at once. The pack a ladder speaks in is chosen with its look, in the Presentation section.
 */

import { RATIO_STEP } from '../../engine/settings.js';
import { SFX_EVENTS, type SfxEvent } from '../looktypes.js';
import { DEFAULT_SFX_VOLUME, MAX_SFX_VOLUME } from '../presentation.js';
import type { ScreenContext } from './context.js';
import { openSoundCheck } from './soundcheck.js';
import {
  type Choice,
  gallery,
  percent,
  row,
  section,
  showSliderValue,
  slider,
  toggle,
  wideRow,
} from './widgets.js';

/** The sounds of a single cell: what a big board plays hundreds of. */
const PER_CELL: readonly SfxEvent[] = ['open', 'cascade', 'mark', 'note'];
/** What an action decides: the fights and the results. */
const RESULTS: readonly SfxEvent[] = ['battle', 'kill', 'levelup', 'win', 'lose'];

/** The sets of silenced sounds the row offers by name; the sound check makes any other. */
const PLAYED: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
  readonly silenced: readonly SfxEvent[];
}> = [
  { value: 'every', label: 'Every sound', silenced: [] },
  {
    value: 'noCells',
    label: 'No sound per cell — no open, cascade, mark or note',
    silenced: PER_CELL,
  },
  {
    value: 'results',
    label: 'Results only — fights, level-ups, the win and the loss',
    silenced: SFX_EVENTS.filter((e) => !RESULTS.includes(e)),
  },
];

/** Which of the row's sets this list of silenced sounds is, or 'custom' for any other. */
function playedValue(silenced: readonly SfxEvent[]): string {
  const same = (a: readonly SfxEvent[], b: readonly SfxEvent[]): boolean =>
    a.length === b.length && a.every((e) => b.includes(e));
  return PLAYED.find((set) => same(set.silenced, silenced))?.value ?? 'custom';
}

/** Which sounds the game plays: the named sets, and Custom, which opens the sound check to choose. */
function playedRow(ctx: ScreenContext, host: HTMLElement): void {
  const { p, settings } = ctx;
  const current = playedValue(p.silenced);
  const custom: Choice = {
    value: current === 'custom' ? 'custom' : '',
    label:
      current === 'custom'
        ? `Custom — ${p.silenced.length} silenced`
        : 'Custom — choose in the sound check',
    open: () => openSoundCheck(ctx),
  };
  wideRow(
    host,
    'Which sounds play',
    'The sound check plays and silences each sound one by one. An action whose loudest sound is ' +
      'silenced makes its next loudest instead.',
    gallery(
      [...PLAYED.map((set): Choice => ({ value: set.value, label: set.label })), custom],
      current,
      (v) =>
        settings.setPresentation({ silenced: PLAYED.find((set) => set.value === v)!.silenced }),
      true,
    ),
  );
}

/** The Sound section, appended to the screen. */
export function soundSection(ctx: ScreenContext): void {
  const { p, settings } = ctx;
  const host = section(ctx.host, 'Sound', 'Every sound the game makes, on every ladder.');
  const volume = slider({
    min: 0,
    max: MAX_SFX_VOLUME,
    step: RATIO_STEP,
    value: p.sfxVolume,
    format: percent,
    onInput: (v) => settings.setPresentation({ sfxVolume: v }),
    // Heard on release rather than a sound per step of the drag.
    onRelease: () => ctx.onPreview('levelup'),
    resetTo: DEFAULT_SFX_VOLUME,
  });
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
  playedRow(ctx, host);
  // Updates only the store, like the sound gallery: nothing on the screen is drawn in terms of it.
  row(
    host,
    'Custom pitches in play',
    toggle(p.customPitches, (v) => settings.setPresentation({ customPitches: v })),
    'Sounds retuned in the sound check play at their new pitch in games too. Off, they play at ' +
      'their own pitch and the tuning is kept.',
  );
}
