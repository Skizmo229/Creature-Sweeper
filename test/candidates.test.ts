/**
 * The pencil's candidate gate, as executable specifications.
 *
 * `noteCandidates` says a tier is IMPOSSIBLE for a covered cell, and the pencil
 * then refuses to write it. Wrong in the permissive direction, that is a
 * wasted click — the thing it exists to remove. Wrong in the other direction it
 * refuses the tier the cell really holds, and a player who has read the board
 * correctly cannot write down what they know. So the test that matters walks
 * real boards part-way and asks every covered cell whether its own tier is
 * still on offer.
 */

import { describe, expect, it } from 'vitest';
import { boardConfig } from '../src/engine/config.js';
import { Game } from '../src/engine/game.js';
import { hasNote, noteTiers } from '../src/engine/notes.js';
import { packCandidates } from '../src/engine/placement/packs.js';
import { pairCandidates } from '../src/engine/placement/pairs.js';
import { mulberry32 } from '../src/engine/rng.js';
import type { Cell } from '../src/engine/types.js';
import { ladders, SEEDS } from './helpers.js';

/** Every placement the gate knows about, on boards from both ends of each
 *  ladder. Sudoku stops at board 5 because the late boards are slow to deal. */
const GATED: Record<string, number[]> = {
  checker: [1, 10],
  pairs: [1, 10],
  dominoes: [1, 10],
  packs: [1, 10],
  congo: [1, 10],
  sudoku: [1, 5],
};

const covered = (game: Game): Cell[] => game.grid.flat().filter((c) => c.present && !c.open);

/**
 * Open free cells in a seeded random order, yielding after each, until none is
 * left. Omniscient — it opens by the true tier — because the point is to reach
 * many different mid-game states, not to play well: pairs half-open, pairs
 * fully open, creatures touching the frontier from every side.
 */
function* walk(game: Game, seed: number): Generator<void> {
  const rng = mulberry32(seed);
  while (game.status === 'playing') {
    const free = covered(game).filter((c) => c.tier <= game.level);
    if (free.length === 0) return;
    const pick = free[Math.floor(rng() * free.length)]!;
    game.open(pick.x, pick.y);
    yield;
  }
}

describe('pencil candidates', () => {
  it('never rule out the tier a cell really holds, however far the board is played', () => {
    const failures: string[] = [];
    const narrowed: Record<string, number> = {};
    for (const [id, boards] of Object.entries(GATED)) {
      narrowed[id] = 0;
      for (const board of boards) {
        for (const seed of SEEDS) {
          const game = Game.create(boardConfig(ladders, id, board), seed);
          const every = (1 << (game.config.tiers + 1)) - 1;
          const check = () => {
            for (const c of covered(game)) {
              const mask = game.noteCandidates(c);
              if (!hasNote(mask, c.tier)) {
                failures.push(
                  `${id} #${board} seed ${seed}: (${c.x},${c.y}) holds ` +
                    `${c.tier} but is offered ${noteTiers(mask).join(',')}`,
                );
              }
              // On a pairing or pack board count only what that rule narrowed,
              // so this cannot pass on a gate that never engages.
              const engaged =
                id === 'pairs' || id === 'dominoes'
                  ? pairCandidates(c, (n) => game.neighboursOf(n)) !== null
                  : id === 'packs' || id === 'congo'
                    ? packCandidates(c, (n) => game.neighboursOf(n), game.config.tiers) !== null
                    : mask !== every;
              if (engaged) narrowed[id]!++;
            }
          };
          check();
          let step = 0;
          for (const _ of walk(game, seed)) if (++step % 4 === 0) check();
          check();
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    for (const id of Object.keys(GATED)) expect(narrowed[id], id).toBeGreaterThan(0);
  });

  it('offer a CHECKERBOARD square only its own colour, and empty ground on both', () => {
    const game = Game.create(boardConfig(ladders, 'checker', 1), SEEDS[0]!);
    const light = covered(game).find((c) => (c.x + c.y) % 2 === 0)!;
    const dark = covered(game).find((c) => (c.x + c.y) % 2 === 1)!;
    expect(noteTiers(game.noteCandidates(light))).toEqual([0, 2, 4, 6]);
    expect(noteTiers(game.noteCandidates(dark))).toEqual([0, 1, 3, 5]);
  });

  it('never offer empty ground on SUDOKU, where the opening uncovered all of it', () => {
    const game = Game.create(boardConfig(ladders, 'sudoku', 1), SEEDS[0]!);
    for (const c of covered(game)) {
      expect(noteTiers(game.noteCandidates(c))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });

  it('offer only empty ground or the partner beside a defeated PAIRS creature', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      const game = Game.create(boardConfig(ladders, 'pairs', 5), seed);
      for (const _ of walk(game, seed)) {
        for (const c of covered(game)) {
          const mates = game.neighboursOf(c).filter((n) => n.open && n.tier > 0);
          if (mates.length !== 1) continue;
          const mate = mates[0]!;
          const met = game.neighboursOf(mate).some((n) => n.open && n.tier > 0);
          // The partner's tier is the defeated creature's own number, and a
          // creature that has already met its partner leaves only empty ground.
          expect(noteTiers(game.noteCandidates(c))).toEqual(met ? [0] : [0, mate.num]);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('offer only empty ground or a tier the neighbouring pack has not shown', () => {
    let beside = 0;
    for (const id of ['packs', 'congo']) {
      for (const seed of SEEDS) {
        const game = Game.create(boardConfig(ladders, id, 5), seed);
        const tiers = game.config.tiers;
        const piece = (start: Cell): Cell[] => {
          const out = [start];
          for (let i = 0; i < out.length; i++) {
            for (const n of game.neighboursOf(out[i]!)) {
              if (n.open && n.tier > 0 && !out.includes(n)) out.push(n);
            }
          }
          return out;
        };
        for (const _ of walk(game, seed)) {
          for (const c of covered(game)) {
            const mates = game.neighboursOf(c).filter((n) => n.open && n.tier > 0);
            if (!mates.length) continue;
            // One piece only, so the expectation is simple to state.
            const p = piece(mates[0]!);
            if (!mates.every((m) => p.includes(m))) continue;
            const shown = new Set(p.map((m) => m.tier));
            const want = [0];
            for (let t = 1; t <= tiers; t++) if (!shown.has(t)) want.push(t);
            expect(noteTiers(game.noteCandidates(c))).toEqual(want);
            beside++;
          }
        }
      }
    }
    expect(beside).toBeGreaterThan(0);
  });

  it('offer only empty ground beside a pack shown whole, and beside two packs', () => {
    // Staged rather than walked: a pack's tier 6 falls last in any honest
    // order, by which time the ground around it is long open.
    const game = Game.create(boardConfig(ladders, 'packs', 5), SEEDS[0]!);
    const creature = (c: Cell) => c.present && c.tier > 0;
    const packOf = (start: Cell): Cell[] => {
      const out = [start];
      for (let i = 0; i < out.length; i++) {
        for (const n of game.neighboursOf(out[i]!))
          if (creature(n) && !out.includes(n)) out.push(n);
      }
      return out;
    };
    const covered = game.grid.flat().filter((c) => creature(c) && !c.open);
    const pack = packOf(covered[0]!);
    expect(pack).toHaveLength(game.config.tiers);
    for (const m of pack) m.open = true;
    const rim = game.neighboursOf(pack[0]!).filter((n) => !n.open);
    expect(rim.length).toBeGreaterThan(0);
    for (const c of rim) expect(noteTiers(game.noteCandidates(c))).toEqual([0]);

    // Two packs: a covered cell with a creature of the same tier on each side,
    // from different packs. Each alone would only rule its own tier out; the
    // pair says a creature here would join two packs, so it is empty ground.
    const fresh = Game.create(boardConfig(ladders, 'packs', 5), SEEDS[1]!);
    const packsOf = (start: Cell): Set<Cell> => {
      const out = [start];
      for (let i = 0; i < out.length; i++) {
        for (const n of fresh.neighboursOf(out[i]!))
          if (creature(n) && !out.includes(n)) out.push(n);
      }
      return new Set(out);
    };
    let staged = false;
    for (const x of fresh.grid.flat()) {
      if (!x.present || x.open || x.tier !== 0) continue;
      const ns = fresh.neighboursOf(x).filter(creature);
      const pair = ns.flatMap((a) =>
        ns
          .filter((b) => b !== a && b.tier === a.tier && !packsOf(a).has(b))
          .map((b) => [a, b] as const),
      )[0];
      if (!pair) continue;
      pair[0].open = true;
      pair[1].open = true;
      expect(noteTiers(fresh.noteCandidates(x))).toEqual([0]);
      staged = true;
      break;
    }
    expect(staged).toBe(true);
  });

  it('refuse a ruled-out candidate without touching the cell', () => {
    const game = Game.create(boardConfig(ladders, 'checker', 1), SEEDS[0]!);
    const light = covered(game).find((c) => (c.x + c.y) % 2 === 0 && !c.given)!;
    game.setMark(light.x, light.y, 2);
    expect(game.toggleNote(light.x, light.y, 3)).toEqual([
      { type: 'blocked', reason: 'ruled-out' },
    ]);
    // Refused before the mark is rubbed out, so nothing about the cell moved.
    expect(light.mark).toBe(2);
    expect(light.notes).toBe(0);
    expect(game.toggleNote(light.x, light.y, 4).some((e) => e.type === 'noted')).toBe(true);
  });

  it('still let a candidate be taken off after the board has ruled it out', () => {
    // A pair whose tier-1 half can be killed for free at LV1, and a covered
    // cell beside it that is not the partner.
    for (const seed of SEEDS) {
      const game = Game.create(boardConfig(ladders, 'pairs', 1), seed);
      for (const c of covered(game)) {
        if (c.tier !== 1) continue;
        const partner = game.neighboursOf(c).find((n) => n.tier > 0)!;
        if (partner.open) continue;
        const x = game
          .neighboursOf(c)
          .find(
            (n) =>
              !n.open && n !== partner && !game.neighboursOf(n).some((m) => m.open && m.tier > 0),
          );
        if (!x) continue;

        // Pencilled while nothing ruled it out...
        const stale = partner.tier === 1 ? 2 : 1;
        expect(game.toggleNote(x.x, x.y, stale).some((e) => e.type === 'noted')).toBe(true);
        // ...then ruled out, by killing the creature beside it.
        game.open(c.x, c.y);
        expect(hasNote(game.noteCandidates(x), stale)).toBe(false);
        // Taking it off is still allowed; putting it back is not.
        expect(game.toggleNote(x.x, x.y, stale).some((e) => e.type === 'noted')).toBe(true);
        expect(game.toggleNote(x.x, x.y, stale)).toEqual([
          { type: 'blocked', reason: 'ruled-out' },
        ]);
        return;
      }
    }
    throw new Error('no pair on these seeds could stage the test');
  });

  it('leave every other placement alone', () => {
    const game = Game.create(boardConfig(ladders, 'normal', 1), SEEDS[0]!);
    const every = (1 << (game.config.tiers + 1)) - 1;
    for (const c of covered(game)) expect(game.noteCandidates(c)).toBe(every);
  });
});
