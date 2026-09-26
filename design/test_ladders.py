"""The ladder generator's own checks.

`ladders.py` is where every tuning number comes from, and until these it was checked only
downstream, by the TypeScript tests reading the JSON it writes. These hold the generator to the
rules it exists to keep: the tuning identity (the top `lock` thresholds equal C_k exactly), the
zero-damage precondition (every threshold at or below C_k), thresholds that never ease from one
board to the next, and a continuation that never undoes what the tuned ladder chose.
docs/invariants.md says why each matters.

    python -m unittest discover -s design -p "test_*.py"
"""

import math
import unittest

import ladders as L

BUILT = L.build()


def rows(t):
    """Every board a type offers: the tuned ten, then the continuation."""
    return t["boards"] + t["extended"]


class TheSchema(unittest.TestCase):
    """`load_types` refuses a schedule file that would build a board nobody tuned."""

    def refuses(self, edit, message):
        import os
        import tempfile

        src = (L.HERE / "ladder_types.toml").read_text(encoding="utf-8")
        bad = edit(src)
        self.assertNotEqual(bad, src, "the edit must change the file")
        with tempfile.NamedTemporaryFile("w", suffix=".toml", delete=False, encoding="utf-8") as f:
            f.write(bad)
        try:
            with self.assertRaisesRegex(ValueError, message):
                L.load_types(f.name)
        finally:
            os.unlink(f.name)

    def test_a_missing_field(self):
        self.refuses(
            lambda s: s.replace('axis = "The classic game"\n', "", 1),
            r"normal: missing \['axis'\]",
        )

    def test_an_unknown_field(self):
        self.refuses(
            lambda s: s.replace('id = "normal"', 'id = "normal"\nlocks = [2]', 1),
            r"normal: missing \[\], unknown \['locks'\]",
        )

    def test_a_schedule_that_is_not_ten_long(self):
        self.refuses(
            lambda s: s.replace("lock = [2, 2, 2, 2, 2, 3, 3, 3, 3, 3]", "lock = [2, 2, 3]", 1),
            r"normal: lock has 3 entries",
        )


class Apportioning(unittest.TestCase):
    def test_distribute_lands_the_total_and_leaves_no_tier_empty(self):
        for total in (6, 17, 100, 333):
            for weights in (L.shape_descending(5), L.shape_flat(6), [3, 1, 1, 5]):
                q = L.distribute(total, weights)
                self.assertEqual(sum(q), total)
                self.assertTrue(all(n >= 1 for n in q), q)

    def test_distribute_pins_the_boss_count(self):
        q = L.distribute(50, L.shape_descending(5, boss=1), boss_count=2)
        self.assertEqual(q[-1], 2)
        self.assertEqual(sum(q), 50)

    def test_distribute_parity_splits_the_colours_within_one(self):
        for total in (40, 41, 97):
            q = L.distribute_parity(total, L.shape_descending(6))
            odd = sum(n for i, n in enumerate(q) if (i + 1) % 2 == 1)
            even = sum(n for i, n in enumerate(q) if (i + 1) % 2 == 0)
            self.assertEqual(odd + even, total)
            # An odd total gives the extra creature to the dark squares, where tier 1 is.
            self.assertEqual(odd - even, total % 2)

    def test_the_descent_reproduces_the_originals_floors(self):
        self.assertEqual([round(x) for x in L.shape_descending(5)], [5, 4, 3, 2, 1])
        nine = L.shape_descending(9, boss=1)
        self.assertEqual((round(nine[0]), round(nine[-1])), (8, 2))


class Thresholds(unittest.TestCase):
    def test_cumulative_exp_weights_a_tier_by_two_to_its_rank(self):
        self.assertEqual(L.cumulative_exp([1, 1, 1]), [1, 3, 7])
        self.assertEqual(L.cumulative_exp([4, 3, 2]), [4, 10, 18])

    def test_exp_array_locks_the_top_gates_to_c_k_and_keeps_the_rest_below(self):
        q = [30, 20, 12, 6, 2]
        C = L.cumulative_exp(q)
        for lock in range(0, 5):
            exp = L.exp_array(q, lock, alpha0=0.4)
            self.assertEqual(len(exp), len(q) - 1)
            for k, e in enumerate(exp):
                self.assertLessEqual(e, C[k])
            if lock:
                self.assertEqual(exp[-lock:], C[len(q) - 1 - lock : len(q) - 1])
            self.assertEqual(exp, sorted(set(exp)), "thresholds must strictly rise")

    def test_damage_is_a_staircase_and_free_at_or_below_your_level(self):
        self.assertIsNone(L.damage(0, 3))
        for level in range(1, 10):
            for tier in range(1, 10):
                expected = tier * (math.ceil(tier / level) - 1)
                self.assertEqual(L.damage(level, tier), expected)
                if tier <= level:
                    self.assertEqual(L.damage(level, tier), 0)


class TheBuiltLadders(unittest.TestCase):
    def test_every_type_has_ten_tuned_boards_numbered_in_order(self):
        for t in BUILT:
            self.assertEqual([b["n"] for b in rows(t)], list(range(1, len(rows(t)) + 1)), t["id"])
            self.assertEqual(len(t["boards"]), 10, t["id"])

    def test_every_board_carries_its_own_counts(self):
        for t in BUILT:
            for b in rows(t):
                where = f"{t['id']}#{b['n']}"
                self.assertEqual(len(b["quantity"]), b["tiers"], where)
                self.assertEqual(sum(b["quantity"]), b["monsters"], where)
                self.assertLessEqual(b["monsters"], b["cells"], where)

    def test_the_tuning_identity_and_the_zero_damage_precondition(self):
        for t in BUILT:
            if t["search"]:
                continue
            for b in rows(t):
                where = f"{t['id']}#{b['n']}"
                C = L.cumulative_exp(b["quantity"])
                self.assertEqual(len(b["exp"]), b["tiers"] - 1, where)
                for k, e in enumerate(b["exp"]):
                    self.assertLessEqual(e, C[k], f"{where}: threshold {k + 1} above C_k")
                if b["lock"]:
                    top = b["exp"][-b["lock"] :]
                    self.assertEqual(top, C[b["tiers"] - 1 - b["lock"] : b["tiers"] - 1], where)

    def test_no_later_board_is_easier_on_any_threshold(self):
        for t in BUILT:
            if t["search"]:
                continue
            boards = rows(t)
            for prev, cur in zip(boards, boards[1:]):
                for k in range(min(len(prev["exp"]), len(cur["exp"]))):
                    self.assertGreaterEqual(
                        cur["exp"][k], prev["exp"][k], f"{t['id']}#{cur['n']} threshold {k + 1}"
                    )


class TheContinuation(unittest.TestCase):
    def test_never_drops_the_tier_count(self):
        for t in BUILT:
            boards = rows(t)
            for prev, cur in zip(boards, boards[1:]):
                self.assertGreaterEqual(cur["tiers"], prev["tiers"], f"{t['id']}#{cur['n']}")

    def test_never_takes_a_c_k_backwards_on_a_battle_ladder(self):
        # A board offering less EXP at any tier than the one before it could not meet thresholds
        # lifted to match. Search ladders are exempt: they have no thresholds, and BLIND's tuned
        # ten already step C_1 backwards as its tier count rises.
        for t in BUILT:
            if t["search"]:
                continue
            boards = rows(t)
            for prev, cur in zip(boards, boards[1:]):
                was, now = L.cumulative_exp(prev["quantity"]), L.cumulative_exp(cur["quantity"])
                for k in range(min(len(was), len(now))):
                    self.assertGreaterEqual(now[k], was[k], f"{t['id']}#{cur['n']} C_{k + 1}")

    def test_never_takes_hp_below_the_floor_the_tuned_ladder_chose(self):
        for t in BUILT:
            floor = min(b["hp"] for b in t["boards"])
            for b in t["extended"]:
                self.assertGreaterEqual(b["hp"], floor, f"{t['id']}#{b['n']}")

    def test_stays_inside_the_ceilings(self):
        # A ladder may set its own box (a square one for a round outline), never a bigger board
        # than the global one, unless its own tuned ladder already is (CARD's).
        for t in BUILT:
            over = next(x for x in L.TYPES if x["id"] == t["id"]).get("ceiling", {})
            last = t["boards"][-1]
            area = max(L.CEILINGS["max_w"] * L.CEILINGS["max_h"], last["w"] * last["h"])
            for b in t["extended"]:
                where = f"{t['id']}#{b['n']}"
                self.assertLessEqual(b["w"], over.get("max_w", L.CEILINGS["max_w"]), where)
                self.assertLessEqual(b["h"], over.get("max_h", L.CEILINGS["max_h"]), where)
                self.assertLessEqual(b["w"] * b["h"], area, where)
                self.assertLessEqual(b["tiers"], L.CEILINGS["tier"], where)

    def test_keeps_a_checkerboard_even(self):
        for t in BUILT:
            if t.get("placement") != "checker":
                continue
            for b in rows(t):
                self.assertEqual((b["w"] * b["h"]) % 2, 0, f"{t['id']}#{b['n']}")

    def test_keeps_a_pyramid_twice_as_wide_as_it_is_tall(self):
        for t in BUILT:
            if t.get("shape") != "pyramid":
                continue
            for b in rows(t):
                self.assertEqual(b["w"], 2 * b["h"], f"{t['id']}#{b['n']}")
                self.assertEqual(b["cells"], b["h"] * (b["h"] + 1), f"{t['id']}#{b['n']}")

    def test_keeps_the_givens_above_the_sudoku_generators_floor(self):
        for t in BUILT:
            if t.get("placement") != "sudoku":
                continue
            for b in t["extended"]:
                self.assertGreaterEqual(b["givens"], 12, f"{t['id']}#{b['n']}")


if __name__ == "__main__":
    unittest.main()
