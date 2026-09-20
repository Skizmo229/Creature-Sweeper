"""What do placement rules and board topology actually do to a board?

Same creature counts every time - only WHERE they go changes. Measures the
things that decide how a board plays: how big the auto-opening is, how much
of the board is zero, and how the numbers themselves are distributed.
"""
import json, io
import numpy as np
from scipy import ndimage

from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
DATA.mkdir(exist_ok=True)

TRIALS = 240
RNG = np.random.default_rng(31415)
S8 = np.ones((3, 3), dtype=bool)


# ---------- placement strategies : each returns a (h, w) tier grid ----------

def _free_cells(grid):
    return np.argwhere(grid == 0)


def place_scatter(h, w, q):
    g = np.zeros((h, w), dtype=np.int32)
    flat = RNG.permutation(h * w)
    at = 0
    for tier, n in enumerate(q, start=1):
        for i in flat[at:at + n]:
            g[i // w, i % w] = tier
        at += n
    return g


def _place_group(g, tier, size, box, tries=60):
    """Drop `size` creatures of `tier` inside a random box×box window."""
    h, w = g.shape
    for _ in range(tries):
        y = RNG.integers(0, max(1, h - box + 1))
        x = RNG.integers(0, max(1, w - box + 1))
        win = g[y:y + box, x:x + box]
        free = np.argwhere(win == 0)
        if len(free) >= size:
            pick = RNG.choice(len(free), size=size, replace=False)
            for i in pick:
                g[y + free[i][0], x + free[i][1]] = tier
            return size
    return 0


def _fill_remaining(g, tier, n):
    free = _free_cells(g)
    if n <= 0 or not len(free):
        return
    pick = RNG.choice(len(free), size=min(n, len(free)), replace=False)
    for i in pick:
        g[free[i][0], free[i][1]] = tier


def place_triads(h, w, q):
    """Tier-1 creatures in groups of 3 inside a 3x3 window; rest scattered."""
    g = np.zeros((h, w), dtype=np.int32)
    placed = 0
    for _ in range(q[0] // 3):
        placed += _place_group(g, 1, 3, 3)
    _fill_remaining(g, 1, q[0] - placed)
    for tier, n in enumerate(q[1:], start=2):
        _fill_remaining(g, tier, n)
    return g


def place_clustered(h, w, q):
    """Tier-1 triads in 3x3, plus tier-2/tier-4 pairs sharing a 2x2."""
    g = np.zeros((h, w), dtype=np.int32)
    placed1 = 0
    for _ in range(q[0] // 3):
        placed1 += _place_group(g, 1, 3, 3)
    pairs = min(q[1], q[3]) // 2 if len(q) >= 4 else 0
    made2 = made4 = 0
    for _ in range(pairs):
        h0, w0 = g.shape
        for _ in range(60):
            y = RNG.integers(0, max(1, h0 - 1)); x = RNG.integers(0, max(1, w0 - 1))
            win = g[y:y + 2, x:x + 2]
            free = np.argwhere(win == 0)
            if len(free) >= 2:
                pick = RNG.choice(len(free), size=2, replace=False)
                g[y + free[pick[0]][0], x + free[pick[0]][1]] = 2
                g[y + free[pick[1]][0], x + free[pick[1]][1]] = 4
                made2 += 1; made4 += 1
                break
    _fill_remaining(g, 1, q[0] - placed1)
    _fill_remaining(g, 2, q[1] - made2)
    if len(q) >= 3: _fill_remaining(g, 3, q[2])
    if len(q) >= 4: _fill_remaining(g, 4, q[3] - made4)
    for tier, n in enumerate(q[4:], start=5):
        _fill_remaining(g, tier, n)
    return g


def place_lairs(h, w, q):
    """Every top-tier creature sits in a 5x5 with four tier-below escorts."""
    g = np.zeros((h, w), dtype=np.int32)
    T = len(q)
    boss, escort = T, T - 1
    made_b = made_e = 0
    for _ in range(q[boss - 1]):
        before = g.copy()
        if _place_group(g, boss, 1, 5):
            made_b += 1
            got = 0
            for _ in range(4):
                got += _place_group(g, escort, 1, 5)
            made_e += got
        else:
            g = before
    for tier, n in enumerate(q, start=1):
        want = n - (made_b if tier == boss else made_e if tier == escort else 0)
        _fill_remaining(g, tier, want)
    return g


def place_banded(h, w, q):
    """Spatial difficulty gradient: low tiers near the rim, high tiers inward."""
    g = np.zeros((h, w), dtype=np.int32)
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum.reduce([yy, xx, h - 1 - yy, w - 1 - xx]).astype(float)
    central = edge / edge.max()                    # 0 at rim, 1 at core
    T = len(q)
    for tier, n in enumerate(q, start=1):
        target = (tier - 1) / max(1, T - 1)
        wgt = np.exp(-np.abs(central - target) / 0.22)
        wgt[g != 0] = 0
        p = wgt.ravel()
        if p.sum() <= 0:
            _fill_remaining(g, tier, n); continue
        p = p / p.sum()
        idx = RNG.choice(h * w, size=min(n, int((p > 0).sum())), replace=False, p=p)
        for i in idx:
            g[i // w, i % w] = tier
        _fill_remaining(g, tier, n - len(idx))
    return g


# ---------- measurement ----------

def neighbour_sum(g, wrap=False):
    h, w = g.shape
    if wrap:
        return sum(np.roll(np.roll(g, dy, 0), dx, 1)
                   for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))
    p = np.pad(g, 1)
    return sum(p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
               for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))


def measure(g, wrap=False):
    num = neighbour_sum(g, wrap)
    zeros = (g == 0) & (num == 0)
    best = 0
    if zeros.any():
        lab, n = ndimage.label(zeros, structure=S8)
        sizes = ndimage.sum_labels(zeros, lab, index=np.arange(1, n + 1))
        for i in np.argsort(sizes)[::-1][:5]:
            c = int(ndimage.binary_dilation(lab == (i + 1), structure=S8).sum())
            best = max(best, c)
    empty = g == 0
    return best, int(zeros.sum()), float(num[empty].mean()), int(num[empty].max())


STRATEGIES = [
    ("Scatter (current)",        place_scatter,   False),
    ("Tier-1 triads in 3×3",     place_triads,    False),
    ("Triads + 2/4 pairs",       place_clustered, False),
    ("Apex lairs in 5×5",        place_lairs,     False),
    ("Banded (low rim→high core)", place_banded,  False),
    ("Scatter + wrap-around",    place_scatter,   True),
]


def main():
    lad = {t["id"]: t for t in json.load(io.open(DATA / "ladders.json", encoding="utf-8"))}
    beds = [("NORMAL board 5", lad["normal"]["boards"][4]),
            ("EXTREME board 5", lad["extreme"]["boards"][4]),
            ("HUGE board 5", lad["huge"]["boards"][4])]
    out = []
    for bed_name, b in beds:
        print(f"\n=== {bed_name} — {b['w']}×{b['h']}, {b['monsters']} creatures, "
              f"{b['density']}% density, {b['tiers']} tiers ===")
        print(f"{'placement':<30}{'opening':>9}{'vs base':>9}{'zeros':>8}"
              f"{'avg num':>9}{'max num':>9}")
        base = None
        for name, fn, wrap in STRATEGIES:
            res = np.array([measure(fn(b["h"], b["w"], b["quantity"]), wrap)
                            for _ in range(TRIALS)], dtype=float)
            med = float(np.median(res[:, 0]))
            zer = float(np.median(res[:, 1]))
            avg = float(res[:, 2].mean())
            mx = float(np.median(res[:, 3]))
            if base is None:
                base = med
            delta = f"{100*(med-base)/base:+.0f}%" if base else "—"
            print(f"{name:<30}{med:>9.0f}{delta:>9}{zer:>8.0f}{avg:>9.2f}{mx:>9.0f}")
            out.append(dict(bed=bed_name, strategy=name, opening=med,
                            delta=round(100*(med-base)/base) if base else 0,
                            zeros=zer, avg_num=round(avg, 2), max_num=mx))
    json.dump(out, io.open(DATA / "placement.json", "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
