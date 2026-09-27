/**
 * The teaching on the app (docs/teaching-plan.md): the tutor on the board being played, the rules
 * card, and the field guide, opened at the trick the tutor is showing or led by a ladder's own
 * notes. App keeps the screens and routes the keys and buttons here.
 */

import { boardDisplayFor } from './dress.js';
import { Tutor } from './game/tutor.js';
import { GUESSING_WELL } from './guide/entries.js';
import { ladders } from './ladders.js';
import type { Modal } from './overlays/modal.js';
import { type GuideTarget, buildGuide } from './screens/guide.js';
import type { Settings } from './settings.js';

/** The field guide's diagrams' cell size before the preview-size setting scales it, in CSS pixels. */
const GUIDE_CELL = 40;

/** What the teaching reads of App. */
export interface TeachingHost {
  readonly settings: Settings;
  readonly modal: Modal;
  /** The ladder the player is on or last looked at, whose look the guide's diagrams wear. */
  typeId(): string;
}

export class Teaching {
  /** The tutor on the board being played: what it last found, and the hints asked. */
  readonly tutor = new Tutor();

  constructor(private readonly host: TeachingHost) {}

  /** The rules card, which offers the field guide. */
  howTo(): void {
    this.host.modal.howTo(() => this.guide());
  }

  /**
   * The field guide over whatever is on screen, open at `target` if one is given and led by how to
   * play `ladderId` if one is, its diagrams in the look of the ladder the player is on or last
   * looked at.
   */
  guide(target?: GuideTarget, ladderId?: string): void {
    const { settings, modal } = this.host;
    const typeId = this.host.typeId();
    const { overlay, focus, show } = buildGuide({
      ladders,
      ladder: ladders.find((t) => t.id === ladderId),
      theme: settings.themeFor(typeId),
      display: boardDisplayFor(settings, typeId),
      cell: Math.round(GUIDE_CELL * settings.presentation.previewSize),
      close: () => modal.close(),
    });
    if (modal.show(overlay, focus)) show(target);
  }

  /** The guide from a board: at the trick the tutor is showing, or at guessing well at a guess. */
  guideFromBoard(): void {
    const topic = this.tutor.topic();
    const at =
      topic === 'guess' ? { section: GUESSING_WELL } : topic ? { trick: topic } : undefined;
    this.guide(at, this.host.typeId());
  }
}
