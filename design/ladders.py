"""Creature Sweeper — progression ladder generator.

Derives the 10-board ladder for each game type from a small per-type schedule,
using the tuning identity found in mamono sweeper's own data:

    C_k = total EXP from every monster of tier <= k
    the top `lock` thresholds are exactly C_k (full-tier-clear gates)
    the rest are alpha_k * C_k, alpha ramping from alpha0 up to 0.70
"""
import json, math

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
    return True


def shape_cells(shape, param, w, h):
    if shape == "rect":
        return w * h
    if shape in ("cave", "dungeon"):
        # These two invert the relationship every other shape has with this file.
        # A ragged cave has no closed form to count, and its silhouette moves
        # with the seed, which is exactly why it sat deferred: C_k needs the
        # cell count fixed before the board exists. So the count is not
        # measured here, it is *chosen* here -- per board, in the `cells`
        # schedule -- and the engine's generator is required to hit it on
        # every seed. Same guard as the other shapes, pointing the other way.
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
# Each entry is a 10-long list: one value per board.

TYPES = [
    dict(
        id="easy", name="EASY", tint="#b3ab1e", archetype="descending",
        axis="Gentle boards to learn on",
        blurb="Start here. Sparse boards that grow a little each time, so you can learn how the "
              "numbers add up before anything gets crowded.",
        size=[(16,16),(18,16),(20,16),(22,16),(24,16),(24,18),(26,18),(28,18),(28,20),(30,20)],
        tiers=[5]*10,
        density=[.117,.126,.134,.143,.151,.160,.169,.177,.186,.195],
        hp=[10]*10,
        lock=[2]*10,
        alpha0=[.70,.68,.66,.64,.62,.60,.58,.56,.54,.52],
        boss=None,
        # No Sweep here. EASY is where the sum rule is learned, and a button
        # that reads the numbers for you takes away the one thing it is for.
        sweep=False,
    ),
    dict(
        id="normal", name="NORMAL", tint="#8a5a12", archetype="descending",
        axis="The classic game",
        blurb="The classic game: five tiers on a 30x16 board. Creatures pack in tighter for five "
              "boards, then the board itself starts to grow.",
        size=[(30,16)]*5+[(32,17),(34,18),(36,19),(38,20),(40,20)],
        tiers=[5]*10,
        density=[.206,.213,.220,.227,.234,.241,.248,.256,.263,.270],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
    ),
    dict(
        id="extreme", name="EXTREME", tint="#3b28d6", archetype="flat",
        axis="Strong creatures everywhere",
        blurb="Strong creatures are as common as weak ones, so no number is safe to assume. Boards "
              "pack tighter and HP falls from 10 to 8.",
        size=[(30,16)]*4+[(32,18)]*3+[(34,20)]*3,
        tiers=[5]*10,
        density=[.260,.269,.278,.287,.296,.304,.313,.322,.331,.340],
        hp=[10,10,10,10,9,9,9,8,8,8],
        lock=[2,2,2,2,3,3,3,3,4,4],
        alpha0=[.400,.389,.378,.367,.356,.344,.333,.322,.311,.300],
        boss=None,
    ),
    dict(
        id="arcane", name="ARCANE", tint="#2aa39a", archetype="descending",
        axis="Magic: Reveal and Census",
        blurb="Magic arrives. Earn mana by exploring and fighting, then spend it on Reveal and Census "
              "when deduction runs out. Boards run denser to match.",
        size=[(30,16)]*3+[(32,17)]*2+[(34,18)]*2+[(36,19)]*2+[(38,20)],
        tiers=[5]*10,
        density=[.265,.274,.283,.292,.301,.310,.319,.328,.337,.345],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.320,.311,.302,.293,.284,.276,.267,.258,.249,.240],
        boss=None,
        spells=["reveal", "census"],
        start_mana=75,
    ),
    dict(
        id="oracle", name="ORACLE", tint="#7e5bd6", archetype="flat",
        axis="Every spell, little HP",
        blurb="Six tiers, all equally common, and only 8 HP falling to 6. Every spell is on offer - "
              "Census, Reveal, Exercise and Beacon - and you will need them.",
        size=[(32,18)]*3+[(34,19)]*2+[(36,20)]*2+[(38,21)]*2+[(40,22)],
        tiers=[6]*10,
        density=[.258,.266,.274,.282,.290,.298,.306,.314,.322,.330],
        hp=[8,8,8,8,7,7,7,7,6,6],
        lock=[3,3,3,4,4,4,5,5,5,5],
        alpha0=[.180,.174,.168,.162,.156,.150,.144,.138,.132,.126],
        boss=None,
        spells=["reveal", "census", "exercise", "beacon"],
        start_mana=75,
    ),
    dict(
        id="checker", name="CHECKERBOARD", tint="#4f5d75", archetype="descending",
        axis="Tiers split by square colour",
        # Six tiers rather than five, and that is the one structural choice
        # here. The parity split has to be even for the balance promise to
        # leave the distribution alone: at five tiers three of them are odd and
        # two are even, so the even pair would carry half the board between
        # them and the curve would buckle. At six it is three against three and
        # the archetype's own shape survives nearly intact.
        blurb="Even tiers stand only on light squares, odd tiers only on dark; empty ground can be "
              "anywhere. Light neighbours always add up to an even number, so whether a number is odd "
              "or even is decided by its dark neighbours alone.",
        placement="checker",
        # Even cell counts throughout, or one colour gets a square more than
        # the other. Every width here is even, which is enough on its own.
        size=[(30,16)]*3+[(32,17)]*2+[(34,18)]*2+[(36,19)]*2+[(38,20)],
        tiers=[6]*10,
        # Measured, not inherited, and the one number here that had to be.
        # The colour rule is a large, constant, free read -- so at NORMAL's own
        # schedule (25.0-33.0%) the honest player from `sim:spells` was cornered
        # 0.0 times on board 1 and 0.6 on board 10 and cleared every board of
        # the ladder, which is a ladder with nothing in it. Walking the density
        # up until the curve matched HIVE's, the other variant that compensates
        # for an easier board by packing it, lands here: 0.3 forced guesses
        # rising to 2.9, against HIVE's 0.3 to 2.8 and CROSS's 0.3 to 2.4.
        #
        # It runs past the 34% the rest of the game treats as the point a board
        # stops being a puzzle, and that ceiling is the reason this is the only
        # dial that moved. 34% was measured on boards where a covered cell
        # could be ANY tier; here its colour has already ruled out half of them,
        # so the same density carries about half the ambiguity. HIVE (35%) and
        # ARCANE (34.5%) already sit past it for smaller versions of the same
        # reason.
        #
        # One difference from HIVE is worth keeping: the clear rate falls much
        # more slowly -- 92% of board 10 against HIVE's 80% -- because a guess
        # on this board is a guess whose parity you already know, so it is
        # cheaper. More guesses, each worth less. That is DUNGEON's doorway
        # finding again, arrived at from a completely different direction.
        density=[.275,.287,.299,.312,.324,.336,.348,.361,.373,.385],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
    ),
    dict(
        id="pairs", name="PAIRS", tint="#b5482a", archetype="descending",
        axis="Creatures come in pairs",
        blurb="Every creature touches exactly one other creature, and no two pairs touch. A beaten "
              "creature's number is its partner's tier, and once both halves are found the ground "
              "around them is safe. Boards grow rather than crowd.",
        placement="pairs",
        # SIZE IS THE AXIS, and it is the only ladder here where that was
        # forced rather than chosen. Every other variant compensates for an
        # easier board by packing it; this one cannot, because its own rule
        # caps how tightly it can be packed. See the density note below. What
        # is left is area: deduction on this board is local, so a bigger board
        # is more places to be cornered, and the honest player's forced guesses
        # track cells almost linearly where they barely moved with density.
        size=[(30,16),(32,17),(33,18),(35,19),(36,20),(38,21),(40,22),(41,23),(43,23),(44,24)],
        tiers=[5]*10,
        # Bounded at BOTH ends, which is new here, and the ceiling is the
        # binding one.
        #
        # THE CEILING IS STRUCTURAL. Dominoes that may not touch cannot exceed
        # two cells in every six (33.3%), and a random lay-down jams far below
        # that -- 24.8-25.6% over 200 seeds across these board sizes. The quota
        # has to be landed EXACTLY, because C_k assumed it, so the schedule
        # stops where placement is still reliable rather than where the board
        # stops being a puzzle. At 26% it places on every seed within 40
        # restarts; at 28% on one seed in four.
        #
        # THE FLOOR WAS A MEASUREMENT AND IT WENT THE OPPOSITE WAY TO THE
        # GUESS. The rule was expected to give the board away -- sparse,
        # clustered, big voids. It does the reverse: the exclusion ring around
        # every pair spreads the creatures EVENLY, and clustering is what makes
        # a zero-region, so the auto-opening comes out 30-65% SMALLER than a
        # uniform board of the same density (6.9% against 10.0% at 20.6%), and
        # cells hiding nothing at all drop from 18.8% to 10.7%.
        #
        # So the range left is four points, and inside it density does almost
        # nothing: measured with the honest player from `sim:spells`, walking
        # 20% to 25% on a FIXED board moved the forced guesses from 0.0 to 1.5
        # and left the first six boards at 0.0 -- a ladder with nothing in it,
        # the same failure ARCANE had before it was retuned. Growing the board
        # across the same span gives 0.2 rising to 2.1, which is the curve
        # wanted. Density is still scheduled because it is free to move and
        # every point helps; it is simply not what carries this ladder.
        density=[.212,.219,.225,.230,.234,.238,.242,.245,.248,.250],
        # HP IS NOT A DIAL HERE, and that is worth stating because it looks
        # like the obvious one. This mode's characteristic gamble is "exactly
        # one of these k cells holds a tier T, the rest are empty" with T read
        # straight off a dead creature's number -- so a wrong guess is one
        # known, lethal blow rather than an accumulation. Measured: the whole
        # ladder at HP 12 and at HP 14 clears the same share of every board as
        # at HP 10, to the point. It keeps NORMAL's 10.
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        # The continuation cannot climb density the way every other variant
        # does -- the packing ceiling binds, not the point a board stops being
        # a puzzle -- so it is pinned at the tuned ladder's last step and the
        # schedule grows the board instead, which is the axis anyway.
        ceiling=dict(density_cap=.250),
    ),
    dict(
        id="dominoes", name="DOMINOES", tint="#d8cfb6", archetype="flat",
        axis="A double-six domino set",
        blurb="PAIRS dealt as a double-six domino set: every pairing of tiers 1-6 appears once per "
              "set, so every tier is equally common. Later boards deal more sets, packed tighter.",
        placement="dominoes",
        # SIX TIERS ON EVERY BOARD - a double-six set, the classic one - so the
        # tier count is not a dial here at all. That leaves exactly two: how
        # many copies of the set, and how tightly the board packs them.
        #
        # Density is the one that matters, and it matters more on this board
        # than on any other measured so far. With the honest player from
        # `sim:spells`, four sets at the top cleared board 10 88% of the time
        # at 22.5% density and 45% at 25% - a steeper cliff than any ladder in
        # the game, because a flat six-tier set makes every forced guess as
        # likely to land on a tier 6 as a tier 1. The set COUNT barely moved
        # it: topping out at three, four or five sets all collapsed at 25%.
        # So the band runs 18.5% to 23.5%, well under the packing ceiling, and
        # the ceiling is left to the scaling boards.
        #
        # Measured over 60 seeds a board: 0.1 forced guesses rising to 2.2,
        # 98% cleared falling to 70%. Harder than PAIRS's 83%, which is right
        # for the ladder you reach by clearing PAIRS.
        tiers=[6]*10,
        sets=[1,1,2,2,2,3,3,3,4,4],
        # Derived, not hand-picked: each is the board nearest the target
        # density at a sane aspect. The creature count comes in whole sets, so
        # between one set count and the next the ONLY way to raise density is
        # a smaller board - boards 6 to 8 hold the same 126 creatures on 594
        # cells shrinking to 561. It is the one ladder in the game that gets
        # harder by getting smaller.
        size=[(19,12),(20,11),(27,16),(26,16),(27,15),(33,18),(32,18),(33,17),(35,21),(34,21)],
        # Not consulted by `board_row` for this type - the set decides the
        # quantity and the board decides the density. The continuation reads
        # it, though: each scaling board adds a set and carries this schedule
        # on toward the packing ceiling, which is where the opt-in boards live.
        density=[0.185,0.1906,0.1961,0.2017,0.2072,0.2128,0.2183,0.2239,0.2294,0.235],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        ceiling=dict(density_cap=.250),
    ),
    dict(
        id="workout", name="WORKOUT", tint="#0b7285", archetype="descending",
        axis="Exercise, over and over",
        blurb="NORMAL's boards with deeper level gates and one spell: Exercise, which fights your next "
              "battle a level higher and pays double EXP if you win. It starts at 30 mana and costs 10 "
              "more each cast; every level-up takes 10 back off.",
        # NORMAL's sizes, so the only things that differ are the ones this
        # ladder is about.
        size=[(30,16)]*5+[(32,17),(34,18),(36,19),(38,20),(40,20)],
        tiers=[5]*10,
        # Measured with the honest player from `sim:spells`, 40 seeds a board.
        # At NORMAL's own density the deeper lock barely registered on boards
        # 1-5 and the player cast Exercise once or twice a board, spending a
        # tenth of its mana - nothing for the spell to do. Two points denser,
        # with the full lock from board 4, gives 0.1 forced guesses rising to
        # 5.7 spell-less, and clears 100% falling to 85% casting Exercise at
        # each forced guess - mean 96.6% over the ten against NORMAL's 98.8%
        # (spell-less, same player). "A little harder than NORMAL" was the
        # brief, and that is what this is.
        #
        # What the measurement said about the double EXP, which is worth
        # knowing before tuning on it: very little. A player who also farms it
        # - takes every named creature at or one past its level on a charge
        # whenever the price is back at 30 - casts about five times a board
        # rather than two and clears the same share. The cheap casts are rationed
        # by level-ups, and a five-tier board has four of them. The spell earns
        # its clear rate by making forced guesses survivable, as it does on
        # ORACLE and DUNGEON; the EXP is what makes casting it feel good.
        density=[.226,.233,.240,.247,.254,.261,.268,.276,.283,.290],
        hp=[10]*10,
        # Deeper than NORMAL's 2-3, and this is the dial the mode is built on.
        # A locked gate is "kill every creature at or below this tier", so it
        # holds your level down, and a level held down is what makes the fight
        # one tier up come round often - the exact fight Exercise makes free.
        # Double EXP is the way over the wall: a kill made on a borrowed level
        # pays twice, so a gate can be reached before its tier is cleared.
        # 4 is the most a five-tier board has: every threshold a C_k gate.
        lock=[3,3,3,4,4,4,4,4,4,4],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        spells=["exercise"],
        # One Exercise exactly, the same reasoning as 75 being one Reveal.
        start_mana=30,
        # Exercise here costs `base`, `step` more each cast, and `relief` less
        # for each level gained, never below `base`. A kill made on a borrowed
        # level pays `exp_multiplier` times its EXP. All of it resets with the
        # board, as mana does.
        workout=dict(base=30, step=10, relief=10, exp_multiplier=2),
    ),
    dict(
        id="packs", name="PACKS", tint="#58687c", archetype="flat",
        axis="Packs of one of every tier",
        blurb="Creatures travel in packs of six - one of every tier, all touching - and no two packs "
              "touch. Whatever a pack has not shown yet is all that can hide beside it; a complete "
              "pack is ringed by empty ground.",
        placement="packs",
        # DENSITY IS THE AXIS, and the board grows a little every step as well
        # -- not for difficulty but for granularity. Creatures come in packs of
        # six, so on a 480-cell board one pack is 1.25 density points, and a
        # schedule held on one size rounded neighbouring boards to the SAME
        # board. Growing a column or a row each step gives every board its own
        # pack count.
        #
        # Measured with the honest player from `sim:spells`, taught the pack
        # rule, 120 seeds a board: 0.2 forced guesses rising to 5.2, 99%
        # cleared falling to 70% -- DOMINOES's 70% at the top, the other ladder
        # you reach by clearing PAIRS.
        #
        # Two things about how it got here. First guess was NORMAL-plus-a-bit
        # (26-34%), because packs leave so much ground open; it cleared 35% of
        # board 10 at 7.2 forced guesses. The flat curve is what that missed: a
        # tier 6 is as common as a tier 1, so an open board is still an
        # expensive one to guess on. Second, the guess count here runs well
        # ahead of the clear rate -- 5.2 guesses against DOMINOES's 2.2 at the
        # same 70% -- which is the CHECKERBOARD and DUNGEON signature again: a
        # guess beside a pack is capped by the tiers that pack has not shown,
        # so it is a cheaper guess. More guesses, each worth less.
        size=[(30,16),(30,16),(31,16),(31,17),(32,17),(33,17),(33,18),(34,18),(35,19),(36,19)],
        tiers=[6]*10,
        density=[.230,.240,.250,.260,.270,.280,.290,.300,.310,.320],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
    ),
    dict(
        id="congo", name="CONGO LINE", tint="#c2410c", archetype="flat",
        axis="Lines of one of every tier",
        blurb="Creatures dance in lines of six - one of every tier, stepping up, down, left or right, "
              "never bunched into a 2x2 - and the tier 6 always leads. No two lines touch. A line can "
              "only carry on from its ends, so the ground around a half-found line is mostly empty.",
        placement="congo",
        # PACKS with a shape and an order imposed, so it starts from PACKS's
        # schedule and is measured from there. See the tuning note below.
        size=[(30,16),(30,16),(31,16),(31,17),(32,17),(33,17),(33,18),(34,18),(35,19),(36,19)],
        tiers=[6]*10,
        density=[.230,.240,.250,.260,.270,.280,.290,.300,.310,.320],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        # Just under the 34% the lines can be laid down at, because the
        # continuation rounds creatures to whole lines and 34% of 740 cells
        # rounds to 34.1%.
        ceiling=dict(density_cap=.335),
    ),
    dict(
        id="hive", name="HIVE", tint="#a8324f", archetype="descending",
        axis="Hexagonal cells",
        blurb="Hexagons: six neighbours instead of eight. Numbers run lower and blank areas open "
              "wider, so the boards are packed denser to make up for it.",
        size=[(30,16)]*3+[(32,17)]*2+[(34,18)]*2+[(36,19)]*2+[(40,20)],
        tiers=[5]*10,
        density=[.260,.270,.280,.290,.300,.310,.320,.330,.340,.350],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        topology="hex",
    ),
    dict(
        id="wraparound", name="WRAPAROUND", tint="#1d6a9e", archetype="descending",
        axis="No edges, no corners",
        blurb="NORMAL's boards with every edge joined - off the right is the left, off the top is the "
              "bottom. There are no edges or corners to work in from.",
        size=[(30,16)]*5+[(32,17),(34,18),(36,19),(38,20),(40,20)],
        tiers=[5]*10,
        density=[.206,.213,.220,.227,.234,.241,.248,.256,.263,.270],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        wrap="both",
    ),
    dict(
        id="donut", name="DONUT", tint="#b06a1d", archetype="descending",
        axis="A ring with a hole",
        blurb="A ring with a hole in the middle, so there are two rims to work in from. Reveal and "
              "Census available.",
        size=[(30,16)]*3+[(34,18)]*2+[(36,19)]*2+[(38,20)]*2+[(40,21)],
        tiers=[5]*10,
        density=[.230,.238,.246,.254,.262,.270,.278,.286,.294,.302],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        shape="donut", shape_param=5,
        spells=["reveal", "census"],
        start_mana=75,
    ),
    dict(
        id="cross", name="CROSS", tint="#4a8f3a", archetype="descending",
        axis="Four narrow arms",
        blurb="Four narrow arms around a hub. Each arm is nearly all edge and plays like its own "
              "small puzzle. Reveal and Census available.",
        size=[(26,22)]*3+[(28,24)]*2+[(30,26)]*2+[(32,28)]*2+[(34,30)],
        tiers=[5]*10,
        # Retuned for its spells: the schedule was derived for a spell-less
        # board, and magic is what ARCANE runs denser for. Measured with the
        # honest player, 60 seeds a board: the old schedule was cornered 13.1
        # times over the ladder and cleared 94%, against ARCANE's 24.0 and 82%.
        # 2.5 points up brings it to 21.8 and 89%, and board 10 to 5.0 stuck
        # and 63% cleared, against ARCANE's 5.1 and 63%. No single shift
        # matches both: CROSS's guesses are cheaper (an arm is nearly all rim),
        # so matching the clear rate would overshoot the guesses. Tops out at
        # 33.3%.
        density=[.260,.268,.276,.284,.292,.300,.308,.316,.324,.332],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        shape="cross", shape_param=8,
        spells=["reveal", "census"],
        start_mana=75,
    ),
    dict(
        id="wrapped_cross", name="WRAPPED CROSS", tint="#2f8f7e", archetype="descending",
        axis="A cross whose arms loop",
        # Joining the arm tips makes the board EASIER, which is the opposite of
        # what wrapping does to a rectangle and the only interesting thing
        # about this ladder. WRAPAROUND is harder than NORMAL because it
        # deletes the free rim a sweeper player braces against. A cross has
        # almost nothing but rim, so it loses very little of that -- and what
        # it gains is bigger: CROSS is four dead-end corridors sharing a hub,
        # and joining the tips turns them into two loops, so a player stuck at
        # one tip can work in from the other. Same argument as DUNGEON's
        # walls, pointed the other way: what sets the forced-guess count is
        # how many separate puzzles the board is cut into.
        #
        # Measured with the honest player from `sim:spells`, 25 seeds a board,
        # at CROSS's own schedule: 0.0-2.3 forced guesses a board against
        # CROSS's 0.3-2.4, and 92% of board 10 cleared against 80%. So the
        # schedule is CROSS's shifted up 1.2 density points, which puts it back
        # on CROSS's curve: 0.1-2.7 guesses and 84% cleared. It tops out at
        # 31.9%, still inside the 34% the rest of the game treats as the point
        # a board stops being a puzzle.
        #
        # CROSS then moved 2.5 points up for its spells, and this moved with
        # it, keeping the 1.2 between them. Re-measured at 60 seeds rather than
        # assumed: 21.7 stuck points over the ladder against CROSS's 21.8, so
        # it is still on CROSS's curve, clearing 84% against 89%. The price is
        # the opening boards, 1.3-1.9 stuck against CROSS's 0.9-1.2 -- joined
        # tips cost the most where the board is small. Tops out at 34.4%, past
        # 34 by as much as ARCANE's own 34.5.
        blurb="A cross with opposite arm tips joined, turning four dead ends into two loops - stuck "
              "at one end, work in from the other. Reveal and Census available.",
        size=[(26,22)]*3+[(28,24)]*2+[(30,26)]*2+[(32,28)]*2+[(34,30)],
        tiers=[5]*10,
        density=[.272,.280,.288,.296,.304,.312,.320,.328,.336,.344],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        shape="cross", shape_param=8,
        wrap="both",
        spells=["reveal", "census"],
        start_mana=75,
    ),
    dict(
        id="diamond", name="DIAMOND", tint="#8f3fa0", archetype="descending",
        axis="Stepped diamond edges",
        blurb="A diamond-shaped board. Its stepped edges give you more edge cells to read from than a "
              "straight rim. Reveal and Census available.",
        size=[(32,18)]*3+[(36,20)]*2+[(40,22)]*2+[(44,24)]*2+[(48,26)],
        tiers=[5]*10,
        # Retuned for its spells, the way CROSS was. The old schedule was the
        # gentlest shaped ladder by a distance -- cornered 10.9 times over the
        # ladder and clearing 95%, 60 seeds a board, against ARCANE's 24.0 and
        # 82% -- because the stepped rim is free information at every step.
        # 4 points up gives 20.1 and 84%, and the complete deducer agrees
        # (9.5 forced guesses and 92% against ARCANE's 10.7 and 93%). Tops out
        # at 33.7%.
        density=[.265,.273,.281,.289,.297,.305,.313,.321,.329,.337],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        shape="diamond",
        spells=["reveal", "census"],
        start_mana=75,
    ),
    dict(
        id="cave", name="RAGGED CAVE", tint="#8a7050", archetype="descending",
        axis="A new cave every seed",
        blurb="Tunnels and caverns, a different cave every seed. Almost every cell is near an edge, "
              "so it reads easily and is packed denser for it. Reveal and Census available.",
        size=[(38,19),(38,20),(40,20),(42,21),(42,22),(44,23),(44,24),(46,25),(48,25),(50,26)],
        # Chosen, not measured -- see shape_cells. Held at 40% of the bounding
        # box: the cave is grown inside a wobbling rim with caverns punched out
        # of it, and that is about what such a space can hold while still
        # leaving room for the caverns. Push it higher and the generator keeps
        # its promises but runs out of places to put a cavern, which costs the
        # board its character; lower and the cave stops spanning its box.
        cells=[290,305,320,355,370,405,420,460,480,525],
        tiers=[5]*10,
        density=[.245,.253,.261,.269,.277,.285,.293,.301,.309,.317],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        shape="cave",
        spells=["reveal", "census"],
        start_mana=75,
    ),
    dict(
        id="dungeon", name="DUNGEON", tint="#7a5c9e", archetype="descending",
        axis="Crawl room by room",
        blurb="Rooms joined by one-cell hallways, new every seed. You may only act within two steps "
              "of ground you have uncovered. Hallways and doorways are always empty; the creatures "
              "are all in the rooms. Reveal, Census and Exercise available.",
        size=[(36,20),(38,20),(38,22),(40,22),(42,22),(42,24),(44,24),(46,26),(48,26),(50,28)],
        # Chosen, not measured -- see shape_cells. About 40% of the bounding
        # box, the same share the cave holds: rooms need a wall between them
        # for the hallways to run down, so a dungeon cannot be packed much
        # tighter than a cave can.
        cells=[288,304,332,352,368,404,420,480,500,560],
        tiers=[5]*10,
        density=[.130,.145,.160,.175,.190,.205,.220,.235,.250,.265],
        hp=[10]*10,
        lock=[2,2,2,2,2,3,3,3,3,3],
        alpha0=[.300,.291,.282,.273,.264,.256,.247,.238,.229,.220],
        boss=None,
        # Measured, not chosen by feel. The cap came down with the schedule
        # when the crawl rule landed: having to gamble on what is in front of
        # you rather than on the cheapest square anywhere costs far more HP per
        # forced guess, so the density a deductive player can still get through
        # dropped by about a third. 18% is a little past board 10, which leaves
        # the continuation somewhere to go without walking it off the cliff.
        ceiling=dict(density_cap=.27),
        shape="dungeon",
        # The crawl rule: you may only act within two steps of ground you have
        # already uncovered, counted through adjacency so it stops at a wall
        # rather than reaching through one. It is what makes the map unfold
        # from where you are standing instead of being a plan you read at once,
        # and it is the reason the rooms being separate puzzles reads as
        # exploring rather than as being blocked.
        reach=2,
        spells=["reveal", "census", "exercise"],
        start_mana=75,
    ),
    dict(
        id="blind", name="BLIND", tint="#8a8a8a", archetype="descending",
        axis="No fighting, 1 HP",
        blurb="No fighting: 1 HP, and any creature ends the board. Win by uncovering every empty "
              "cell. Tiers rise from five to seven.",
        size=[(30,16)]*3+[(34,18)]*3+[(38,20)]*2+[(42,22)]*2,
        tiers=[5,5,5,5,5,6,6,7,7,7],
        density=[.206,.214,.222,.231,.239,.247,.255,.264,.272,.280],
        hp=[1]*10,
        lock=[0]*10,
        alpha0=[0]*10,
        boss=None,
        search=True,
    ),
    dict(
        id="huge", name="HUGE", tint="#1d7a2e", archetype="descending",
        axis="Nine tiers, huge boards",
        blurb="Nine tiers on a huge board, with 30 HP falling to 24. The top tier is only one to "
              "three creatures, and you reach max level just in time to face them.",
        size=[(50,25),(50,25),(52,26),(52,26),(54,27),(54,27),(56,28),(56,28),(60,30),(60,30)],
        tiers=[9]*10,
        density=[.208,.214,.220,.226,.232,.238,.243,.249,.255,.260],
        hp=[30,30,28,28,26,26,25,25,24,24],
        lock=[4,4,4,5,5,5,6,6,6,7],
        alpha0=[.19,.18,.18,.17,.16,.16,.15,.14,.13,.12],
        boss=[1,1,1,1,2,2,2,2,3,3],
    ),
    dict(
        id="huge_extreme", name="HUGE x EXTREME", tint="#4b2fd6", archetype="flat",
        axis="The hardest ladder",
        blurb="The hardest ladder: HUGE's nine tiers, EXTREME's flat spread, and 10 HP. By the end, "
              "every level-up past the first needs every creature below it cleared.",
        size=[(50,25),(50,25),(52,26),(52,26),(54,27),(54,27),(56,28),(56,28),(58,29),(58,29)],
        tiers=[9]*10,
        # Retuned so board 10 is winnable, which it was not: measured with the
        # complete deducer from `sim:forced`, a PERFECT player cleared 25% of
        # board 7 and none of boards 8-10 (20 seeds), because lock 7-8 of 9 on
        # boards this dense makes the last creature of a tier the one sitting
        # in a 50/50 over and over. Holding the maximum lock (8) and cutting
        # density could not fix it short of board 1's density. Lock stops at 7
        # and density steps back at board 7 to pay for that lock step, landing
        # boards 7-10 at 65 / 55 / 65 / 60% for a perfect player and board 10 at
        # 10% for the honest one — the hardest board in the game, but one a
        # strong player can win.
        density=[.259,.266,.273,.281,.284,.286,.278,.279,.280,.281],
        hp=[10,10,10,9,9,9,9,8,8,8],
        lock=[5,5,5,6,6,6,7,7,7,7],
        alpha0=[.083,.080,.077,.074,.070,.066,.062,.058,.054,.050],
        boss=None,
    ),
    dict(
        id="huge_blind", name="HUGE x BLIND", tint="#6e6e6e", archetype="descending",
        axis="The marathon",
        blurb="BLIND on the largest boards in the game: nine tiers, 1 HP, no fighting. A test of "
              "endurance.",
        size=[(50,25),(50,25),(54,27),(54,27),(56,28),(56,28),(60,30),(60,30),(64,32),(64,32)],
        tiers=[9]*10,
        density=[.208,.215,.222,.229,.236,.243,.250,.257,.264,.270],
        hp=[1]*10,
        lock=[0]*10,
        alpha0=[0]*10,
        boss=[1,1,1,1,2,2,2,2,3,3],
        search=True,
    ),
    dict(
        id="sudoku", name="SUDOKU", tint="#b45cc9", archetype="flat",
        axis="Tiers follow Sudoku rules",
        blurb="A 9x9 board where tiers 0-8 follow Sudoku's rules: each appears once per row, column "
              "and 3x3 box. The nine empty cells start open, some tiers are given in gold, and every "
              "board can be solved without guessing.",
        placement="sudoku",
        size=[(9, 9)] * 10,
        tiers=[8] * 10,
        # Fixed by the rule: nine of each of the eight creature tiers, nine empties.
        density=[72 / 81] * 10,
        # Measured: generation cost per board is flat to about 18 givens, 15x at
        # 16, 45x at 14, and there is no guess-free board at all below about 11.
        # The schedule stops at 15 because the cost curve turns over there, not
        # because the boards stop being interesting.
        givens=[26, 24, 22, 21, 20, 19, 18, 17, 16, 15],
        hp=[20, 20, 19, 19, 18, 18, 17, 16, 15, 14],
        # The continuation stops where generation does. Timed: 14 givens costs
        # 6ms a board, 13 costs 20ms, 12 costs ~100ms, and at 11 the generator
        # refuses six boards in eight. So 12 is the floor, which gives SUDOKU
        # one of the shortest continuations - correctly, because the rule took
        # its other dials away.
        ceiling=dict(givens_floor=12),
        lock=[3, 3, 4, 4, 5, 5, 6, 6, 7, 7],
        alpha0=[.55, .53, .51, .49, .47, .45, .43, .41, .39, .37],
        boss=None,
    ),
]

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


def extend(t):
    """Boards 11..N for one type, as rows in the same shape the schedule uses."""
    search = t.get("search", False)
    sudoku = t.get("placement") == "sudoku"
    over = t.get("ceiling", {})
    max_w = over.get("max_w", CEILINGS["max_w"])
    max_h = over.get("max_h", CEILINGS["max_h"])
    # "HP at its floor" means the floor the tuned ladder already chose. EXTREME
    # bottoms out at 8 and ORACLE at 6 deliberately; continuing the erosion
    # past that invents a difficulty those ladders never claimed - it took
    # EXTREME to HP 2 before this was pinned.
    hp_floor = over.get("hp_floor", min(t["hp"]))
    # Sudoku's density is fixed by its own rule at 72/81, so the battle cap
    # would clamp it to a third of the board and destroy the mode. Density is
    # not one of its dials at all - the givens are.
    #
    # And a cap is never allowed below where the tuned ladder already finished.
    # HIVE ends at 35% and ARCANE at 34.5%, both past the 34% ceiling; clamping
    # to it made board 11 SPARSER than board 10, which is not a gentler board,
    # it is a board with too few creatures left to meet its own thresholds.
    #
    # A type may also cap itself below the global ceiling, and DUNGEON does.
    # Its walls are what make it hard rather than its creatures, so the density
    # a deductive player can still get through is roughly half what an open
    # board tolerates; carrying it on to 34% would continue the schedule into
    # boards nobody can finish.
    d_cap = 1.0 if sudoku else max(
        t["density"][-1],
        over.get("density_cap",
                 CEILINGS["density_search"] if search else CEILINGS["density_battle"]))

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
        row = dict(
            size=(w_next,
                  min(max_h, round(hs[-1] + dh * i))),
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
            # A domino board's creatures come in whole sets, so the step past
            # board 10 is one more set, and the board is sized to hold it at
            # the density cap rather than extrapolated from the size schedule.
            # Extrapolating is what every other ladder does and it is wrong
            # here: the schedule's own growth would lay seven sets on a board
            # sized for about six and run past the packing ceiling, which
            # config.ts refuses outright. Once a set no longer fits the largest
            # board there is simply no further step, and the loop ends there.
            s_next = t["sets"][-1] + i
            creatures = T * (T + 1) * s_next
            # Keep the ladder's own landscape shape. Pinning the height at the
            # ceiling and deriving the width was the first version, and it made
            # the first scaling board 21x32 - a portrait board after ten
            # landscape ones. Only once the natural shape stops fitting does
            # the height go to the ceiling to buy width.
            cells = creatures / row["density"]
            h = min(max_h, max(1, round(math.sqrt(cells / 1.75))))
            w = math.ceil(creatures / (row["density"] * h))
            if w > max_w:
                h = max_h
                w = math.ceil(creatures / (row["density"] * h))
                if w > max_w:
                    break
            row["size"] = (w, h)
            row["sets"] = s_next
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
# A TYPE gate ("clear NORMAL") is a statement about readiness: this ladder
# teaches something the next one assumes. HUGE x EXTREME needs both of its
# parents because it is literally both of them at once, and HUGE x BLIND needs
# HUGE and BLIND for the same reason - a combined type should not be reachable
# without having played the things it combines.
#
# A BOARD-COUNT gate ("clear 25 boards, anywhere") is a statement about time
# served. The variant ladders do not teach each other - a hex grid teaches you
# nothing about a torus, and neither teaches you Sudoku - so chaining them was
# always a fiction, and it forced a player who wanted the ragged cave to grind
# three shapes they had no interest in first. Counting boards instead lets them
# arrive from whatever direction they like, and spaces the variants out across
# the whole game rather than bunching them behind one branch.
UNLOCKS = {
    "easy": [],
    "normal": ["easy"],
    # HUGE and EXTREME are now siblings off NORMAL rather than a chain, so the
    # player picks which wall to walk into first.
    "huge": ["normal"],
    "extreme": ["normal"],
    # Both parents: this ladder is the two of them at once.
    "huge_extreme": ["huge", "extreme"],
    # Magic hangs off NORMAL as its own branch rather than being spliced into
    # the main line, so the tuned ladders stay exactly as they were measured.
    "arcane": ["normal"],
    "oracle": ["arcane"],
    "checker": [],
    "pairs": [],
    # Both used to need PAIRS cleared. They are on the board-count schedule now,
    # by request, and still open after PAIRS because their counts are higher.
    "dominoes": [],
    "packs": [],
    "workout": [],
    "congo": [],
    "hive": [],
    "wraparound": [],
    "diamond": [],
    "donut": [],
    "cross": [],
    # Same argument as HUGE x EXTREME: a ladder that is two ladders at once
    # should not be reachable without having played the things it combines.
    # It also keeps the board-count schedule untouched, which is the one thing
    # in this file that can deadlock a save if it is crowded.
    "wrapped_cross": ["cross", "wraparound"],
    "cave": [],
    "dungeon": [],
    "sudoku": [],
    "blind": [],
    # Same argument as HUGE x EXTREME.
    "huge_blind": ["huge", "blind"],
}

# Boards cleared anywhere in the game, counting each board once. 0 means the
# type has no board-count gate at all.
#
# The schedule runs 15 to 80 in steps of exactly five, by request, so a new
# counted ladder is a new slot at the end rather than a gap shared. It starts at
# 15 so the first variant arrives after EASY and half of NORMAL, not on EASY
# alone.
#
# The types that gate on type-clears alone offer 70 ladder boards between them
# (EASY, NORMAL, HUGE, EXTREME, HUGE x EXTREME, ARCANE, ORACLE), so the top of
# the schedule - CAVE at 70 is the last reachable that way - now asks a player
# who never touches a variant to play one. Every earlier variant is ten more
# tuned boards, so the gates are still met without a single scaling board;
# `test/unlocks.test.ts` walks the schedule in order to check exactly that.
# Scaling boards past 10 count too, for a player who would rather go deep.
#
# THE ORDER IS A DESIGN CHOICE, not the measured difficulty ranking it used to
# follow. It is set by hand to pace what the player meets. For reference, the
# honest player from `sim:spells`, spell-less, 30 seeds a board, mean clear rate
# over the tuned ten, ranks them:
#
#   WRAPAROUND 99.0   DUNGEON 97.7   CHECKERBOARD 97.4   DIAMOND 95.5
#   CROSS 94.0        CONGO LINE 92.8 HIVE 92.7          PAIRS 92.1
#   RAGGED CAVE 89.0  DONUT 84.9
#
# Spell-less on purpose, so every ladder is measured by the same player; the
# shaped ladders carry spells in play, which only makes them gentler than this.
# HIVE and PAIRS are within the noise of each other. SUDOKU cannot be measured
# on the same scale -- it is guess-free by construction -- so it keeps the top
# slot. BLIND is not on this schedule at all; see UNLOCK_RUNS.
# The biggest departure from that ranking is DUNGEON, the second easiest, now
# last before SUDOKU. DUNGEON is also where most players met spells and the crawl rule, so
# arriving late means ARCANE has usually been played first.
UNLOCK_BOARDS = {
    "wraparound": 15,
    "cross": 20,
    "hive": 25,
    "diamond": 30,
    "pairs": 35,
    "dominoes": 40,
    "workout": 45,
    "packs": 50,
    "donut": 55,
    "checker": 60,
    "congo": 65,
    "cave": 70,
    "dungeon": 75,
    "sudoku": 80,
}

# Full Runs completed, on that many DIFFERENT types. 0 means no such gate.
#
# A third kind of gate, and it says something neither of the others can: not
# "you are ready" or "you have played a lot", but "you have finished something
# without being allowed to start again". BLIND is 1 HP and any creature ends the
# board, which is exactly the discipline a Full Run - one HP pool carried across
# ten boards - is practice for. Distinct types, so it cannot be met by running
# EASY three times.
#
# It cannot strand a save: a Full Run opens on clearing a type's board 10, and
# EASY, NORMAL and HUGE are all reachable on type-clears alone.
UNLOCK_RUNS = {
    "blind": 3,
}

# Menu order. HUGE now sits before EXTREME, and the variant ladders are ordered
# by the board count that opens them, so the menu reads in the order a player
# will actually meet it.
MAINLINE = ["easy", "normal", "huge", "extreme", "huge_extreme"]
MAGIC = ["arcane", "oracle"]
# The variant lane, in the order its gates open (see UNLOCK_BOARDS). A
# combined type sits right after the last of its parents to open. The list is menu order, not a taxonomy -- a placement rule sits here
# beside the topologies and the shapes because that is where a player meets it.
TOPOLOGY = ["wraparound", "cross", "wrapped_cross", "hive", "diamond", "pairs", "dominoes",
            "workout", "packs", "donut", "checker", "congo", "cave", "dungeon"]
PUZZLE = ["sudoku"]
POSTGAME = ["blind", "huge_blind"]


def carved_cells(shape, w, h, share=.40):
    """How many cells a seeded mask is asked for on a board of this size.

    Chosen rather than measured, which is the whole point -- see shape_cells.
    """
    return min(round(share * w * h), (w - 2) * (h - 2))


def carved_room(shape, w, h):
    """The most cells a seeded mask can hold on a board of this size."""
    return (w - 2) * (h - 2)


def board_row(t, n, W, H, T, lock, alpha0, hp, density, boss, givens, cells_override,
              sets=None):
    """One board's row. Shared by the tuned ten and the continuation, because a
    board past 10 is the same kind of object built from the same rules - only
    the schedule feeding it differs."""
    shape = t.get("shape", "rect")
    shape_param = t.get("shape_param", 0)
    if shape in ("cave", "dungeon"):
        cells = cells_override
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


def build():
    out = []
    for t in TYPES:
        boards = []
        for n in range(10):
            W, H = t["size"][n]
            T = t["tiers"][n]
            shape = t.get("shape", "rect")
            shape_param = t.get("shape_param", 0)
            boards.append(board_row(
                t, n + 1, W, H, T,
                lock=t["lock"][n], alpha0=t["alpha0"][n], hp=t["hp"][n],
                density=t["density"][n],
                boss=t["boss"][n] if t["boss"] else None,
                givens=t["givens"][n] if t.get("givens") else None,
                cells_override=t["cells"][n] if t.get("cells") else None,
                sets=t["sets"][n] if t.get("sets") else None,
            ))
        monotone(boards)

        # The continuation. Built from the same function against continued
        # schedules, then made monotone against board 10 so the step off the
        # end of the ladder is a step up like every other.
        # Walk the whole schedule horizon, make it monotone, and only THEN
        # drop the repeats. The order matters: two candidates can differ only
        # in an alpha-scaled threshold, and monotone() is what lifts the later
        # one up to the earlier and makes them the same board. Deduplicating
        # first would let that pair through.
        candidates = []
        floor_C = cumulative_exp(boards[-1]["quantity"])
        for row in extend(t):
            cand = board_row(
                t, 0, row["size"][0], row["size"][1], row["tiers"],
                lock=row["lock"], alpha0=row["alpha0"], hp=row["hp"],
                density=row["density"], boss=row.get("boss"),
                givens=row.get("givens"), cells_override=row.get("cells"),
                sets=row.get("sets"),
            )
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

        out.append(dict(
            id=t["id"], name=t["name"], tint=t["tint"], axis=t["axis"],
            blurb=t["blurb"], archetype=t["archetype"],
            search=t.get("search", False),
            postgame=t["id"] in POSTGAME,
            placement=t.get("placement", "uniform"),
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
            requires=UNLOCKS[t["id"]],
            # Boards cleared anywhere, counting each once. 0 means no such gate.
            requires_boards=UNLOCK_BOARDS.get(t["id"], 0),
            # Full Runs completed on distinct types. 0 means no such gate.
            requires_runs=UNLOCK_RUNS.get(t["id"], 0),
            boards=boards,
            # Boards 11..N. Unlocked by clearing board 10, and deliberately
            # NOT part of `boards`: the ladder is ten, a Full Run is ten, and
            # clearing the type is still board 10.
            extended=extended,
        ))
    order = {k: i for i, k in enumerate(MAINLINE + MAGIC + TOPOLOGY + PUZZLE + POSTGAME)}
    out.sort(key=lambda t: order[t["id"]])
    return out


if __name__ == "__main__":
    data = build()
    with open(DATA / "ladders.json", "w", encoding="utf-8") as f:
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
