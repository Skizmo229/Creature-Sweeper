# 0055. Augur is Echo, built, and priced at its paper value because value as played is nil

2026-09-27. Status: adopted. The answer leaves out open neighbours since 0062, and lists every
hidden tier, at 50 mana, since 0087.

## Context
The owner asked for game types that focus on magic, and the design reference had carried a spell
on paper since the start: Echo, "highest tier present in a 3x3, bounds the danger without solving
the layout", at 6 mana on the pre-tripling scale. Its name could not be built, because a spell's
shortcut is its first letter (decision 0006) and E is Exercise's. Augur is Echo under a free letter.

What it does: the strongest tier among a cell's neighbours, open ones included, kept in
`Cell.augur` and drawn as a cream badge in the cell's top-right corner, the mirror of Census's.
Sweep reads it as a proof, since nothing hidden there is above it: at or below your level the ring
is free (`provenByAugur`). The graded player's `augur-cap` trick does the same and, above the
level, narrows the pencil to the tiers at or below the answer; the honest player caps its guesses
with it. Neither player is aimed at a number whose ring the answer could not free (the residual is
already spread thinner than the level allows), since there the answer can only cap a guess.

Measured 27 September 2026:

- The graded player at grade 4 on AUGUR's boards 4 to 10, 30 seeds each, casting only where a
  ring could be all at or below its level, cast 67 times; the strongest was at or below the level
  once. As played, the spell frees nothing.
- The honest player on ARCANE with Augur added to its loadout, 40 seeds a board: Reveal saves
  1.40 HP a cast (0.0186 a mana); Census as played 0.000, where it demonstrably helps 1.60 a cast
  at 0.07 spots a board; Augur as played 0.000, where it demonstrably helps 2.29 a cast at 0.05
  spots a board.

So the method that priced Beacon (decision 0037), HP saved a mana against Reveal's as played,
gives no answer here: at any price the spell changes no decision the honest player makes, exactly
as Census does not. Census kept its paper price on the tripled scale (decision 0013) for the same
reason, and its worth is what a thinking player makes of sum plus count.

## Decision
Augur costs 20: Echo's paper 6 on decision 0013's tripled scale, rounded to the table's grain.
Offered cheapest first, the row is Augur, Census, Reveal, Beacon, Exercise; the shortcut is A.

## Consequences
The cheapest spell is now 20, so the affordability floor (`test/spells.test.ts`) is easier to meet
and says less; the dearest is still Exercise. Starting mana stays 75. The instruments undervalue
Augur and Census alike, since neither models "sum, count and strongest together pin the layout"
beyond the ring proof and the pencil's narrowing; the trick that reads count and ceiling together
is open. If Augur should bite harder, the design lever is the answer (the strongest *hidden*
neighbour would be marginally sharper) rather than the price. `AUGUR_COLOR` sits at least 117 RGB
units from every annotation colour and every look's `hot` (decision 0032's rule); a new palette
must keep clear of it too. Related: decision 0056, the ladder that carries it.
