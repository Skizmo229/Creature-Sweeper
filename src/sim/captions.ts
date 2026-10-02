/**
 * The tutor's captions: each trick's proof in a sentence, with the numbers it read filled in
 * (docs/teaching-plan.md). One writer per trick; `TRICK_TEXT` holds the rule each one states
 * without numbers.
 */

import { noteTiers } from '../engine/notes.js';
import type { Cell } from '../engine/types.js';
import { type Constraint, highestTier } from './reader.js';
import type { TrickId, View, Why } from './tricks.js';
import { TRICK_TEXT } from './tricktext.js';

/** "2 or 5", or "empty" for the ground candidate alone. */
function tierList(mask: number): string {
  const tiers = noteTiers(mask).map((t) => (t === 0 ? 'empty' : `${t}`));
  if (tiers.length <= 1) return tiers[0] ?? '';
  return `${tiers.slice(0, -1).join(', ')} or ${tiers[tiers.length - 1]}`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "the 7", or "the 7 (4 hidden)" where some of it is on show. */
function the(c: Constraint): string {
  const n = c.cell.num;
  return c.residual === n ? `the ${n}` : `the ${n} (${c.residual} hidden)`;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "all 5 covered cells are", "its one covered cell is"; or the count alone. */
function cells(c: Constraint, verb = true): string {
  const k = c.unknown.length;
  if (!verb) return plural(k, 'covered cell');
  return k === 1 ? 'its one covered cell is' : `all ${k} covered cells are`;
}

/** What a caption is written from. */
export interface Told {
  readonly why: Why;
  readonly open: readonly Cell[];
  readonly struck: number;
}

type Captioner = (told: Told, view: View) => string;

/** The first number a proof read; every writer below that uses it is a trick that reads one. */
const firstNumber = (told: Told): Constraint => told.why.constraints[0]!;
const secondNumber = (told: Told): Constraint => told.why.constraints[1]!;

/** One writer per trick: the proof in a sentence, with its numbers filled in. */
const CAPTIONS: Readonly<Record<TrickId, Captioner>> = {
  'raw-ring': (t, v) => {
    const a = firstNumber(t);
    return (
      `The ${a.cell.num} is at or below your level ${v.level}, so nothing under it is stronger ` +
      `than a ${a.cell.num}: ${cells(a)} safe.`
    );
  },
  'named-kill': (t, v) =>
    `Your mark of ${t.why.cells[0]!.mark} is at or below your level ${v.level}: a free kill.`,
  'met-partner': () =>
    'Every creature has exactly one partner, and these have met theirs, so the ground beside ' +
    'them is empty.',
  corridor: () => TRICK_TEXT.corridor.rule,
  sprinkles: (t) =>
    t.open.length
      ? 'A covered cell with no sprinkle is empty ground, free at any level.'
      : 'A cell under a sprinkle is a creature, never empty ground.',
  'residual-ring': (t, v) => {
    const a = firstNumber(t);
    const n = a.cell.num;
    if (a.residual === 0) return `The ${n} has all of it on show, so ${cells(a)} empty ground.`;
    return (
      `The ${n} has ${n - a.residual} on show around it, so ${a.residual} is hidden over ` +
      `${cells(a, false)}: at or below your level ${v.level}, so all of them are safe.`
    );
  },
  'last-cell': (t, v) => {
    const a = firstNumber(t);
    const n = a.cell.num;
    const r = a.residual;
    const show = n === r ? '' : ` and ${n - r} on show`;
    const then =
      r <= v.level
        ? 'A free kill at your level.'
        : `Mark it and come back at level ${r}; the mark locks the cell until then.`;
    return `The ${n} has one covered neighbour left${show}, so that cell is a ${r}. ${then}`;
  },
  'census-ring': (t, v) => {
    const a = firstNumber(t);
    const k = a.creatures ?? 0;
    if (k === 0)
      return `No creatures are hidden around the ${a.cell.num}, so ${cells(a)} empty ground.`;
    return (
      `${plural(k, 'creature')} share the ${a.residual} hidden around the ${a.cell.num}. Each is ` +
      `at least 1, so none is above ${a.residual - k + 1}: at or below your level ${v.level}.`
    );
  },
  'augur-cap': (t, v) => {
    const a = firstNumber(t);
    const top = a.ceiling ?? 0;
    const listed = a.tiers?.length ? a.tiers.join(', ') : 'nothing';
    if (top <= v.level)
      return (
        `The Augur over the ${a.cell.num} lists ${listed}, at or below your level ${v.level}, so ` +
        `${cells(a)} safe.`
      );
    return `The Augur over the ${a.cell.num} lists ${listed}, so each cell there is empty or one of those.`;
  },
  counters: (t, v) =>
    v.reading.top <= v.level
      ? `The counters show nothing left above tier ${v.reading.top}, at or below your level ` +
        `${v.level}: every covered cell is free.`
      : `The counters show no ${tierList(t.struck & ~1)}s left, so this cannot be one.`,
  'lone-dark': (t) => {
    const a = firstNumber(t);
    return (
      `Only one dark square is left around ${the(a)}, and the ${a.residual} hidden is even; a ` +
      'dark square carries odd tiers only, so it holds nothing.'
    );
  },
  'partner-number': () =>
    "A beaten creature's number is its partner's tier, since nothing else it touches is a " +
    'creature: the cell beside this one is that partner, or empty ground.',
  subtract: (t) => {
    const a = firstNumber(t);
    const b = secondNumber(t);
    return (
      `${capitalise(the(a))}'s covered cells all lie inside ${the(b)}'s, so the cells only ` +
      `${the(b)} sees hold exactly ${b.residual - a.residual}.`
    );
  },
  overlap: (t) =>
    `${capitalise(the(firstNumber(t)))} and ${the(secondNumber(t))} share some covered cells ` +
    'but not all; what each sees alone is bounded by the other, which decides these cells.',
  bounds: (t, v) => {
    const a = firstNumber(t);
    const k = a.unknown.length;
    const floor = a.residual - (k - 1) * v.reading.top;
    const so =
      floor > 0
        ? `each holds at least ${floor}, so all of them are creatures`
        : 'only some tiers can share it that way';
    return `${capitalise(the(a))} spreads ${a.residual} over ${plural(k, 'cell')}: ${so}.`;
  },
  'colour-cap': (t) =>
    'Light squares carry even tiers and dark squares odd, so the colour caps what can hide ' +
    `under ${the(firstNumber(t))} on each square.`,
  'pack-gap': () =>
    'A pack is one creature of every tier. Beside this pack a cell holds a tier it has not ' +
    'shown yet, or nothing.',
  'what-if': (t) =>
    `Suppose this cell were ${tierList(t.struck)}: the ` +
    `${plural(t.why.constraints.length, 'number')} around it could not all be made. ` +
    'So it is not.',
  'line-reach': () => TRICK_TEXT['line-reach'].rule,
  accounted: (t, v) => {
    const acc = t.why.constraints.reduce((s, c) => s + c.residual, 0);
    const total = v.reading.totalHiding;
    return (
      `${plural(t.why.constraints.length, 'number')} whose rings do not overlap account for ` +
      `${acc} of the ${total} tier still hidden; ${total - acc} is left for every other covered cell.`
    );
  },
  'last-of-tier': (t, v) => {
    const tier = highestTier(t.struck);
    const left = v.reading.hiding[tier] ?? 1;
    const last = left === 1 ? `The last tier ${tier}` : `The last ${left} tier ${tier}s`;
    const rings =
      t.why.constraints.length === 1
        ? `around ${the(firstNumber(t))}, which cannot be made without one`
        : `around ${t.why.constraints.length} numbers that cannot be made without one`;
    return `${last} must be ${rings}, so no other cell holds a ${tier}.`;
  },
};

/** A trick's proof in a sentence, with its numbers filled in. */
export function caption(id: TrickId, told: Told, view: View): string {
  return CAPTIONS[id](told, view);
}
