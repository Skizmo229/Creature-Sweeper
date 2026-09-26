"""Creature Sweeper — progression ladder generator.

Derives the 10-board ladder for each game type from a small per-type schedule,
using the tuning identity found in mamono sweeper's own data:

    C_k = total EXP from every monster of tier <= k
    the top `lock` thresholds are exactly C_k (full-tier-clear gates)
    the rest are alpha_k * C_k, alpha ramping from alpha0 up to 0.70
"""
import json, math, tomllib
from dataclasses import dataclass

from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
DATA.mkdir(exist_ok=True)

# ---------- board shapes ---------------------------------------------------
# These predicates MUST match src/engine/shape/fixed.ts. They are
# duplicated rather than shared because the ladder generator has to know how
# many cells a shape leaves *before* it can apportion creatures, and that
# number feeds C_k and therefore every level threshold.
#
# The duplication is guarded: a test asserts the engine's own cell count equals
# the `cells` figure emitted here for every board, so any drift fails loudly
# rather than quietly mistuning a ladder.

def shape_present(shape, param, w, h, x, y):
    cx, cy = (w - 1) / 2, (h - 1) / 2
    if shape == "donut":
        return x < param or y < param or x >= w - param or y >= h - param
    if shape == "cross":
        return abs(x - cx) <= param / 2 or abs(y - cy) <= param / 2
    if shape == "diamond":
        return abs(x - cx) / (w / 2) + abs(y - cy) / (h / 2) <= 1
    if shape == "pyramid":
        return abs(x - cx) < y + 1
    return True


def shape_cells(shape, param, w, h):
    if shape == "rect":
        return w * h
    if shape in ("cave", "dungeon"):
        # These two invert the relationship every other shape has with this file.
        # A ragged cave has no closed form to count, and its silhouette moves
        # with the seed, while C_k needs the cell count fixed before the board
        # exists. So the count is not measured here, it is *chosen* here --
        # per board, in the `cells` schedule -- and the engine's generator is
        # required to hit it on every seed. Same guard as the other shapes,
        # pointing the other way.
        raise ValueError(f"{shape} cells come from the type's `cells` schedule")
    return sum(1 for y in range(h) for x in range(w)
               if shape_present(shape, param, w, h, x, y))

# ---------- shape archetypes -------------------------------------------------

def shape_descending(T, boss=0):
    """Linear descent over the non-boss tiers, from `n` down to a floor.

    The floor matters: mamono sweeper's 5-tier descent runs 5..1 (33,27,20,13,6)
    but its 9-tier descent runs 8..2 (52,46,40,36,30,24,18,13), a much shallower
    slope. floor = round(n/4) reproduces both.
    """
    n = T - (1 if boss else 0)
    floor = max(1, math.floor(n / 4 + 0.5))
    if n == 1:
        return [1.0]
    step = (n - floor) / (n - 1)
    return [n - step * i for i in range(n)]

def shape_flat(T):
    return [1.0] * T


def distribute(total, weights, boss_count=None):
    """Largest-remainder apportionment; every tier gets at least 1.
    If boss_count is set, the top tier is pinned to exactly that many."""
    if boss_count is not None:
        rest = total - boss_count
        q = distribute(rest, weights)
        return q + [boss_count]
    s = sum(weights)
    raw = [total * w / s for w in weights]
    q = [max(1, int(math.floor(r))) for r in raw]
    # fix up to hit `total` exactly, by largest fractional remainder
    diff = total - sum(q)
    order = sorted(range(len(q)), key=lambda i: raw[i] - math.floor(raw[i]), reverse=True)
    i = 0
    while diff > 0:
        q[order[i % len(order)]] += 1
        diff -= 1
        i += 1
    i = 0
    while diff < 0:
        j = order[-1 - (i % len(order))]
        if q[j] > 1:
            q[j] -= 1
            diff += 1
        i += 1
    return q



def distribute_parity(total, weights):
    """Apportion so the two colours of a checkerboard carry the same count.

    Odd tiers have nowhere to go but the dark squares and even tiers nowhere
    but the light ones, so "the same number of enemies per side" is not a
    placement rule at all -- it is a constraint on the quantities, and this is
    where it is met. Each parity is given its own half of the creature budget
    and apportioned inside it by the archetype's own weights, so the shape of
    the distribution is the archetype's and only the totals are pinned.

    One visible consequence, and it is the price of the promise rather than a
    bug: the even tiers are a smaller group carrying an equal share, so each of
    them is a little commoner than the descending curve would have made it, and
    tier 2 comes out marginally ahead of tier 1. The curve is still descending
    in pairs, and C_k still climbs, which is all the tuning identity asks of it.

    An odd total gives the extra creature to the dark squares, where the tier-1
    creatures are: one more of the cheapest thing on the board is the least
    consequential place to put a rounding error.
    """
    odd = [i for i in range(len(weights)) if (i + 1) % 2 == 1]
    even = [i for i in range(len(weights)) if (i + 1) % 2 == 0]
    q = [0] * len(weights)
    for idx, share in ((odd, (total + 1) // 2), (even, total // 2)):
        if not idx:
            continue
        sub = distribute(share, [weights[i] for i in idx])
        for j, i in enumerate(idx):
            q[i] = sub[j]
    return q

# ---------- curve derivation -------------------------------------------------

def cumulative_exp(q):
    """C_k for k = 1..T, where a tier-i monster is worth 2^(i-1)."""
    out, run = [], 0
    for i, n in enumerate(q):
        run += n * (2 ** i)
        out.append(run)
    return out


def exp_array(q, lock, alpha0, alpha_top=0.70):
    """Thresholds to reach LV2..LVT. Last `lock` entries are exact C_k gates."""
    T = len(q)
    C = cumulative_exp(q)
    n_thresh = T - 1
    unlocked = max(0, n_thresh - lock)
    out = []
    for k in range(1, n_thresh + 1):          # threshold from LV k -> LV k+1
        if k > unlocked:
            out.append(C[k - 1])              # exact full-tier-clear gate
        else:
            if unlocked <= 1:
                a = alpha0
            else:
                a = alpha0 + (alpha_top - alpha0) * (k - 1) / (unlocked - 1)
            out.append(max(1, round(a * C[k - 1])))
    # enforce strict monotonicity (rounding can collide at low counts)
    for i in range(1, len(out)):
        if out[i] <= out[i - 1]:
            out[i] = out[i - 1] + 1
    return out


def damage(L, E):
    """HP lost beating a tier-E creature at level L, assuming you survive."""
    if L <= 0:
        return None
    return E * (math.ceil(E / L) - 1)


# ---------- per-type ladder schedules ---------------------------------------
# The schedules live in ladder_types.toml, one [[type]] per ladder, with the schema written out at
# its top. This is the schema enforced: a typo or a short schedule fails here, naming the ladder,
# rather than as a board that quietly is not the one that was tuned.

REQUIRED = ("id", "name", "tint", "archetype", "axis", "blurb",
            "size", "tiers", "density", "hp", "lock", "alpha0")
OPTIONAL = ("boss", "sweep", "spells", "start_mana", "workout", "placement", "sets", "givens",
            "topology", "wrap", "shape", "shape_param", "cells", "reach", "search", "ceiling",
            "opening")
# The fields that are one value per board.
SCHEDULES = ("size", "tiers", "density", "hp", "lock", "alpha0", "boss", "sets", "givens", "cells")


def load_types(path=HERE / "ladder_types.toml"):
    """Every type's schedule, checked against the schema. TOML has no null, so a type without a
    boss count omits it and reads back as None."""
    with open(path, "rb") as f:
        types = tomllib.load(f)["type"]
    for t in types:
        where = t.get("id", "a type with no id")
        missing = [k for k in REQUIRED if k not in t]
        unknown = [k for k in t if k not in REQUIRED + OPTIONAL]
        if missing or unknown:
            raise ValueError(f"{where}: missing {missing}, unknown {unknown}")
        for k in SCHEDULES:
            if k in t and len(t[k]) != 10:
                raise ValueError(f"{where}: {k} has {len(t[k])} entries, one per board is 10")
        t.setdefault("boss", None)
    return types


TYPES = load_types()

# ---------- boards beyond 10 -------------------------------------------------
# The tuned ladder is ten boards and stays ten boards. Everything past it is a
# *continuation* of the same schedules, emitted separately as `extended` so
# that `boards` keeps meaning "the ladder" everywhere downstream - board 10 is
# still what clears a type, and a Full Run is still ten boards.
#
# Every schedule above is linear, so the continuation is the schedule's own
# average step per board, carried on from board 10 and clamped. A dial that is
# flat across the ten boards stays flat: EASY's lock depth is 2 by design, and
# continuing it at 2 is what keeps board 25 of EASY recognisably EASY rather
# than a differently-named EXTREME.
#
# A type stops where it stops changing. Once every dial is pinned at its
# ceiling the next board would be identical to the last, and an identical board
# is not another board - it is the same board with a fresh seed, which is what
# replaying the last one already gives you.

CEILINGS = dict(
    # 2048 cells. The largest board the tuned ladders already reach.
    max_w=64, max_h=32,
    # Past this a board stops being a puzzle and starts being a minefield;
    # search boards cap lower because they have no level economy to lean on.
    density_battle=.34, density_search=.30,
    # alpha only scales the *unlocked* thresholds, and once lock hits T-1 there
    # are none left, so this floor is a guard against a negative multiplier
    # rather than a tuning value.
    alpha_floor=.05,
    tier=9,
    boss=6,
    # How far the SCHEDULE is walked, in board-steps. Much larger than the
    # number of boards it yields, because a step that rounds to the same board
    # is skipped rather than emitted - EXTREME grows 0.444 cells a board, so it
    # takes two or three steps to earn one board.
    horizon=400,
    # How many boards the continuation may emit. A ceiling on content, not on
    # difficulty: every type reaches its dials' clamps well inside it, and a
    # type that wants more is a schedule that is barely moving.
    max_extended=30,
)


def _step(vals):
    """The schedule's average step per board, which is how it is continued."""
    return (vals[-1] - vals[0]) / (len(vals) - 1)


def _density_cap(t):
    """The highest density the continuation may give this type's boards."""
    # Sudoku's density is fixed by its own rule at 72/81, so the battle cap
    # would clamp it to a third of the board and destroy the mode. Density is
    # not one of its dials at all - the givens are.
    #
    # And a cap is never allowed below where the tuned ladder already finished.
    # HIVE ends at 35% and ARCANE at 34.5%, both past the 34% ceiling; clamping
    # to it would make board 11 SPARSER than board 10, which is not a gentler
    # board, it is a board with too few creatures left to meet its own
    # thresholds.
    #
    # A type may also cap itself below the global ceiling, and DUNGEON does.
    # Its walls are what make it hard rather than its creatures, so the density
    # a deductive player can still get through is roughly half what an open
    # board tolerates; carrying it on to 34% would continue the schedule into
    # boards nobody can finish.
    if t.get("placement") == "sudoku":
        return 1.0
    default = CEILINGS["density_search"] if t.get("search", False) else CEILINGS["density_battle"]
    return max(t["density"][-1], t.get("ceiling", {}).get("density_cap", default))


def _domino_box(t, T, i, density, max_w, max_h):
    """Step i of a domino ladder's continuation: its board size and its number of sets, or None
    once a set no longer fits the largest board."""
    # A domino board's creatures come in whole sets, so the step past
    # board 10 is one more set, and the board is sized to hold it at
    # the density cap rather than extrapolated from the size schedule.
    # Extrapolating is what every other ladder does and it is wrong
    # here: the schedule's own growth would lay seven sets on a board
    # sized for about six and run past the packing ceiling, which
    # config.ts refuses outright. Once a set no longer fits the largest
    # board there is simply no further step, and the continuation ends there.
    s_next = t["sets"][-1] + i
    creatures = T * (T + 1) * s_next
    # Keep the ladder's own landscape shape. Pinning the height at the
    # ceiling and deriving the width would make the first scaling board
    # 21x32 - a portrait board after ten landscape ones. Only once the
    # natural shape stops fitting does the height go to the ceiling to buy
    # width.
    cells = creatures / density
    h = min(max_h, max(1, round(math.sqrt(cells / 1.75))))
    w = math.ceil(creatures / (density * h))
    if w > max_w:
        h = max_h
        w = math.ceil(creatures / (density * h))
        if w > max_w:
            return None
    return (w, h), s_next


def extend(t):
    """Boards 11..N for one type, as rows in the same shape the schedule uses."""
    search = t.get("search", False)
    over = t.get("ceiling", {})
    max_w = over.get("max_w", CEILINGS["max_w"])
    max_h = over.get("max_h", CEILINGS["max_h"])
    # "HP at its floor" means the floor the tuned ladder already chose. EXTREME
    # bottoms out at 8 and ORACLE at 6 deliberately; continuing the erosion
    # past that would invent a difficulty those ladders never claimed, and
    # take EXTREME to HP 2.
    hp_floor = over.get("hp_floor", min(t["hp"]))
    d_cap = _density_cap(t)

    ws = [sz[0] for sz in t["size"]]
    hs = [sz[1] for sz in t["size"]]
    dw, dh = _step(ws), _step(hs)
    dd, dhp = _step(t["density"]), _step(t["hp"])
    dlock, dalpha = _step(t["lock"]), _step(t["alpha0"])
    dtier = _step(t["tiers"])
    dboss = _step(t["boss"]) if t.get("boss") else 0.0
    dgiv = _step(t["givens"]) if t.get("givens") else 0.0

    rows = []
    for i in range(1, CEILINGS["horizon"] + 1):
        T = min(CEILINGS["tier"], round(t["tiers"][-1] + dtier * i))
        w_next = min(max_w, round(ws[-1] + dw * i))
        # A checkerboard needs an even number of squares or one colour has a
        # square more than the other, which is the one thing the mode promises
        # it does not. The tuned ten are chosen even; the continuation rounds
        # the width down to even, because the height schedule is the slower of
        # the two and pinning the faster one costs the least.
        if t.get("placement") == "checker" and w_next % 2:
            w_next -= 1
        h_next = min(max_h, round(hs[-1] + dh * i))
        # A pyramid fills a box exactly twice as wide as it is tall (PYRAMID_SHAPE in
        # fixed.ts). Carried on separately the two schedules drift off that, which clips the
        # base or leaves a margin, so the continuation takes the width from the height.
        if t.get("shape") == "pyramid":
            h_next = min(h_next, max_w // 2)
            w_next = 2 * h_next
        row = dict(
            size=(w_next, h_next),
            tiers=T,
            density=min(d_cap, t["density"][-1] + dd * i),
            hp=max(hp_floor, round(t["hp"][-1] + dhp * i)),
            lock=min(T - 1, round(t["lock"][-1] + dlock * i)),
            alpha0=0 if search else max(CEILINGS["alpha_floor"],
                                        t["alpha0"][-1] + dalpha * i),
        )
        if t.get("boss"):
            row["boss"] = min(CEILINGS["boss"], round(t["boss"][-1] + dboss * i))
        if t.get("givens"):
            # Measured floor, not a taste call: at 12 givens a guess-free board
            # costs ~100ms to find, at 11 the generator refuses three boards in
            # four. Below its floor it throws rather than shipping a board it
            # cannot vouch for, so the schedule must stop above it.
            row["givens"] = max(over.get("givens_floor", 12),
                                round(t["givens"][-1] + dgiv * i))
        if t.get("placement") == "dominoes":
            box = _domino_box(t, T, i, row["density"], max_w, max_h)
            if box is None:
                break
            row["size"], row["sets"] = box
        if t.get("cells") is not None:
            # A carved shape's count is chosen, never measured - same 40% of
            # the bounding box the tuned ten hold, and still inside the margin
            # the generator needs.
            w, h = row["size"]
            row["cells"] = carved_cells(t.get("shape"), w, h)
        rows.append(row)
    return rows


# ---------- unlocks ----------------------------------------------------------
# Two kinds of gate, and they mean different things.
#
# A TYPE gate ("clear EASY") is a statement about readiness: this ladder
# teaches something the next one assumes. HUGE x EXTREME needs both of its
# parents because it is literally both of them at once, and HUGE x BLIND needs
# HUGE and BLIND for the same reason - a combined type should not be reachable
# without having played the things it combines.
#
# A BOARD-COUNT gate ("clear 25 boards, anywhere") is a statement about time
# served. Most ladders do not teach each other - a hex grid teaches you nothing
# about a torus, and neither teaches you Sudoku - so chaining them would be a
# fiction, and would make a player who wants the ragged cave grind three shapes
# they have no interest in first (decision 0018). Counting boards lets them
# arrive from whatever direction they like.
UNLOCKS = {
    "easy": [],
    "normal": ["easy"],
    # Both parents: this ladder is the two of them at once.
    "huge_extreme": ["huge", "extreme"],
    "huge_blind": ["huge", "blind"],
}

# Boards cleared anywhere in the game, counting each board once. 0 means the
# type has no board-count gate at all.
#
# Every five boards from 15 opens the next ladder in each menu category that
# has one left (decision 0036), so a step offers a choice of what kind of
# thing to play next rather than the next thing. It starts at 15 so the first
# step arrives after EASY and half of NORMAL, not on EASY alone. Within a
# category the order follows CATEGORIES, and BLIND waits one step past the
# last of the rest, where its old Full Run gate used to put it: 1 HP with no
# fighting is the game's hardest discipline, not its next lesson.
#
# The type gates alone offer 20 ladder boards (EASY, NORMAL), past the first
# step at 15, and every step opens at least ten boards for the five it asks,
# so the schedule is met without a single scaling board;
# `test/unlocks.test.ts` walks it in order to check exactly that. Scaling
# boards past 10 count too, for a player who would rather go deep.
#
# THE ORDER IS A DESIGN CHOICE, not the measured difficulty ranking (decision
# 0018). It is set by hand to pace what the player meets. For reference, the
# honest player from `sim:spells`, spell-less, 30 seeds a board, mean clear rate
# over the tuned ten, ranks the ladders that used to be counted:
#
#   WRAPAROUND 99.0   DUNGEON 97.7   CHECKERBOARD 97.4   DIAMOND 95.5
#   CROSS 94.0        CONGA LINE 92.8 HIVE 92.7          PAIRS 92.1
#   RAGGED CAVE 89.0  DONUT 84.9
#
# Spell-less on purpose, so every ladder is measured by the same player; the
# shaped ladders carry spells in play, which only makes them gentler than this.
# HIVE and PAIRS are within the noise of each other. SUDOKU cannot be measured
# on the same scale -- it is guess-free by construction -- so it closes its
# category. DUNGEON, the second easiest, closes Magic: it carries spells and
# the crawl rule, and by then the player has met every spell on ARCANE,
# WORKOUT and ORACLE.
BOARD_STEP = 5
FIRST_STEP = 15
BLIND_AFTER_STEPS = 1


def unlock_boards():
    """Each counted ladder's gate: the n-th of its category opens on step n."""
    gates = {}
    for cat, ids in CATEGORIES.items():
        counted = [t for t in ids if t not in UNLOCKS and t != "blind"]
        for i, tid in enumerate(counted):
            gates[tid] = FIRST_STEP + BOARD_STEP * i
    gates["blind"] = max(gates.values()) + BOARD_STEP * BLIND_AFTER_STEPS
    return gates


# The menu's four categories, and the order within each. Every type is in
# exactly one. A ladder sits where its main idea is, not where its rules
# happen to be implemented: DUNGEON is a shape in the engine but a spell
# ladder to play, and HIVE is a topology that plays as a special rule.
#
#   normal   the original game's seven modes
#   shape    the board's outline or its edges are the point
#   magic    the spells are the point
#   special  everything else, mostly a placement rule
#
# Within a category the order is the order its gates open, so the menu reads
# the way a player meets it.
CATEGORIES = {
    "normal": ["easy", "normal", "huge", "extreme", "huge_extreme", "blind", "huge_blind"],
    "shape": ["wraparound", "wrapped_cross", "cross", "diamond", "donut", "cave", "pyramid"],
    "magic": ["arcane", "workout", "oracle", "dungeon"],
    "special": ["hive", "pairs", "dominoes", "packs", "checker", "congo", "sudoku"],
}
CATEGORY = {tid: cat for cat, ids in CATEGORIES.items() for tid in ids}
UNLOCK_BOARDS = unlock_boards()
POSTGAME = ["blind", "huge_blind"]


def carved_cells(shape, w, h, share=.40):
    """How many cells a seeded mask is asked for on a board of this size.

    Chosen rather than measured, which is the whole point -- see shape_cells.
    """
    return min(round(share * w * h), (w - 2) * (h - 2))


def carved_room(shape, w, h):
    """The most cells a seeded mask can hold on a board of this size."""
    return (w - 2) * (h - 2)


@dataclass(frozen=True)
class BoardDials:
    """One board's dials: entry n of each schedule for the tuned ten, or a row of the
    continuation. `boss`, `givens`, `cells` and `sets` exist only on the ladders that have them."""
    n: int
    size: tuple
    tiers: int
    lock: int
    alpha0: float
    hp: int
    density: float
    boss: int | None = None
    givens: int | None = None
    cells: int | None = None
    sets: int | None = None

    @classmethod
    def tuned(cls, t, i):
        """Board i + 1 of a type's tuned ladder."""
        at = lambda key: t[key][i] if t.get(key) else None
        return cls(n=i + 1, size=tuple(t["size"][i]), tiers=t["tiers"][i], lock=t["lock"][i],
                   alpha0=t["alpha0"][i], hp=t["hp"][i], density=t["density"][i],
                   boss=at("boss"), givens=at("givens"), cells=at("cells"), sets=at("sets"))

    @classmethod
    def continued(cls, row):
        """A continuation row from `extend`, numbered later, once it is known to be a new board."""
        return cls(n=0, **row)


def board_row(t, d):
    """One board's row. Shared by the tuned ten and the continuation, because a
    board past 10 is the same kind of object built from the same rules - only
    the schedule feeding it differs."""
    n, (W, H), T = d.n, d.size, d.tiers
    lock, alpha0, hp, density, boss, givens, sets = (
        d.lock, d.alpha0, d.hp, d.density, d.boss, d.givens, d.sets)
    shape = t.get("shape", "rect")
    shape_param = t.get("shape_param", 0)
    if shape in ("cave", "dungeon"):
        cells = d.cells
        # The generator keeps a one-cell margin all round and cannot carve
        # more than what is inside it. Caught here, where the schedule is
        # written, rather than on the board.
        room = carved_room(shape, W, H)
        if cells > room:
            raise ValueError(
                f"{t['id']}#{n}: {cells} cells asked of a {W}x{H} box "
                f"that holds {room} inside the margin")
    else:
        cells = shape_cells(shape, shape_param, W, H)

    if t.get("placement") == "sudoku":
        # The rule IS the distribution. Nine of each of the eight creature
        # tiers and nine empties, on every board, so C_k never moves and
        # density is not a dial here - the givens are.
        q = [9] * T
    elif t.get("placement") == "dominoes":
        # The same situation as Sudoku: the rule IS the distribution. A
        # double-T set carries every tier exactly T+1 times, so the quantity is
        # flat by construction and the schedule's density is not consulted at
        # all - it falls out of how big a board the set is laid on. `sets`
        # copies of the set scale the count without bending the curve.
        q = [(T + 1) * sets] * T
    else:
        M = round(density * cells)
        if t.get("placement") in ("packs", "congo"):
            # The rule IS the distribution, as for DOMINOES: every pack is one
            # of each tier, so n packs is n of every tier and the curve is flat
            # by construction. Unlike a domino set a pack is small, so density
            # still drives the count directly - rounded DOWN to whole packs,
            # the direction that can never push a board past its packing.
            q = [M // T] * T
            C = cumulative_exp(q)
            ea = exp_array(q, lock, alpha0)
            return dict(
                n=n, w=W, h=H, cells=cells, monsters=sum(q),
                density=round(100 * sum(q) / cells, 1),
                tiers=T, quantity=q, hp=hp, lock=lock, exp=ea, givens=givens,
                total_exp=C[-1], empty=cells - sum(q),
            )
        if t.get("placement") == "pairs":
            # Every creature has exactly one partner, so an odd total leaves
            # one of them with nobody. Rounded DOWN rather than up, because the
            # packing this rule needs has a ceiling and the schedule already
            # runs close to it -- a quota nudged upward is the one direction
            # that can make a board fail to generate.
            M -= M % 2
        if t["archetype"] == "flat":
            w = shape_flat(T if boss is None else T - 1)
        else:
            w = shape_descending(T, boss=1 if boss else 0)
        if t.get("placement") == "checker":
            # The colour rule decides where a tier may stand, so the balance it
            # promises has to be met here, in the quantities -- see
            # distribute_parity. Nothing else about the board changes: C_k is
            # still a sum over `q`, so the thresholds, the lock depth and the
            # zero-damage guarantee are derived exactly as they are everywhere.
            q = distribute_parity(M, w)
        else:
            q = distribute(M, w, boss_count=boss)
    C = cumulative_exp(q)
    search = t.get("search", False)
    ea = [] if search else exp_array(q, lock, alpha0)
    return dict(
        n=n, w=W, h=H, cells=cells, monsters=sum(q),
        density=round(100 * sum(q) / cells, 1),
        tiers=T, quantity=q, hp=hp,
        lock=lock, exp=ea,
        givens=givens,
        total_exp=C[-1] if C else 0,
        empty=cells - sum(q),
    )


def monotone(boards):
    """No board may be easier than the one below it on any threshold.

    Locked (C_k) thresholds are already monotone because monster counts only
    grow; this only ever lifts an alpha-scaled one, and never past its own C_k
    (which would silently turn it into a lock)."""
    for i in range(1, len(boards)):
        prev, cur = boards[i - 1]["exp"], boards[i]["exp"]
        C = cumulative_exp(boards[i]["quantity"])
        for k in range(min(len(prev), len(cur))):
            if cur[k] < prev[k]:
                cur[k] = min(prev[k], C[k])
        for k in range(1, len(cur)):
            if cur[k] <= cur[k - 1]:
                cur[k] = cur[k - 1] + 1
    return boards


def tuned_boards(t):
    """The ten boards of a type's ladder, made monotone."""
    return monotone([board_row(t, BoardDials.tuned(t, i)) for i in range(10)])


def continued_boards(t, boards):
    """Boards 11..N: the schedules continued past the tuned ten, built by the same `board_row`
    and made monotone against board 10, so the step off the end of the ladder is a step up like
    every other."""
    # Walk the whole schedule horizon, make it monotone, and only THEN
    # drop the repeats. The order matters: two candidates can differ only
    # in an alpha-scaled threshold, and monotone() is what lifts the later
    # one up to the earlier and makes them the same board. Deduplicating
    # first would let that pair through.
    candidates = []
    floor_C = cumulative_exp(boards[-1]["quantity"])
    for row in extend(t):
        cand = board_row(t, BoardDials.continued(row))
        # A board that offers LESS exp than the one before it cannot be a
        # step up, and its thresholds could not be lifted to match even if
        # we wanted them to - there would not be the EXP on the board to
        # meet them. See the module note: a wider CROSS can be a smaller
        # one, because its arm width depends on the parity of the box.
        # Only the battle ladders. A search type has no level economy at
        # all - no thresholds, no gates - so C_k says nothing about its
        # difficulty, and BLIND's own tuned ten already step C_1 backwards
        # when the tier count rises and the distribution spreads wider.
        C = cumulative_exp(cand["quantity"])
        if not t.get("search", False):
            if any(C[k] < floor_C[k] for k in range(min(len(C), len(floor_C)))):
                continue
            floor_C = C
        candidates.append(cand)
    monotone([boards[-1]] + candidates)

    # A step that yields the board we already have is skipped, not treated
    # as the end: the schedules move at very different rates and a slow one
    # takes two or three steps to earn a board.
    extended = []
    for nxt in candidates:
        prev = extended[-1] if extended else boards[-1]
        if {k: v for k, v in nxt.items() if k != "n"} == \
           {k: v for k, v in prev.items() if k != "n"}:
            continue
        nxt["n"] = 11 + len(extended)
        extended.append(nxt)
        if len(extended) >= CEILINGS["max_extended"]:
            break
    return extended


def ladder_record(t, boards, extended):
    """A type as ladders.json carries it: its identity, rules, unlock gates and boards."""
    return dict(
        id=t["id"], name=t["name"], tint=t["tint"], axis=t["axis"],
        blurb=t["blurb"], archetype=t["archetype"],
        category=CATEGORY[t["id"]],
        search=t.get("search", False),
        postgame=t["id"] in POSTGAME,
        placement=t.get("placement", "uniform"),
        # Absent means the placement rule's own; see readOpening in config.ts.
        **({"opening": t["opening"]} if t.get("opening") else {}),
        spells=t.get("spells", []),
        start_mana=t.get("start_mana", 0),
        **({"workout": t["workout"]} if t.get("workout") else {}),
        **({"sweep": False} if t.get("sweep") is False else {}),
        topology=t.get("topology", "square"),
        shape=t.get("shape", "rect"),
        shape_param=t.get("shape_param", 0),
        # 0 means the whole board is in reach, which is every type but one.
        reach=t.get("reach", 0),
        wrap=t.get("wrap", "none"),
        # Full Run: one HP pool for the whole 10-board run, taken from
        # board 1. The per-board HP schedule is ignored in that mode, and
        # board 1 is the most generous entry in every schedule, so the
        # ceiling never drops below what a later board was tuned against.
        run_hp=t["hp"][0],
        requires=UNLOCKS.get(t["id"], []),
        # Boards cleared anywhere, counting each once. 0 means no such gate.
        requires_boards=UNLOCK_BOARDS.get(t["id"], 0),
        boards=boards,
        # Boards 11..N. Unlocked by clearing board 10, and deliberately
        # NOT part of `boards`: the ladder is ten, a Full Run is ten, and
        # clearing the type is still board 10.
        extended=extended,
    )


def build():
    out = []
    for t in TYPES:
        boards = tuned_boards(t)
        out.append(ladder_record(t, boards, continued_boards(t, boards)))
    order = {k: i for i, k in enumerate(sum(CATEGORIES.values(), []))}
    out.sort(key=lambda t: order[t["id"]])
    return out


if __name__ == "__main__":
    data = build()
    with open(DATA / "ladders.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, indent=1)
    for t in data:
        last = t["extended"][-1]["n"] if t["extended"] else 10
        print(f"\n=== {t['name']}  ({t['axis']})  "
              f"ladder 1-10, scaling 11-{last} ===")
        for b in t["boards"] + t["extended"]:
            q = ",".join(str(x) for x in b["quantity"])
            e = ",".join(str(x) for x in b["exp"]) if b["exp"] else "-"
            print(f" {b['n']:2d}  {b['w']:2d}x{b['h']:2d} {b['cells']:5d}c  "
                  f"M{b['monsters']:4d} {b['density']:5.1f}%  T{b['tiers']}  "
                  f"HP{b['hp']:2d} L{b['lock']}  q[{q}]  exp[{e}]")
    print("\n--- damage table, damage = E*(ceil(E/L)-1) ---")
    print("  L\\E " + "".join(f"{e:5d}" for e in range(1, 10)))
    for L in range(1, 10):
        print(f"  {L:2d}  " + "".join(f"{damage(L,e):5d}" for e in range(1, 10)))
