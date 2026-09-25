/**
 * The complete deducer's search: the model of what is on screen, and the state every question
 * asked of one board shares. Bounds propagation over the sums, the tier counts, and a depth-first
 * search for one layout (`Search.feasible`). `solver.ts` builds the model and asks the questions.
 */

import type { Cell } from '../engine/types.js';
import type { Pools } from '../engine/placement/rule.js';

export interface Constraint {
  readonly vars: number[];
  readonly target: number;
}

export interface Model {
  readonly tiers: number;
  /** Covered cells some number touches. */
  readonly vars: Cell[];
  readonly dom: number[];
  readonly cons: Constraint[];
  readonly consOf: number[][];
  /** Creatures of each tier still unaccounted for; index 0 unused. */
  readonly remaining: number[];
  /** Covered cells no number touches, and what each could hold. */
  readonly interior: Cell[];
  readonly interiorDom: number[];
}

export const lowest = (m: number): number => 31 - Math.clz32(m & -m);
export const highest = (m: number): number => 31 - Math.clz32(m);

/**
 * A sum over some cells that must land in [lo, hi]. Exact on the board. A range
 * once the cells outside a local window are summarised by what they could
 * hold, which only ever admits MORE layouts — so a local window that has no
 * room for a dangerous cell is a proof, and one that does is merely a reason
 * to look wider.
 */
export interface Sum {
  readonly vars: number[];
  readonly lo: number;
  readonly hi: number;
}

export interface Problem {
  readonly members: number[];
  readonly sums: Sum[];
}

const single = (d: number): boolean => (d & (d - 1)) === 0;

/**
 * The search state every question asked of one board shares, and the search itself: bounds
 * propagation over the sums, the tier counts, and a depth-first search for one layout.
 */
export class Search {
  /** Each variable's current domain, as a tier mask. */
  readonly cur: Int32Array;
  readonly counts: Int32Array;
  /** Every value a layout found so far has given each variable. */
  readonly seen: Int32Array;
  /** Tiers some layout of the frontier has left over for the interior. */
  interiorSeen = 0;

  private readonly sumsOf: number[][];
  private readonly trail: number[] = [];
  private readonly queue: number[] = [];
  private queued = new Uint8Array(0);
  private nodes = 0;

  // The interior's capacity per pool, because a tier fits only on cells of its
  // own pool: the checkerboard's colours, one pool everywhere else.
  private readonly tierPool: number[] = [0];
  private readonly capacity: number[] = [];
  private readonly need: number[];

  // The question being asked: set by `feasible`, read by the steps it runs.
  private sums: Sum[] = [];
  private members: number[] = [];
  private bindable = 0;
  private order: number[] = [];
  private leaf: (() => boolean) | null = null;
  private bold = false;
  private limit = 0;

  constructor(
    private readonly model: Model,
    pools: Pools,
    private readonly above: number,
    private readonly joint: boolean,
    private readonly budget: number,
  ) {
    const { tiers, vars, interior } = model;
    const n = vars.length;
    this.cur = new Int32Array(n);
    this.counts = new Int32Array(tiers + 1);
    this.seen = new Int32Array(n);
    this.sumsOf = new Array<number[]>(n);

    const poolIds = new Map<string, number>();
    const poolId = (key: string): number => {
      const known = poolIds.get(key);
      if (known !== undefined) return known;
      poolIds.set(key, poolIds.size);
      return poolIds.size - 1;
    };
    for (let t = 1; t <= tiers; t++) this.tierPool.push(poolId(pools.forTier(t)));
    for (const c of interior) {
      const id = poolId(pools.of(c.x, c.y));
      this.capacity[id] = (this.capacity[id] ?? 0) + 1;
    }
    this.need = new Array<number>(poolIds.size);
  }

  leftover(t: number): number {
    return this.model.remaining[t]! - this.counts[t]!;
  }

  interiorFits(): boolean {
    const { need, tierPool, capacity } = this;
    need.fill(0);
    for (let t = 1; t <= this.model.tiers; t++) need[tierPool[t]!] += this.leftover(t);
    for (let id = 0; id < need.length; id++) if (need[id]! > (capacity[id] ?? 0)) return false;
    return true;
  }

  private span(lo: number, hi: number): number {
    const a = Math.max(lo, 0);
    const b = Math.min(hi, this.model.tiers);
    return a > b ? 0 : ((1 << (b + 1)) - 1) & ~((1 << a) - 1);
  }

  /**
   * Is there a layout of `p` within domains `d`? True leaves it in `cur`; null
   * means the budget ran out first. `bold` has each cell not yet shown
   * dangerous try its dangerous values first, so one layout settles as many as
   * it can — worth it in a small window, ruinous across a whole piece, where
   * the ordinary lowest-first order finds a layout far faster.
   */
  feasible(
    p: Problem,
    d: ArrayLike<number>,
    start: number,
    leaf: (() => boolean) | null,
    bold = false,
    limit = this.budget,
  ): boolean | null {
    this.prepare(p, d);
    this.leaf = leaf;
    this.bold = bold;
    this.limit = limit;
    for (let i = 0; i < this.sums.length; i++) this.enqueue(i);
    if (!this.settle()) return false;
    if (!this.members.length) {
      if (!leaf) return true;
      this.countAll();
      return leaf();
    }
    this.orderFrom(start);
    return this.dfs(0);
  }

  record(p: Problem): void {
    const { cur, seen, counts } = this;
    for (const w of p.members) seen[w]! |= cur[w]!;
    if (!this.joint) return;
    counts.fill(0);
    for (const w of p.members) if (cur[w]! > 1) counts[lowest(cur[w]!)]!++;
    for (let t = 1; t <= this.model.tiers; t++)
      if (this.leftover(t) > 0) this.interiorSeen |= 1 << t;
  }

  private prepare(p: Problem, d: ArrayLike<number>): void {
    const { members, sums } = p;
    const { cur, sumsOf } = this;
    this.members = members;
    this.sums = sums;
    for (const w of members) {
      cur[w] = d[w]!;
      sumsOf[w] = [];
    }
    sums.forEach((s, i) => {
      for (const w of s.vars) sumsOf[w]!.push(i);
    });
    if (this.queued.length < sums.length) this.queued = new Uint8Array(sums.length * 2);
    this.queued.fill(0, 0, sums.length);
    this.queue.length = 0;
    this.trail.length = 0;
    this.nodes = 0;

    // A tier can only bind if fewer are left than cells that could take it.
    let bindable = 0;
    for (let t = 1; t <= this.model.tiers; t++) {
      let could = 0;
      for (const w of members) if (cur[w]! & (1 << t)) could++;
      if (could > this.model.remaining[t]!) bindable |= 1 << t;
    }
    this.bindable = bindable;
  }

  private enqueue(s: number): void {
    if (!this.queued[s]) {
      this.queued[s] = 1;
      this.queue.push(s);
    }
  }

  private flush(): void {
    for (const s of this.queue) this.queued[s] = 0;
    this.queue.length = 0;
  }

  private narrow(w: number, nd: number): void {
    this.trail.push(w, this.cur[w]!);
    this.cur[w] = nd;
    for (const s of this.sumsOf[w]!) this.enqueue(s);
  }

  private undo(mark: number): void {
    const { trail, cur } = this;
    while (trail.length > mark) {
      const old = trail.pop()!;
      cur[trail.pop()!] = old;
    }
  }

  // Bounds propagation: every cell behind a number lies between what the
  // number still needs with its neighbours at their most and at their least.
  // A bound gone stale mid-pass is looser than the true one, so filtering on
  // it is still sound, and the sum is queued again anyway.
  private propagate(): boolean {
    const { queue, queued, sums, cur } = this;
    while (queue.length) {
      const i = queue.pop()!;
      queued[i] = 0;
      const s = sums[i]!;
      let lo = 0;
      let hi = 0;
      for (const w of s.vars) {
        lo += lowest(cur[w]!);
        hi += highest(cur[w]!);
      }
      if (s.hi < lo || s.lo > hi) {
        this.flush();
        return false;
      }
      for (const w of s.vars) {
        const m = cur[w]!;
        if (single(m)) continue;
        const wl = lowest(m);
        const wh = highest(m);
        const min = s.lo - (hi - wh);
        const max = s.hi - (lo - wl);
        if (min <= wl && max >= wh) continue;
        const nd = m & this.span(min, max);
        if (!nd) {
          this.flush();
          return false;
        }
        this.narrow(w, nd);
      }
    }
    return true;
  }

  private countAll(): void {
    this.counts.fill(0);
    for (const w of this.members) {
      const m = this.cur[w]!;
      if (single(m) && m > 1) this.counts[lowest(m)]!++;
    }
  }

  // The tier counts: none exceeded, and a tier used up is out of every other cell.
  private tally(): boolean {
    const { bindable, counts, cur } = this;
    const { remaining, tiers } = this.model;
    if (!bindable) return true;
    this.countAll();
    let spent = 0;
    for (let t = 1; t <= tiers; t++) {
      if (counts[t]! > remaining[t]!) return false;
      if (counts[t] === remaining[t] && bindable & (1 << t)) spent |= 1 << t;
    }
    if (!spent) return true;
    for (const w of this.members) {
      const m = cur[w]!;
      if (single(m) || !(m & spent)) continue;
      const nd = m & ~spent;
      if (!nd) return false;
      this.narrow(w, nd);
    }
    return true;
  }

  private settle(): boolean {
    do {
      if (!this.propagate()) return false;
      if (!this.tally()) {
        this.flush();
        return false;
      }
    } while (this.queue.length);
    return true;
  }

  // Outward from the cell being asked about, so a contradiction near it is
  // met near the root rather than after the far side of the board is laid.
  private orderFrom(start: number): void {
    const { members, sums, sumsOf } = this;
    const order: number[] = [];
    const put = new Set<number>();
    const visit = (w: number): void => {
      if (!put.has(w)) {
        put.add(w);
        order.push(w);
      }
    };
    visit(start >= 0 ? start : members[0]!);
    for (let i = 0; i < order.length; i++) {
      for (const s of sumsOf[order[i]!]!) for (const w of sums[s]!.vars) visit(w);
    }
    for (const w of members) visit(w);
    this.order = order;
  }

  private dfs(from: number): boolean | null {
    const { order, cur } = this;
    let i = from;
    while (i < order.length && single(cur[order[i]!]!)) i++;
    if (i === order.length) {
      if (!this.leaf) return true;
      this.countAll();
      return this.leaf();
    }
    if (++this.nodes > this.limit) return null;
    const w = order[i]!;
    const m = cur[w]!;
    const high = this.bold && (this.seen[w]! & this.above) === 0;
    const { tiers } = this.model;
    for (let k = 0; k <= tiers; k++) {
      const x = high ? tiers - k : k;
      if (!(m & (1 << x))) continue;
      const mark = this.trail.length;
      this.narrow(w, 1 << x);
      if (this.settle()) {
        const r = this.dfs(i + 1);
        if (r === true) return true;
        if (r === null) {
          this.undo(mark);
          return null;
        }
      }
      this.undo(mark);
    }
    return false;
  }
}
