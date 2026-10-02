/**
 * A board as the moves made on it. A board is a pure function of (config, seed), and nothing
 * after the deal draws a random number, so the same moves made on the same board always reach the
 * same state. That is how a paused board is kept (decision 0057): the seed, the dials and the
 * moves, replayed on resume, rather than a copy of the state, which would have to name every
 * private field the engine holds and would miss the next one silently.
 *
 * A fingerprint of the result is kept beside the moves. If an update has changed the board or a
 * rule, the replay reaches a different state and the fingerprint says so, instead of the player
 * being handed a different board under the old one's name.
 */

import type { Game } from './game.js';
import { fnv1a } from './config.js';
import { SPELLS, type SpellId } from './spells.js';
import type { GameEvent } from './types.js';

/** One thing the player did to a board: every action of `Game` that the player can take. */
export type Move =
  | { readonly kind: 'open'; readonly x: number; readonly y: number }
  | { readonly kind: 'mark'; readonly x: number; readonly y: number; readonly mark: number }
  | { readonly kind: 'note'; readonly x: number; readonly y: number; readonly tier: number }
  | { readonly kind: 'sweep'; readonly useMarks: boolean }
  /** A chord: one open cell's ring swept (`Game.sweepAt`). */
  | { readonly kind: 'chord'; readonly x: number; readonly y: number; readonly useMarks: boolean }
  | { readonly kind: 'cast'; readonly id: SpellId; readonly x?: number; readonly y?: number }
  | { readonly kind: 'wait' };

/** Make a move on a board, exactly as the matching `Game` action would. */
export function playMove(game: Game, move: Move): GameEvent[] {
  switch (move.kind) {
    case 'open':
      return game.open(move.x, move.y);
    case 'mark':
      return game.setMark(move.x, move.y, move.mark);
    case 'note':
      return game.toggleNote(move.x, move.y, move.tier);
    case 'sweep':
      return game.sweep({ useMarks: move.useMarks });
    case 'chord':
      return game.sweepAt(move.x, move.y, { useMarks: move.useMarks });
    case 'cast':
      return game.cast(move.id, move.x, move.y);
    case 'wait':
      return game.wait();
  }
}

/** Make every move, in order, on a board freshly dealt from the seed they were made on. */
export function replayMoves(game: Game, moves: readonly Move[]): void {
  for (const move of moves) playMove(game, move);
}

/**
 * A move as it is stored: a short array, the kind's letter first. A long board is a few thousand
 * moves, and a paused board is kept for every board of every ladder, so the size matters.
 */
export type MoveCode = readonly (string | number)[];

/** A move as it is stored, the inverse of `decodeMove`. */
export function encodeMove(move: Move): MoveCode {
  switch (move.kind) {
    case 'open':
      return ['o', move.x, move.y];
    case 'mark':
      return ['m', move.x, move.y, move.mark];
    case 'note':
      return ['n', move.x, move.y, move.tier];
    case 'sweep':
      return ['s', move.useMarks ? 1 : 0];
    case 'chord':
      return ['r', move.x, move.y, move.useMarks ? 1 : 0];
    case 'cast':
      return move.x === undefined || move.y === undefined
        ? ['c', move.id]
        : ['c', move.id, move.x, move.y];
    case 'wait':
      return ['w'];
  }
}

const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Read a stored move back, or null when it is not one: stored data is never trusted. */
export function decodeMove(code: unknown): Move | null {
  if (!Array.isArray(code)) return null;
  const [kind, a, b, c] = code as unknown[];
  const n = code.length;
  if (kind === 'o' && n === 3 && whole(a) && whole(b)) return { kind: 'open', x: a, y: b };
  if (kind === 'm' && n === 4 && whole(a) && whole(b) && whole(c)) {
    return { kind: 'mark', x: a, y: b, mark: c };
  }
  if (kind === 'n' && n === 4 && whole(a) && whole(b) && whole(c)) {
    return { kind: 'note', x: a, y: b, tier: c };
  }
  if (kind === 's' && n === 2 && (a === 0 || a === 1)) return { kind: 'sweep', useMarks: a === 1 };
  if (kind === 'r' && n === 4 && whole(a) && whole(b) && (c === 0 || c === 1)) {
    return { kind: 'chord', x: a, y: b, useMarks: c === 1 };
  }
  if (kind === 'c' && typeof a === 'string' && Object.hasOwn(SPELLS, a)) {
    const id = a as SpellId;
    if (n === 2) return { kind: 'cast', id };
    if (n === 4 && whole(b) && whole(c)) return { kind: 'cast', id, x: b, y: c };
  }
  if (kind === 'w' && n === 1) return { kind: 'wait' };
  return null;
}

/**
 * Which reading of a board `boardDigest` takes, kept beside each paused game, which is checked by
 * the reading it was paused under. So the digest can learn more about a board without refusing
 * every game paused before it (decision 0084). Version 1, written by 0.9.1 and every build before
 * it, left out a cell's Census count, its Augur answer and its sprinkle partner, and the sweeps
 * left of a budget.
 */
export const DIGEST_VERSION = 2;

/**
 * A fingerprint of everything a board is: its config, every cell, and the player's standing. Two
 * boards with the same fingerprint are, to every rule and to the player, the same board: `fnv1a`
 * over a canonical string. An older `version` is only for checking a game paused under it.
 */
export function boardDigest(game: Game, version = DIGEST_VERSION): string {
  const full = version >= 2;
  const cells = game.grid.flat().map((c) => {
    const first =
      `${c.tier},${c.num},${+c.open},${+c.alive},${+c.occupied},${+c.present},` +
      `${c.mark},${+c.given},${c.notes}`;
    if (!full) return first;
    const partner = c.partner ? `${c.partner.x}:${c.partner.y}` : '';
    return `${first},${c.census ?? ''},${c.augur ?? ''},${partner}`;
  });
  const standing = [
    game.status,
    game.hp,
    game.maxHp,
    game.level,
    game.ex,
    game.mana,
    game.exerciseCharge,
    game.exerciseSurcharge,
    game.charge,
    game.moves,
    ...(full ? [game.sweepsLeft] : []),
  ];
  return fnv1a(`${JSON.stringify(game.config)}|${standing.join(',')}|${cells.join(';')}`);
}
