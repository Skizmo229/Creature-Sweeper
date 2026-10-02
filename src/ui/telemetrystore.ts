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
  telemetryReadable,
} from './telemetry.js';
import { dropKept, keepUnreadable } from './progress.js';

/** The play statistics on this device, read from storage and written back after every attempt. */
export class TelemetryStore {
  private data: TelemetryData;

  constructor(data: TelemetryData = emptyTelemetry()) {
    this.data = data;
  }

  static load(): TelemetryStore {
    try {
      const raw = localStorage.getItem(TELEMETRY_KEY);
      // A record this build cannot read is set aside, never written over (decision 0080).
      if (raw && !telemetryReadable(raw)) keepUnreadable(TELEMETRY_KEY, raw);
      return new TelemetryStore(readTelemetry(raw));
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
    dropKept(TELEMETRY_KEY);
  }
}
