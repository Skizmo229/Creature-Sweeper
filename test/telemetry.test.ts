/**
 * The play statistics: the totals add up, the code round-trips and refuses what is not one, the
 * store reads back only its own shape, and the recorder counts a guess as a cell opened while not
 * provable, marks untrusted, on a real board.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import type { Move } from '../src/engine/replay.js';
import { DEFAULT_GAMEPLAY } from '../src/engine/settings.js';
import { BoardRecorder } from '../src/ui/game/recorder.js';
import { boardKey } from '../src/ui/savefile.js';
import {
  type Attempt,
  addAttempt,
  decodeTelemetry,
  describeTelemetry,
  emptyTelemetry,
  encodeTelemetry,
  readTelemetry,
  statsRows,
} from '../src/ui/telemetry.js';
import { ladders } from './helpers.js';

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  how: 'cleared',
  hpLost: 0,
  opens: 10,
  guesses: 1,
  sweeps: 2,
  casts: 0,
  hints: 0,
  seconds: 60,
  ...over,
});

describe('the play statistics', () => {
  it('add attempts to their board, in the bucket of their dials', () => {
    const data = emptyTelemetry();
    addAttempt(data, true, boardKey('normal', 3), attempt());
    addAttempt(
      data,
      true,
      boardKey('normal', 3),
      attempt({ how: 'lost', deathBy: '5', hpLost: 10 }),
    );
    addAttempt(data, false, boardKey('normal', 3), attempt({ how: 'abandoned' }));
    const s = data.tuned['normal#3']!;
    expect(s).toMatchObject({ attempts: 2, cleared: 1, lost: 1, abandoned: 0, hpLost: 10 });
    expect(s.deaths).toEqual({ '5': 1 });
    expect(s.opens).toBe(20);
    expect(data.modified['normal#3']).toMatchObject({ attempts: 1, abandoned: 1 });
    expect(describeTelemetry(data)).toBe('2 attempts on 1 board, and 1 attempt on modified dials.');
    expect(describeTelemetry(emptyTelemetry())).toBe('Nothing played yet.');
  });

  it('rows a bucket per attempt, in ladder then board order', () => {
    const data = emptyTelemetry();
    addAttempt(data, true, boardKey('normal', 10), attempt({ seconds: 100 }));
    addAttempt(
      data,
      true,
      boardKey('normal', 10),
      attempt({ how: 'lost', deathBy: 'time', seconds: 50 }),
    );
    addAttempt(data, true, boardKey('easy', 2), attempt());
    const rows = statsRows(data.tuned);
    expect(rows.map((r) => r.key)).toEqual(['easy#2', 'normal#10']);
    expect(rows[1]).toMatchObject({ attempts: 2, clearRate: 0.5, seconds: 75, deaths: 'time:1' });
  });

  it('round-trips as a code, wrapped or not, and refuses anything else', () => {
    const data = emptyTelemetry();
    addAttempt(data, true, boardKey('hive', 1), attempt());
    const code = encodeTelemetry(data, new Date('2026-09-27T12:00:00Z'));
    expect(code.startsWith('CST1:')).toBe(true);
    const back = decodeTelemetry(`  ${code.match(/.{1,30}/g)!.join('\n ')}\n`);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.data).toEqual(data);
      expect(back.exported).toBe('2026-09-27T12:00:00.000Z');
    }
    expect(decodeTelemetry('CS1:abc').ok).toBe(false);
    expect(decodeTelemetry('CST1:not base64!').ok).toBe(false);
  });

  it('reads back only its own shape from storage', () => {
    expect(readTelemetry(null)).toEqual(emptyTelemetry());
    expect(readTelemetry('{"version":2}')).toEqual(emptyTelemetry());
    expect(readTelemetry('{"version":1,"tuned":{"a#1":{"attempts":"x"}},"modified":{}}')).toEqual(
      emptyTelemetry(),
    );
    const data = emptyTelemetry();
    addAttempt(data, false, boardKey('easy', 1), attempt({ how: 'lost', deathBy: '3' }));
    expect(readTelemetry(JSON.stringify(data))).toEqual(data);
  });
});

/** A recorder over a real board, with the store, clock and tutor stood in for. */
function recorderOn(game: Game) {
  const recorded: Array<{ typeId: string; board: number; tuned: boolean; attempt: Attempt }> = [];
  const telemetry = {
    record: (typeId: string, board: number, tuned: boolean, attempt: Attempt) => {
      recorded.push({ typeId, board, tuned, attempt });
    },
  };
  const clock = { elapsedSeconds: () => 30, timeExpired: false };
  const tutor = { hints: 0 };
  const recorder = new BoardRecorder({
    game: () => game,
    typeId: () => 'normal',
    boardIndex: () => 1,
    clock,
    tutor,
    telemetry,
    play: (move: Move) => {
      if (move.kind === 'open') return game.open(move.x, move.y);
      if (move.kind === 'sweep') return game.sweep({ useMarks: move.useMarks });
      throw new Error(`not in this test: ${move.kind}`);
    },
  });
  return { recorder, recorded, clock, tutor };
}

describe('the recorder', () => {
  const cfg = boardConfig(ladders, 'normal', 1);

  it('counts a guess as a cell opened while not provable, and never a refused move', () => {
    const game = Game.create(cfg, 0xc0ffee, { settings: DEFAULT_GAMEPLAY });
    const { recorder, recorded, tutor } = recorderOn(game);
    recorder.begin();
    const safe = game.safeCells({ useMarks: false });
    expect(safe.length).toBeGreaterThan(0);
    recorder.move({ kind: 'open', x: safe[0]!.x, y: safe[0]!.y });
    // Opening an open cell is refused by the board, so it is no open and no guess.
    recorder.move({ kind: 'open', x: safe[0]!.x, y: safe[0]!.y });
    const covered = game.grid.flat().find((c) => !c.open && !safe.includes(c))!;
    const hp = game.hp;
    recorder.move({ kind: 'open', x: covered.x, y: covered.y });
    recorder.move({ kind: 'sweep', useMarks: false });
    tutor.hints = 2;
    recorder.end('abandoned');
    expect(recorded).toHaveLength(1);
    const { attempt, tuned } = recorded[0]!;
    expect(tuned).toBe(true);
    expect(attempt).toMatchObject({
      how: 'abandoned',
      opens: 2,
      guesses: 1,
      hints: 2,
      hpLost: hp - game.hp,
    });
    expect(attempt.sweeps).toBeLessThanOrEqual(1);
    expect(attempt.deathBy).toBeUndefined();
  });

  it('tallies nothing before a board begins, and files easier dials apart', () => {
    const game = Game.create(cfg, 0x5eed, { settings: { ...DEFAULT_GAMEPLAY, hpRatio: 3 } });
    const { recorder, recorded } = recorderOn(game);
    const safe = game.safeCells({ useMarks: false })[0]!;
    recorder.move({ kind: 'open', x: safe.x, y: safe.y });
    recorder.end('cleared');
    expect(recorded).toHaveLength(0);
    recorder.begin();
    recorder.end('cleared');
    expect(recorded[0]).toMatchObject({ tuned: false, attempt: { how: 'cleared', opens: 0 } });
  });

  it('names what dealt a death: the tier, or time', () => {
    const game = Game.create(cfg, 0xbeef, { settings: { ...DEFAULT_GAMEPLAY, hpRatio: 0 } });
    const { recorder, recorded, clock } = recorderOn(game);
    recorder.begin();
    // At 1 HP the first creature above the level kills; find one and open it.
    const creature = game.grid.flat().find((c) => !c.open && c.tier > game.level)!;
    recorder.move({ kind: 'open', x: creature.x, y: creature.y });
    expect(game.status).toBe('lost');
    recorder.end('lost');
    expect(recorded[0]!.attempt.deathBy).toBe(String(creature.tier));

    const timed = Game.create(cfg, 0xbeef, { settings: DEFAULT_GAMEPLAY });
    const t = recorderOn(timed);
    t.recorder.begin();
    t.clock.timeExpired = true;
    t.recorder.end('lost');
    expect(t.recorded[0]!.attempt.deathBy).toBe('time');
    expect(clock.timeExpired).toBe(false);
  });
});

describe('the game version in a code', () => {
  it('is carried when the writer gives it, and null in a code from before it', () => {
    const data = emptyTelemetry();
    const stamped = decodeTelemetry(encodeTelemetry(data, new Date(), '0.10.0'));
    expect(stamped.ok && stamped.game).toBe('0.10.0');
    const bare = decodeTelemetry(encodeTelemetry(data));
    expect(bare.ok && bare.game).toBeNull();
  });
});
