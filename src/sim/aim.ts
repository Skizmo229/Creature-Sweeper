/**
 * Where an answering spell is worth casting: the graded player's aim for Augur.
 *
 * A person who is stuck and holds a spell that only answers asks it of the number whose answer is
 * likeliest to settle something. This puts that judgement as a count. For each number it lists
 * the layouts of the cells behind it that its sum allows, each cell held to the player's pencil,
 * and that leave every neighbouring number something it can still be made of; it groups them by
 * what the spell would answer, and scores the number by the cells, averaged over the layouts, that
 * the answer would leave at or below the level in every layout it allows. Layouts are counted as
 * equally likely, which a person does too. It reads only what the player can see.
 *
 * The listing is a bound, not the board: it reads one number and the sums beside it, not the
 * whole frontier, so a cell it calls free under an answer IS free (the true layout is among those
 * it keeps), while a cell the whole board would free can be missed. That is the right side to err
 * on for an aim.
 */

import type { Cell } from '../engine/types.js';
import { hasNote } from '../engine/notes.js';
import type { Constraint, Reading } from './reader.js';

/** What an answering spell says about the cells behind a number, keyed so equal answers group. */
export type Answer = (layout: readonly number[]) => string;

/** Augur's answer: every tier hidden there, strongest first. */
export const augurAnswer: Answer = (layout) =>
  layout
    .filter((t) => t > 0)
    .sort((a, b) => b - a)
    .join(',');

/** The most cells a number may hide for its layouts to be listed. */
const MOST_CELLS = 8;

/** Search steps one number may take before it is left unscored. */
const BUDGET = 20000;

/**
 * The layouts of a number's hidden cells that its sum and the player's pencil allow, each leaving
 * every neighbouring number a remainder its other cells could still make up. Null when the number
 * hides too many cells, or the search ran past its budget.
 */
function layouts(
  c: Constraint,
  reading: Reading,
  domain: (cell: Cell) => number,
): number[][] | null {
  const cells = c.unknown;
  if (cells.length > MOST_CELLS) return null;
  const options = cells.map((cell) => {
    const mask = domain(cell);
    const out: number[] = [];
    for (let t = 0; t <= reading.top; t++) if (hasNote(mask, t)) out.push(t);
    return out;
  });
  const others = [...new Set(cells.flatMap((cell) => reading.touching.get(cell) ?? []))].filter(
    (o) => o !== c,
  );
  const shared = others.map((o) => cells.map((cell) => o.unknown.includes(cell)));
  const rest = others.map((o, i) => o.unknown.length - shared[i]!.filter(Boolean).length);
  const taken = others.map(() => 0);
  const found: number[][] = [];
  const layout: number[] = [];
  let steps = 0;

  const fits = (done: boolean): boolean =>
    others.every((o, i) => {
      const left = o.residual - taken[i]!;
      return left >= 0 && (!done || left <= rest[i]! * reading.top);
    });

  const walk = (k: number, sum: number): boolean => {
    if (++steps > BUDGET) return false;
    if (sum > c.residual) return true;
    if (k === cells.length) {
      if (sum === c.residual && fits(true)) found.push([...layout]);
      return true;
    }
    for (const t of options[k]!) {
      layout.push(t);
      others.forEach((_, i) => {
        if (shared[i]![k]) taken[i]! += t;
      });
      const ok = !fits(false) || walk(k + 1, sum + t);
      others.forEach((_, i) => {
        if (shared[i]![k]) taken[i]! -= t;
      });
      layout.pop();
      if (!ok) return false;
    }
    return true;
  };
  return walk(0, 0) ? found : null;
}

/** Cells at or below the level in every one of these layouts. */
function freeIn(group: readonly number[][], level: number): number {
  if (!group.length) return 0;
  let free = 0;
  for (let k = 0; k < group[0]!.length; k++) if (group.every((l) => l[k]! <= level)) free++;
  return free;
}

/**
 * How many cells, on average over the layouts, an answer on this number would free that are not
 * free already. 0 where it cannot free one, or where the number is too large to list.
 */
export function expectedFreed(
  c: Constraint,
  reading: Reading,
  domain: (cell: Cell) => number,
  level: number,
  answer: Answer,
): number {
  const all = layouts(c, reading, domain);
  if (!all || all.length < 2) return 0;
  const before = freeIn(all, level);
  const groups = new Map<string, number[][]>();
  for (const l of all) {
    const key = answer(l);
    const group = groups.get(key);
    if (group) group.push(l);
    else groups.set(key, [l]);
  }
  let freed = 0;
  for (const group of groups.values()) {
    freed += (group.length / all.length) * (freeIn(group, level) - before);
  }
  return freed;
}
