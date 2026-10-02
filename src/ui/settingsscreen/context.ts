/**
 * What every section of the settings screen needs to know: the store, the ladder the player came
 * from, how things currently look, and how to save a pick. Built once per screen build and handed
 * to each section.
 */

import type { BoardDisplay } from '../board/view.js';
import { boardDisplayFor } from '../dress.js';
import { ladders } from '../ladders.js';
import { sampleBoard, samplePin } from '../preview.js';
import type { PresentationSettings } from '../presentation.js';
import type { Settings } from '../settings.js';
import type { LadderLook, SfxEvent, SfxPackId, TypeTheme } from '../looktypes.js';
import { lookFor } from '../looks.js';
import { CHIP_CELL, DEMO_CELL, renderPreview } from './render.js';
import { inLadderScope } from './scope.js';

/**
 * Play one event from a given pack, for the sound check, transposed by `ratio` and scaled by
 * `volume`; silent while muted.
 */
type Audition = (pack: SfxPackId, event: SfxEvent, ratio?: number, volume?: number) => void;

/** What the app hands the settings screen. */
export interface SettingsScreenOptions {
  settings: Settings;
  /** The ladder the player came from: what "game type default" refers to. */
  typeId: string;
  /**
   * Creature tiers on the board they came from. The clear-effect example carries one of each and
   * none above, so it shows the creatures that can actually turn up where the player is.
   */
  tiers: number;
  onBack: () => void;
  /** Play a sound so a pack can be heard while it is being chosen. */
  onPreview: (event: SfxEvent) => void;
  onAudition: Audition;
}

/** A visual patch to the presentation settings. */
export type PresentationPatch = Parameters<Settings['setPresentation']>[0];

/**
 * What every section of one build of the screen is handed: the store and the ladder, the settings
 * in force and how the board currently looks, the examples' sizes, and the ways to save a pick.
 */
export interface ScreenContext {
  readonly settings: Settings;
  readonly typeId: string;
  readonly tiers: number;
  readonly onPreview: (event: SfxEvent) => void;
  readonly onAudition: Audition;
  /** The screen element: sections append to it, and the picker overlay lives inside it. */
  readonly host: HTMLElement;
  /** The presentation settings in force on this ladder: those for every ladder under its own. */
  readonly p: PresentationSettings;
  /** Whether a pick is for this ladder alone (decision 0070). */
  readonly ladderScope: boolean;
  /** This ladder's own look: what "game type default" resolves to. */
  readonly ownLook: LadderLook;
  /**
   * This ladder's palette and icon as things currently stand: an icon tile wears the palette, and
   * a palette tile the icon (`pip`).
   */
  readonly currentTheme: TypeTheme;
  /** A thumbnail's cell size, at the preview size the player chose. */
  readonly chipCell: number;
  /** The clear-effect demo's cell size, at the preview size the player chose. */
  readonly demoCell: number;
  /** The renderer's view of the current presentation, with overrides for one example. */
  display(over?: Partial<BoardDisplay>): BoardDisplay;
  /** One thumbnail of the standard example board. */
  chipBoard(theme: TypeTheme, over?: Partial<BoardDisplay>): () => HTMLElement;
  /** Save a setting for the scope the screen is in, without redrawing. */
  set(patch: PresentationPatch): void;
  /** Save a visual setting for the scope the screen is in and redraw every example against it. */
  pick(patch: PresentationPatch): void;
  /** Rebuild the screen in place from the store, keeping the scroll position. */
  rebuild(): void;
}

/** A ladder's name as the list shows it, or its id in capitals for one this build lacks. */
export function typeName(typeId: string): string {
  return ladders.find((t) => t.id === typeId)?.name ?? typeId.toUpperCase();
}

/** An example's cell size scaled by the preview size, in whole pixels so its lines stay crisp. */
export function previewCell(base: number, scale: number): number {
  return Math.round(base * scale);
}

/**
 * The context for one build of the screen, read from the store as it stands. A pick rebuilds the
 * screen, and with it the context; a setting saved without a pick is not seen until then.
 */
export function makeContext(
  opts: SettingsScreenOptions,
  host: HTMLElement,
  rebuild: () => void,
): ScreenContext {
  const { settings, typeId, tiers, onPreview, onAudition } = opts;
  const ladderScope = inLadderScope();
  const p = settings.presentationFor(typeId);
  const set = (patch: PresentationPatch): void =>
    settings.setPresentationFor(ladderScope ? typeId : null, patch);
  const currentTheme = settings.themeFor(typeId);
  const chipCell = previewCell(CHIP_CELL, p.previewSize);
  const shown: BoardDisplay = {
    ...boardDisplayFor(settings, typeId),
    // The examples show creatures: where one needs a beaten creature's number, it holds the cursor
    // there (decision 0034), so the game screen's toggle does not reach them.
    beatenNumbers: false,
  };
  const display = (over: Partial<BoardDisplay> = {}): BoardDisplay => ({ ...shown, ...over });
  return {
    settings,
    typeId,
    tiers,
    onPreview,
    onAudition,
    host,
    p,
    ladderScope,
    ownLook: lookFor(typeId),
    currentTheme,
    chipCell,
    demoCell: previewCell(DEMO_CELL, p.previewSize),
    display,
    // Held over a beaten creature, so its number shows in the palette's `hot`, with the cursor
    // highlight off: that has a gallery of its own, and on a thumbnail it buries the cells.
    chipBoard:
      (theme, over = {}) =>
      () =>
        renderPreview(sampleBoard(), theme, display({ highlight: null, ...over }), {
          cell: chipCell,
          pin: samplePin(),
        }).canvas,
    set,
    pick(patch) {
      set(patch);
      rebuild();
    },
    rebuild,
  };
}
