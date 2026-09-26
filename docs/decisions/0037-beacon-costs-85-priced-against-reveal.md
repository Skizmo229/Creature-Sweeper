# 0037. Beacon costs 85, priced where a mana of it buys what a mana of Reveal does

2026-09-25. Status: adopted. Replaces Beacon's price in 0013; settles the tuning open question it
raised.

## Context
At 300, Beacon was affordable at 2% of ORACLE's stuck points (measured 24 September), so ORACLE
effectively offered three spells, and too few casts happened to say what the spell was worth. The
owner asked for a new price. `docs/extending.md` prices a spell by value: correct when its HP saved
per mana matches Reveal's.

Measured 25 September 2026 with the honest player on ORACLE, the one ladder that offers both, all
ten boards at 80 seeds each, each spell alone against playing spell-less on the same seeds:

| Price | Casts a board | HP saved a cast | HP saved a mana | Boards cleared |
| --- | ---: | ---: | ---: | ---: |
| none | | | | 46.0% |
| Reveal at 75 | 1.37 | 0.53 | 0.0070 | 52.0% |
| Beacon at 60 | 1.39 | 0.60 | 0.0101 | 55.6% |
| Beacon at 75 | 1.17 | 0.69 | 0.0091 | 54.9% |
| Beacon at 80 | 1.05 | 0.64 | 0.0080 | 53.5% |
| Beacon at 85 | 0.91 | 0.57 | 0.0067 | 51.9% |
| Beacon at 90 | 0.79 | 0.54 | 0.0060 | 50.4% |
| Beacon at 100 | 0.64 | 0.49 | 0.0049 | 49.3% |

At 40 seeds, 120 to 200 measured 0.0040 to 0.0049 a mana, and 300 cast four times in 400 games.
Reveal's rate on ORACLE (0.0070) is the comparison, not its 0.0129 over every magic ladder, because
ORACLE's boards are where a Beacon is cast.

## Decision
Beacon costs 85: 0.0067 HP a mana against Reveal's 0.0070, and the same share of boards cleared.

## Consequences
Beacon is worth a little more a cast than Reveal and costs a little more. Offered cheapest first,
the row is now Census, Reveal, Beacon, Exercise; the shortcut is still B. Exercise becomes the
dearest spell; the affordability floors are unchanged, since DUNGEON, which has no Beacon, sets
both. Starting mana stays 75, one Reveal, so Beacon is never bought before the first income. The
price table is no longer 0013's tripled 10 / 25 / 50 / 100. The measurement is the honest player
casting Beacon alone; a player holding Reveal too would split the mana, which this does not model.
