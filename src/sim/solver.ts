/**
 * A complete deducer, for measuring the honest player against.
 *
 * The honest player in `honest.ts` deduces the way a careful person does: one
 * number at a time, pairs of numbers subtracted, the placement rules read off
 * the cells beside them. Every forced-guess figure in CLAUDE.md is what THAT
 * player could not get past, which makes each one an upper bound on the
 * guesses a board really forces. This answers the exact question instead: is
 * there a covered cell that every layout consistent with the screen makes free?
 *
 * The board is a system of sums. Each open cell's number is the total tier of
 * its covered neighbours once the known ones are taken out, over cells that
 * each hold a tier from 0 to T, narrowed by the placement rule. A cell is free
 * when no solution puts it above your level. Found by search, and the search
 * is cheap for a reason worth knowing: one solution witnesses a value for every
 * cell it touches, so a cell some solution already puts above your level is
 * settled without being asked about. Only the rest get a search of their own,
 * restricted to that cell being dangerous, and a search that comes back empty
 * IS the proof.
 *
 * WHAT IT READS is what a player can see and nothing else: the numbers on open
 * cells (a defeated creature's too — hovering shows it, except on a pairing
 * board, where it is not drawn and this reads it anyway), the tiers of open
 * cells and of givens, the colour rule, the pairing and pack rules as far as
 * the cells beside an open creature reach, and how many of each tier are left
 * (the palette counts them). What it leaves out is stated rather than hidden:
 * the dungeon's room structure, and the structural rules away from open
 * creatures. Leaving a rule out can only make it find FEWER free cells, never
 * a wrong one, so every count it produces is a floor on what a perfect player
 * could deduce, not an estimate of it.
 *
 * The tier counts bind across the whole board, which would couple every part
 * of the frontier to every other. On a big frontier they are applied to each
 * piece on its own, which is sound and nearly exact while plenty of board is
 * still hidden; once the frontier is small — the endgame, where counting is
 * what a real player falls back on — it is searched as one system, and the
 * hidden interior is checked against what the frontier leaves over.
 */

import type { Game } from '../engine/game.js';
import type { Cell } from '../engine/types.js';
import { placementRule } from '../engine/placement/registry.js';
import {
  type Constraint,
  type Model,
  type Problem,
  Search,
  type Sum,
  highest,
  lowest,
} from './search.js';

export interface SolveOptions {
  /** Search nodes one question may use before it is left undecided. */
  budget?: number;
  /** Frontiers up to this many cells are searched as one system. */
  jointVars?: number;
  /**
   * The tier a cell must be proven at or below. Defaults to the player's
   * level, which makes "safe" mean free to open. Any other value asks a
   * different question of the same search — at the highest tier that would
   * NOT kill at the player's current HP, "safe" means a guess there can hurt
   * but cannot end the board.
   */
  threshold?: number;
}

export interface Solution {
  /** Covered cells at or below your level in every consistent layout. */
  safe: Cell[];
  /** Questions the budget cut off. Those cells count as NOT safe. */
  undecided: number;
  /** No layout fits what is on screen — a rule encoded wrongly. Must stay false. */
  inconsistent: boolean;
  /** Whether the frontier was searched as one system. */
  joint: boolean;
}

function buildModel(game: Game): Model | null {
  const tiers = game.config.tiers;
  const all = game.grid.flat().filter((c) => c.present);
  const known = (c: Cell): number | null => (c.open ? c.tier : c.given ? c.mark : null);

  const remaining = new Array<number>(tiers + 1).fill(0);
  for (let t = 1; t <= tiers; t++) remaining[t] = game.config.quantity[t - 1] ?? 0;
  for (const c of all) {
    const k = known(c);
    if (k !== null && k > 0) remaining[k]!--;
  }
  if (remaining.some((r) => r < 0)) return null;

  // A tier with none left is out of every cell, which is how "all the strong
  // ones are dead" turns the whole board free without a single number read.
  let alive = 1;
  for (let t = 1; t <= tiers; t++) if (remaining[t]! > 0) alive |= 1 << t;
  // Cells the rule proves empty outright (a congo line's reach): the one reading
  // the pencil does not make, because it is not a reading of one neighbour.
  // Everything else the rule says about a cell arrives through
  // `noteCandidates`, the same reading the pencil uses, so the two cannot drift.
  const clear = placementRule(game.config.placement).emptied(game);
  const domOf = (c: Cell): number => game.noteCandidates(c) & (clear.has(c) ? 1 : ~0) & alive;

  const index = new Map<Cell, number>();
  const vars: Cell[] = [];
  const cons: Constraint[] = [];
  for (const c of all) {
    if (!c.open) continue;
    let target = c.num;
    const vs: number[] = [];
    for (const n of game.neighboursOf(c)) {
      const k = known(n);
      if (k !== null) {
        target -= k;
        continue;
      }
      let i = index.get(n);
      if (i === undefined) {
        i = vars.length;
        vars.push(n);
        index.set(n, i);
      }
      vs.push(i);
    }
    if (!vs.length) {
      if (target !== 0) return null;
      continue;
    }
    if (target < 0) return null;
    cons.push({ vars: vs, target });
  }

  const dom = vars.map(domOf);
  if (dom.some((d) => d === 0)) return null;
  const consOf: number[][] = vars.map(() => []);
  cons.forEach((c, i) => {
    for (const v of c.vars) consOf[v]!.push(i);
  });

  const interior = all.filter((c) => known(c) === null && !index.has(c));
  return { tiers, vars, dom, cons, consOf, remaining, interior, interiorDom: interior.map(domOf) };
}

/** The pieces of frontier that share no number, each exact; one piece holding everything if joint. */
function pieces(model: Model, joint: boolean): Problem[] {
  const { cons, consOf } = model;
  const n = model.vars.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (const c of cons) for (const v of c.vars.slice(1)) parent[find(v)] = find(c.vars[0]!);
  const groups = new Map<number, number[]>();
  for (let v = 0; v < n; v++)
    (groups.get(find(v)) ?? groups.set(find(v), []).get(find(v))!).push(v);

  const exact = (members: number[]): Problem => {
    const inside = new Set(members);
    const touched = new Set<number>();
    for (const w of members) for (const c of consOf[w]!) touched.add(c);
    const sums = [...touched].map((c) => ({
      vars: cons[c]!.vars,
      lo: cons[c]!.target,
      hi: cons[c]!.target,
    }));
    for (const s of sums) if (!s.vars.every((w) => inside.has(w))) throw new Error('piece leaks');
    return { members, sums };
  };
  return joint ? [exact(Array.from({ length: n }, (_, i) => i))] : [...groups.values()].map(exact);
}

/** The cells within `radius` numbers of v, with every number that reaches
 *  outside the window relaxed to what its outside cells could make up. */
function window(model: Model, v: number, radius: number, d: ArrayLike<number>): Problem {
  const { cons, consOf } = model;
  const inside = new Set([v]);
  let ring = [v];
  for (let r = 0; r < radius; r++) {
    const next: number[] = [];
    for (const w of ring) {
      for (const c of consOf[w]!)
        for (const u of cons[c]!.vars)
          if (!inside.has(u)) {
            inside.add(u);
            next.push(u);
          }
    }
    ring = next;
  }
  const touched = new Set<number>();
  for (const w of inside) for (const c of consOf[w]!) touched.add(c);
  const sums: Sum[] = [];
  for (const c of touched) {
    const { vars: vs, target } = cons[c]!;
    const own: number[] = [];
    let oLo = 0;
    let oHi = 0;
    for (const w of vs) {
      if (inside.has(w)) own.push(w);
      else {
        oLo += lowest(d[w]!);
        oHi += highest(d[w]!);
      }
    }
    sums.push({ vars: own, lo: target - oHi, hi: target - oLo });
  }
  return { members: [...inside], sums };
}

/** Every cell the screen proves at or below the player's level. */
export function solve(game: Game, opts: SolveOptions = {}): Solution {
  const budget = opts.budget ?? 20000;
  const jointVars = opts.jointVars ?? 40;
  const model = buildModel(game);
  if (!model) return { safe: [], undecided: 0, inconsistent: true, joint: false };

  const { tiers, vars, dom, interior, interiorDom } = model;
  const n = vars.length;
  const level = opts.threshold ?? game.level;
  const every = (1 << (tiers + 1)) - 1;
  const above = level >= tiers ? 0 : every & ~((1 << (level + 1)) - 1);
  const joint = n <= jointVars;
  const search = new Search(
    model,
    placementRule(game.config.placement).pools,
    above,
    joint,
    budget,
  );
  const { cur, seen } = search;

  const whole = pieces(model, joint);
  const home = new Map<number, Problem>();
  for (const p of whole) for (const w of p.members) home.set(w, p);

  // A given at or below your level is a free kill with its tier already on it.
  const safe: Cell[] = game.grid
    .flat()
    .filter((c) => c.present && !c.open && c.given && c.mark <= level);
  let undecided = 0;
  const leaf = joint ? () => search.interiorFits() : null;

  // A first layout of every piece: proves the model admits one at all.
  for (const p of whole) {
    const r = search.feasible(p, dom, -1, leaf);
    if (r === false) return { safe: [], undecided: 0, inconsistent: true, joint };
    if (r === true) search.record(p);
  }

  for (let v = 0; v < n; v++) {
    if (!(dom[v]! & above)) {
      safe.push(vars[v]!);
      continue;
    }
    if (seen[v]! & above) continue;
    const d = dom.slice();
    d[v] = dom[v]! & above;
    const p = home.get(v)!;

    // Local first. A window with no room for a dangerous v is a proof. A
    // window with room is a candidate layout, and fixing it and filling in the
    // rest of the piece is usually the fastest way to a real witness — the far
    // side of a piece is only loosely tied to the near side.
    let settled = false;
    for (const radius of [2, 4]) {
      const local = window(model, v, radius, d);
      if (local.members.length >= p.members.length) break;
      const r = search.feasible(local, d, v, null, true, budget >> 2);
      if (r === false) {
        safe.push(vars[v]!);
        settled = true;
        break;
      }
      if (r !== true) continue;
      const fixed = d.slice();
      for (const w of local.members) fixed[w] = cur[w]!;
      if (search.feasible(p, fixed, v, leaf, false, budget >> 2) === true) {
        search.record(p);
        settled = true;
        break;
      }
    }
    if (settled) continue;

    const r = search.feasible(p, d, v, leaf);
    if (r === true) search.record(p);
    else if (r === false) safe.push(vars[v]!);
    else undecided++;
  }

  // The hidden interior. Without the joint search nothing bounds it but the
  // tiers already used up; with it, a tier can reach the interior only if some
  // layout of the frontier leaves one of that tier over.
  const classes = new Map<number, Cell[]>();
  interior.forEach((c, i) => {
    const d = interiorDom[i]! & above;
    if (!d) {
      safe.push(c);
      return;
    }
    (classes.get(d) ?? classes.set(d, []).get(d)!).push(c);
  });
  for (const [d, cells] of classes) {
    if (!joint || search.interiorSeen & d) continue;
    const r = search.feasible(whole[0]!, dom, -1, () => {
      if (!search.interiorFits()) return false;
      for (let t = 1; t <= tiers; t++) if (d & (1 << t) && search.leftover(t) > 0) return true;
      return false;
    });
    if (r === true) search.record(whole[0]!);
    else if (r === false) safe.push(...cells);
    else undecided++;
  }

  return { safe, undecided, inconsistent: false, joint };
}
