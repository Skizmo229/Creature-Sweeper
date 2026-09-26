/**
 * What every section of the settings screen needs to know: the store, the ladder the player came
 * from, how things currently look, and how to save a pick. Built once per screen build and handed
 * to each section.
 */

import type { BoardDisplay } from '../board/view.js';
import { ladders } from '../ladders.js';
import { sampleBoard, samplePin } from '../preview.js';
import { DEFAULT, type PresentationSettings, type Settings } from '../settings.js';
import type { SfxEvent } from '../sfx.js';
import {
  type LadderLook,
  type Pip,
  type SfxPackId,
  type TypeTheme,
  lookFor,
  themeFor,
} from '../looks.js';
import { CHIP_CELL, DEMO_CELL, renderPreview } from './render.js';

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
  /**
   * Play one event from a given pack, for the sound check, transposed by `ratio` and scaled by
   * `volume`; silent while muted.
   */
  onAudition: (pack: SfxPackId, event: SfxEvent, ratio?: number, volume?: number) => void;
}

/** A visual patch to the presentation settings. */
export type PresentationPatch = Parameters<Settings['setPresentation']>[0];

export interface ScreenContext {
  readonly settings: Settings;
  readonly typeId: string;
  readonly tiers: number;
  readonly onPreview: (event: SfxEvent) => void;
  readonly onAudition: (pack: SfxPackId, event: SfxEvent, ratio?: number, volume?: number) => void;
  /** The screen element: sections append to it, and the picker overlay lives inside it. */
  readonly host: HTMLElement;
  /** The presentation settings as saved. */
  readonly p: PresentationSettings;
  readonly ident: LadderLook;
  /** This ladder's icon as things currently stand, which a palette tile wears. */
  readonly currentPip: Pip;
  /** This ladder's palette as things currently stand, which an icon tile wears. */
  readonly currentTheme: TypeTheme;
  /** A thumbnail's cell size, at the preview size the player chose. */
  readonly chipCell: number;
  /** The clear-effect demo's cell size, at the preview size the player chose. */
  readonly demoCell: number;
  /** The renderer's view of the current presentation, with overrides for one example. */
  display(over?: Partial<BoardDisplay>): BoardDisplay;
  /** One thumbnail of the standard example board. */
  chipBoard(theme: TypeTheme, over?: Partial<BoardDisplay>): () => HTMLElement;
  /** Save a visual setting and redraw every example against it. */
  pick(patch: PresentationPatch): void;
  /** Rebuild the screen in place from the store, keeping the scroll position. */
  rebuild(): void;
}

export function typeName(typeId: string): string {
  return ladders.find((t) => t.id === typeId)?.name ?? typeId.toUpperCase();
}

/** An example's cell size scaled by the preview size, in whole pixels so its lines stay crisp. */
export function previewCell(base: number, scale: number): number {
  return Math.round(base * scale);
}

export function makeContext(
  opts: SettingsScreenOptions,
  host: HTMLElement,
  rebuild: () => void,
): ScreenContext {
  const { settings, typeId, tiers, onPreview, onAudition } = opts;
  const p = settings.presentation;
  const currentTheme = settings.themeFor(typeId);
  const chipCell = previewCell(CHIP_CELL, p.previewSize);
  const display = (over: Partial<BoardDisplay> = {}): BoardDisplay => ({
    maxCell: p.maxZoom,
    font: settings.boardFont(typeId),
    highlight: settings.highlightStyle(typeId),
    strikeDefeated: p.strikeDefeated,
    ...over,
  });
  return {
    settings,
    typeId,
    tiers,
    onPreview,
    onAudition,
    host,
    p,
    ident: lookFor(typeId),
    currentPip: p.icons === DEFAULT ? themeFor(typeId).pip : p.icons,
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
    pick(patch) {
      settings.setPresentation(patch);
      rebuild();
    },
    rebuild,
  };
}
