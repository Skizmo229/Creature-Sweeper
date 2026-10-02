/**
 * A ladder's own presentation settings (decision 0070): which settings a ladder can have of its
 * own, and how a save's are read. Kept apart from `presentation.ts` for that file's size; the
 * store keeps them beside the settings for every ladder (`settings.ts`).
 */

import { type PresentationSettings, readPresentation } from './presentation.js';

/**
 * The settings a ladder can have of its own (decision 0070): what its board looks and sounds
 * like. The rest, the page around the board, the volume, the sound check, the tutor and the ways
 * of playing, are for every ladder, and a choice of one of them made in a ladder's scope is a
 * choice for all.
 */
export const LADDER_SCOPED: readonly (keyof PresentationSettings)[] = [
  'icons',
  'glyph',
  'tierColors',
  // The palette behind a 'custom' choice goes with it: a ladder's own mixed colours would
  // otherwise overwrite the colours mixed for every ladder, and the reader would turn the
  // ladder's saved 'custom' into the default for want of a palette beside it.
  'customTierColors',
  'palette',
  'font',
  'interfaceFont',
  'digitSize',
  'beatenLook',
  'markColor',
  'highlight',
  'highlightColor',
  'highlightWidth',
  'reachShading',
  'maxZoom',
  'startAtCeiling',
  'sfx',
  'fightRim',
  'motion',
  'victory',
  'victoryWhen',
  'cardHold',
  'effectSpeed',
];

/** A ladder's own settings: those of `LADDER_SCOPED` it has chosen, and no others. */
export type LadderOwn = Partial<PresentationSettings>;

/**
 * A saved ladder's own settings, read as the presentation is read and then kept only where the
 * save held the key, so that a ladder is not handed every default as its own; a value the reader
 * cannot read is the default, as it is for every ladder. Ladders this build's data lacks are
 * kept, as an unknown icon is.
 *
 * `shared` is the presentation for every ladder, already read. Its `customTierColors` is the
 * fallback for a save whose ladder chose `custom` without a palette of its own: read alone, that
 * choice would have no palette beside it and fall to the game's own colours; read against the
 * shared palette it stays the choice the player made.
 */
export function readLadderOwn(
  raw: unknown,
  shared: Pick<PresentationSettings, 'customTierColors'> = { customTierColors: null },
): Record<string, LadderOwn> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, LadderOwn> = {};
  for (const [typeId, saved] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof saved !== 'object' || saved === null) continue;
    const read = readPresentation({ customTierColors: shared.customTierColors, ...saved });
    const own: Record<string, unknown> = {};
    for (const key of LADDER_SCOPED) if (key in saved) own[key] = read[key];
    if (Object.keys(own).length) out[typeId] = own as LadderOwn;
  }
  return out;
}
