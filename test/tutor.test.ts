/**
 * The tutor (`src/sim/tutor.ts`), held to what would make it a bad teacher: a lesson that is
 * wrong, a lesson that leans on a mark, a lesson without words, or a lesson of a dearer grade
 * than the board needed.
 */

import { describe, expect, it } from 'vitest';
import { resolveBattle } from '../src/engine/combat.js';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { hasNote } from '../src/engine/notes.js';
import { mulberry32 } from '../src/engine/rng.js';
import { DEFAULT_GAMEPLAY, biteFor } from '../src/engine/settings.js';
import { readBoard } from '../src/sim/reader.js';
import { TRICKS, TRICK_IDS, type TrickId } from '../src/sim/tricks.js';
import { TRICK_TEXT } from '../src/sim/tricktext.js';
import { type Lesson, explain, provable } from '../src/sim/tutor.js';
import { TRICK_KINDS, ladders, playPartWay } from './helpers.js';

/** Play a lesson's moves, the way a player who took it would. */
function take(game: Game, lesson: Lesson): void {
  if (game.marksAreClaims) {
    for (const [cell, tier] of lesson.mark)
      if (game.status === 'playing') game.setMark(cell.x, cell.y, tier);
  }
  for (const cell of lesson.open) {
    if (game.status !== 'playing' || cell.open) continue;
    // A lesson may name a cell the player has marked; the player clears the mark to open it.
    if (cell.mark > 0) game.setMark(cell.x, cell.y, 0);
    game.open(cell.x, cell.y);
  }
}

describe('the tutor', () => {
  it('is never wrong, always has words, and every press is one grade, on every kind of board', () => {
    const wrong: string[] = [];
    const fired = Object.fromEntries(TRICK_IDS.map((t) => [t, 0])) as Record<TrickId, number>;
    let presses = 0;
    // Every kind of board once, and the hard ladders' top boards a few more times, where the
    // rarest lessons (a what-if, a count) are found, as `test/graded.test.ts` samples them.
    const games: Array<[string, number, number]> = [];
    for (const id of TRICK_KINDS)
      for (const board of [2, 6, 10]) games.push([id, board, 0xbeef + board]);
    for (const id of ['extreme', 'oracle']) {
      for (const board of [8, 10]) for (let s = 0; s < 6; s++) games.push([id, board, 0xf00d + s]);
    }
    const pressesAt = [0, 0, 0, 0, 0];
    for (const [id, board, seed] of games) {
      const game = Game.create(boardConfig(ladders, id, board), seed);
      const rng = mulberry32(seed);
      for (let press = 0; press < 120 && game.status === 'playing'; press++) {
        const { grade, lessons, steps } = explain(game);
        // Nothing to say, or pencil work alone: the board is at a guess. The test guesses right
        // (it may read tiers; the tutor may not) so that the later game is reached, where the
        // dearer lessons live.
        if (!lessons.length) {
          if (grade === null) expect(steps).toEqual([]);
          const safe = game.grid
            .flat()
            .filter((c) => c.present && !c.open && c.tier <= game.level && game.inReach(c));
          if (!safe.length) break;
          const pick = safe[Math.floor(rng() * safe.length)]!;
          if (pick.mark > 0) game.setMark(pick.x, pick.y, 0);
          game.open(pick.x, pick.y);
          continue;
        }
        presses++;
        pressesAt[grade!]!++;
        for (const l of [...steps, ...lessons]) {
          const at = `${id} #${board} ${l.trick}`;
          fired[l.trick]++;
          if (l.grade > grade!) wrong.push(`${at}: grade ${l.grade} in a grade-${grade} press`);
          if (l.grade !== TRICKS[l.trick].grade) wrong.push(`${at}: not its trick's grade`);
          if (!l.caption.trim().endsWith('.')) wrong.push(`${at}: "${l.caption}"`);
          if (l.open.length + l.mark.length + l.narrow.length === 0) wrong.push(`${at}: empty`);
          for (const c of l.open) if (c.tier > game.level) wrong.push(`${at}: opened a ${c.tier}`);
          for (const [c, t] of l.mark)
            if (c.tier !== t) wrong.push(`${at}: named a ${c.tier} ${t}`);
          for (const [c, m] of l.narrow)
            if (!hasNote(m, c.tier)) wrong.push(`${at}: struck ${c.tier}`);
          for (const c of l.why.cells) if (!c.open && c.mark === 0) wrong.push(`${at}: hidden why`);
        }
        for (const l of lessons) take(game, l);
      }
    }
    expect(wrong.slice(0, 20)).toEqual([]);
    expect(presses).toBeGreaterThan(200);
    // Every grade has been the grade of some press, and every grade has taught something.
    for (const grade of [0, 1, 2, 3, 4]) {
      expect(pressesAt[grade], `presses at grade ${grade}`).toBeGreaterThan(0);
      const taught = TRICK_IDS.filter((t) => TRICKS[t].grade === grade && fired[t] > 0);
      expect(taught.length, `grade ${grade}`).toBeGreaterThan(0);
    }
  });

  it('believes no mark, and reads a marked cell as covered and unknown', () => {
    const game = Game.create(boardConfig(ladders, 'normal', 4), 0x7e57);
    const honest = readBoard(game, false, { trustMarks: false });
    // Mark a covered cell beside a number with a tier that is wrong, as a guessing player does.
    const c = honest.constraints.find((k) => k.unknown.length >= 2)!;
    const victim = c.unknown[0]!;
    const lie = victim.tier === 1 ? 2 : 1;
    game.setMark(victim.x, victim.y, lie);

    const trusting = readBoard(game, false);
    const wary = readBoard(game, false, { trustMarks: false });
    expect(trusting.marked.get(victim)).toBe(lie);
    expect(wary.marked.size).toBe(0);
    expect(wary.unknown).toContain(victim);
    const after = wary.constraints.find((k) => k.cell === c.cell)!;
    expect(after.residual).toBe(c.residual);
    expect(after.unknown).toEqual(c.unknown);
    // The lie is subtracted by the trusting reading and by nothing the tutor says.
    const fooled = trusting.constraints.find((k) => k.cell === c.cell);
    expect(fooled === undefined || fooled.residual === c.residual - lie).toBe(true);
    for (const l of explain(game).lessons) {
      for (const cell of l.open) expect(cell.tier).toBeLessThanOrEqual(game.level);
      for (const [cell, t] of l.mark) expect(cell.tier).toBe(t);
    }
  });

  it('adds a search board’s flags back, so the counters still say what is hiding', () => {
    const game = Game.create(boardConfig(ladders, 'blind', 3), 0xb11d);
    const before = readBoard(game, false, { trustMarks: false });
    const cell = before.unknown.find((c) => c.tier > 0)!;
    game.setMark(cell.x, cell.y, cell.tier);
    const after = readBoard(game, false, { trustMarks: false });
    expect(after.hiding).toEqual(before.hiding);
    expect(after.totalHiding).toBe(before.totalHiding);
    // Trusted, the flag stands for the creature, as the HUD counts it.
    expect(readBoard(game, false).hiding[cell.tier]).toBe(before.hiding[cell.tier]! - 1);
  });

  it('puts the lesson nearest the last action first', () => {
    const game = Game.create(boardConfig(ladders, 'normal', 6), 0xbeef);
    const { lessons } = explain(game);
    expect(lessons.length).toBeGreaterThan(1);
    const far = lessons[lessons.length - 1]!;
    const anchor = far.open[0] ?? far.mark[0]![0];
    const near = explain(game, { near: anchor }).lessons;
    const first = near[0]!;
    const cells = [...first.open, ...first.mark.map(([c]) => c)];
    const d = Math.min(
      ...cells.map((c) => Math.max(Math.abs(c.x - anchor.x), Math.abs(c.y - anchor.y))),
    );
    expect(d).toBe(0);
  });

  it('at a guess, names a worst case that is never below the truth, and counts the levels', () => {
    let advised = 0;
    for (const seed of [0xf00d, 0xf00d + 1, 0xf00d + 2, 0xf00d + 3]) {
      const game = Game.create(boardConfig(ladders, 'extreme', 10), seed);
      const rng = mulberry32(seed);
      for (let press = 0; press < 120 && game.status === 'playing'; press++) {
        const { lessons, advice } = explain(game);
        if (lessons.length) {
          expect(advice).toBeNull();
          for (const l of lessons) take(game, l);
          continue;
        }
        expect(advice).not.toBeNull();
        expect(advice!.text.endsWith('.')).toBe(true);
        expect(advice!.text).toMatch(/Level \d is \d+ EXP away|free kills/);
        if (advice!.cell) {
          advised++;
          // The ceiling is a fact about the numbers, so the truth is at or under it.
          expect(advice!.cell.tier).toBeLessThanOrEqual(advice!.ceiling);
          expect(advice!.cell.open).toBe(false);
          expect(advice!.constraints.length).toBeGreaterThan(0);
          expect(advice!.text).toContain(`a tier ${advice!.ceiling}`);
        }
        const safe = game.grid
          .flat()
          .filter((c) => c.present && !c.open && c.tier <= game.level && game.inReach(c));
        if (!safe.length) break;
        const pick = safe[Math.floor(rng() * safe.length)]!;
        if (pick.mark > 0) game.setMark(pick.x, pick.y, 0);
        game.open(pick.x, pick.y);
      }
    }
    expect(advised).toBeGreaterThan(3);
  });

  it('prices the worst case as the fight would, through the creature-damage dial', () => {
    // A 4 touches two covered cells and nothing proves which hides the tier 4 (the 1, 2 and 3 at
    // the far end keep the level at 2 and touch no number), so the tutor names the worst case. At
    // level 2 the unmodified rule costs 4; at three times the damage the fight takes the whole
    // 10 HP pool, and the advice must say so.
    for (const ratio of [1, 3]) {
      const settings = { ...DEFAULT_GAMEPLAY, enemyDamageRatio: ratio };
      const game = Game.fromLayout(['4 . . . 1 2 3'], ['? 4 ? ? ? ? ?'], {
        startLevel: 2,
        settings,
      });
      expect(game.level).toBe(2);
      expect(game.hp).toBe(10);
      const { lessons, advice } = explain(game);
      expect(lessons).toHaveLength(0);
      expect(advice?.ceiling).toBe(4);
      const cost = resolveBattle(2, 10, 4, biteFor(4, settings)).damage;
      expect(advice!.text).toContain(`costing ${cost} of your 10 HP`);
      expect(advice!.text.includes('which would kill you')).toBe(cost >= 10);
    }
  });

  it('proves only what is true, at least what a press teaches, and more at a dearer grade', () => {
    let proved = 0;
    for (const id of TRICK_KINDS) {
      for (const board of [3, 8]) {
        const seed = 0xace + board;
        const game = Game.create(boardConfig(ladders, id, board), seed);
        playPartWay(game, seed);
        if (game.status !== 'playing') continue;
        const at = `${id} #${board}`;
        const all = provable(game);
        for (const c of all.open) expect(c.tier, `${at} opens`).toBeLessThanOrEqual(game.level);
        for (const [c, t] of all.mark) expect(c.tier, `${at} names`).toBe(t);
        for (const l of explain(game).lessons) {
          for (const c of l.open) expect(all.open.has(c), `${at} ${l.trick}`).toBe(true);
          for (const [c] of l.mark) expect(all.mark.has(c) || all.open.has(c), at).toBe(true);
        }
        const cheaper = provable(game, 1);
        for (const c of cheaper.open) expect(all.open.has(c), `${at} grade 1`).toBe(true);
        proved += all.open.size + all.mark.size;
      }
    }
    expect(proved).toBeGreaterThan(200);
  });

  it('says nothing on a finished board, and names every trick it teaches', () => {
    const game = Game.create(boardConfig(ladders, 'normal', 1), 1);
    // Fight everything: the omniscient order, so the board ends cleared.
    for (let t = 1; t <= game.config.tiers && game.status === 'playing'; t++) {
      for (const c of game.grid.flat()) {
        if (c.present && !c.open && c.tier === t && game.status === 'playing') game.open(c.x, c.y);
      }
    }
    expect(game.status).not.toBe('playing');
    expect(explain(game)).toEqual({ grade: null, lessons: [], steps: [], advice: null });
    for (const t of TRICK_IDS) expect(TRICK_TEXT[t].name.length).toBeGreaterThan(0);
  });
});
