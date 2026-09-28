/**
 * The play statistics in storage (`telemetry.ts` says what they are). Its own key, never inside
 * the save code: the save is the player's progress, this is what their play cost, and the one is
 * carried between devices where the other is read on this one and exported on request. Guarded
 * like `progress.ts`: a blocked or empty store means nothing is kept, and the game plays on.
 */

import {
  type Attempt,
  TELEMETRY_KEY,
  type TelemetryData,
  addAttempt,
  boardKey,
  emptyTelemetry,
  readTelemetry,
} from './telemetry.js';

export class TelemetryStore {
  private data: TelemetryData;

  constructor(data: TelemetryData = emptyTelemetry()) {
    this.data = data;
  }

  static load(): TelemetryStore {
    try {
      return new TelemetryStore(readTelemetry(localStorage.getItem(TELEMETRY_KEY)));
    } catch {
      return new TelemetryStore();
    }
  }

  private save(): void {
    try {
      localStorage.setItem(TELEMETRY_KEY, JSON.stringify(this.data));
    } catch {
      // Nothing to do; the session still plays correctly.
    }
  }

  /** What is kept, for the backup screen to describe and export. */
  get current(): TelemetryData {
    return this.data;
  }

  /** An attempt on a board has ended: add it to the board's totals and write them down. */
  record(typeId: string, board: number, tuned: boolean, attempt: Attempt): void {
    addAttempt(this.data, tuned, boardKey(typeId, board), attempt);
    this.save();
  }

  reset(): void {
    this.data = emptyTelemetry();
    this.save();
  }
}
